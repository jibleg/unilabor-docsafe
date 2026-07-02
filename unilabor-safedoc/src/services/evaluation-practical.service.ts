import pool from '../config/db';
import { tryIssueCertificate } from './evaluation-attempt.service';

/**
 * Captura directa de evaluaciones PRACTICAS (capacitacion presencial, Sprint 40).
 *
 * A diferencia del quiz, aqui no hay cuestionario: RH captura la calificacion
 * (escala 0-10) de uno o varios colaboradores en una sola operacion ("acta de
 * capacitacion"). Por cada resultado se crea una asignacion ya resuelta en estado
 * terminal (passed/failed) y, si acredita (>= passing_score), se emite y archiva la
 * constancia reusando el MISMO motor que el quiz (tryIssueCertificate). No genera
 * snapshot de preguntas ni notifica a RH en caso de reprobado (RH es quien captura).
 */

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

export interface PracticalResultInput {
  employee_id: number;
  score: number; // 0-10 (admite 1 decimal)
}

export interface PracticalCaptureRow {
  employee_id: number;
  assignment_id: number;
  status: 'passed' | 'failed';
  score: number;
  percentage: number;
  certificate_document_id: number | null;
}

export interface PracticalCaptureSummary {
  acreditados: number;
  no_acreditados: number;
  constancias_emitidas: number;
  reemplazados: number;
  results: PracticalCaptureRow[];
}

/**
 * Helper puro: dada una nota 0-10 y el umbral (passing_score en base 100),
 * calcula el porcentaje entero equivalente (nota*10) y resuelve passed/failed.
 * Exportado para pruebas unitarias sin base de datos.
 */
export const resolvePracticalOutcome = (
  score: number,
  passingScore: number,
): { percentage: number; passed: boolean; status: 'passed' | 'failed' } => {
  const percentage = Math.round(score * 10);
  const passed = percentage >= passingScore;
  return { percentage, passed, status: passed ? 'passed' : 'failed' };
};

export const capturePracticalResults = async (
  templateId: number,
  capturedAt: string | null,
  results: PracticalResultInput[],
  createdByUserId: string | null,
): Promise<PracticalCaptureSummary> => {
  // Plantilla practica activa: define el umbral de aprobacion.
  const templateResult = await pool.query(
    `SELECT id, is_active, evaluation_type, passing_score, window_hours
       FROM public.evaluation_templates WHERE id = $1 LIMIT 1;`,
    [templateId],
  );
  if (templateResult.rows.length === 0) {
    throwCoded('EVAL_TEMPLATE_NOT_FOUND');
  }
  const template = templateResult.rows[0];
  if (!template.is_active) {
    throwCoded('EVAL_TEMPLATE_NOT_PUBLISHED');
  }
  if (String(template.evaluation_type) !== 'practical') {
    throwCoded('EVAL_TEMPLATE_NOT_PRACTICAL');
  }
  const passingScore = Number(template.passing_score);
  const windowHours = Number(template.window_hours);

  // Dedupe por colaborador (gana la ultima captura del lote).
  const byEmployee = new Map<number, PracticalResultInput>();
  for (const item of results) {
    const employeeId = Number(item.employee_id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      continue;
    }
    byEmployee.set(employeeId, { employee_id: employeeId, score: Number(item.score) });
  }
  const deduped = [...byEmployee.values()];
  if (deduped.length === 0) {
    throwCoded('EVAL_PRACTICAL_NO_RESULTS');
  }

  // Todos los colaboradores deben existir y estar activos.
  const employeeIds = deduped.map((r) => r.employee_id);
  const activeResult = await pool.query(
    `SELECT id FROM public.employees WHERE id = ANY($1::bigint[]) AND is_active = TRUE;`,
    [employeeIds],
  );
  const activeSet = new Set(activeResult.rows.map((row) => Number(row.id)));
  const missing = employeeIds.filter((id) => !activeSet.has(id));
  if (missing.length > 0) {
    throwCoded('EVAL_PRACTICAL_EMPLOYEE_NOT_FOUND');
  }

  const summary: PracticalCaptureSummary = {
    acreditados: 0,
    no_acreditados: 0,
    constancias_emitidas: 0,
    reemplazados: 0,
    results: [],
  };

  for (const item of deduped) {
    if (item.score < 0 || item.score > 10) {
      throwCoded('EVAL_PRACTICAL_SCORE_OUT_OF_RANGE');
    }
    const { percentage, passed, status } = resolvePracticalOutcome(item.score, passingScore);

    const client = await pool.connect();
    let assignmentId: number;
    let wasReplace = false;
    try {
      await client.query('BEGIN');

      // Recaptura = CORRECCION: si ya existe una asignacion para (plantilla, colaborador)
      // se reemplaza en el lugar (sin duplicar filas ni inflar la trazabilidad). Si no, se crea.
      const existing = await client.query(
        `SELECT id, certificate_document_id
           FROM public.evaluation_assignments
          WHERE template_id = $1 AND employee_id = $2
          ORDER BY id DESC LIMIT 1 FOR UPDATE;`,
        [templateId, item.employee_id],
      );

      if (existing.rows.length > 0) {
        wasReplace = true;
        assignmentId = Number(existing.rows[0].id);
        const oldCertificateId = existing.rows[0].certificate_document_id
          ? Number(existing.rows[0].certificate_document_id)
          : null;

        // Se limpia certificate_document_id para que la emision pueda regenerar la
        // constancia con la nota corregida (si sigue acreditando).
        await client.query(
          `UPDATE public.evaluation_assignments
              SET status = $2,
                  available_at = COALESCE($3::timestamptz, NOW()),
                  deadline_at = COALESCE($3::timestamptz, NOW()) + ($4 || ' hours')::interval,
                  submitted_at = COALESCE($3::timestamptz, NOW()),
                  graded_at = COALESCE($3::timestamptz, NOW()),
                  score = $5, max_score = 100, percentage = $6,
                  certificate_document_id = NULL, updated_at = NOW()
            WHERE id = $1;`,
          [assignmentId, status, capturedAt, windowHours, percentage, percentage],
        );

        // Si la correccion deja al colaborador NO acreditado, se revoca la constancia
        // previa (la emision no correra al no estar 'passed'). Si sigue acreditado, la
        // emision la supersede sola por reference_key.
        if (!passed && oldCertificateId) {
          await client.query(
            `UPDATE public.employee_documents
                SET status = 'superseded', is_current = FALSE, updated_at = NOW()
              WHERE id = $1;`,
            [oldCertificateId],
          );
        }
      } else {
        // Estado terminal desde el inicio: la constancia solo depende de status='passed'.
        // available_at/deadline_at se fijan en la fecha de la capacitacion para trazabilidad.
        const inserted = await client.query(
          `INSERT INTO public.evaluation_assignments
             (template_id, employee_id, status, available_at, deadline_at, submitted_at, graded_at,
              score, max_score, percentage, created_by_user_id)
           VALUES ($1, $2, $3,
                   COALESCE($4::timestamptz, NOW()),
                   COALESCE($4::timestamptz, NOW()) + ($5 || ' hours')::interval,
                   COALESCE($4::timestamptz, NOW()),
                   COALESCE($4::timestamptz, NOW()),
                   $6, 100, $7, $8)
           RETURNING id;`,
          [templateId, item.employee_id, status, capturedAt, windowHours, percentage, percentage, createdByUserId],
        );
        assignmentId = Number(inserted.rows[0]?.id);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      throw error;
    }
    client.release();

    // Emision de constancia best-effort, fuera de la transaccion (mismo hook que quiz).
    // En una correccion acreditada, supersede la constancia anterior y emite la vigente.
    const certificateDocumentId = await tryIssueCertificate(assignmentId, passed);

    if (wasReplace) {
      summary.reemplazados += 1;
    }
    if (passed) {
      summary.acreditados += 1;
      if (certificateDocumentId) {
        summary.constancias_emitidas += 1;
      }
    } else {
      summary.no_acreditados += 1;
    }
    summary.results.push({
      employee_id: item.employee_id,
      assignment_id: assignmentId,
      status,
      score: item.score,
      percentage,
      certificate_document_id: certificateDocumentId,
    });
  }

  return summary;
};
