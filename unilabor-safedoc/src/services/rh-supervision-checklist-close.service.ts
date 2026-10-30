import fs from 'fs';
import pool from '../config/db';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { captureEnrollmentPractical } from './rh-induction-practical.service';
import { buildSupervisionChecklistPdf } from './rh-supervision-checklist.pdf';
import { practicalScoreFromPct, SUPERVISION_CONCLUSION_LABELS } from './rh-supervision-checklist.rules';
import { assertIndependentSigners } from './rh-supervision-signers.service';
import {
  getSupervisionChecklist,
  updateSupervisionChecklist,
  type SupervisionChecklistRecord,
  type UpdateSupervisionChecklistInput,
} from './rh-supervision-checklist.service';

// -----------------------------------------------------------------------------
// Cierre de la lista ANA-REG-060: sella los totales, guarda las firmas
// digitales, genera el PDF oficial, lo archiva en el expediente del colaborador
// y, cuando la lista es la FINAL de una inscripcion de la Fase 6, captura la
// calificacion en la evaluacion practica del puesto (motor existente: emite la
// constancia, marca el checklist REH-REG-005 y activa el siguiente puesto).
// Dos caminos: RH cierra en una sola sesion con ambas firmas (DRAFT -> CLOSED),
// o el supervisor firma con su cuenta (DRAFT -> SUPERVISOR_SIGNED) y despues el
// responsable del area avala con la suya (SUPERVISOR_SIGNED -> CLOSED).
// Una lista cerrada nunca se modifica ni se borra.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface CloseSupervisionChecklistInput {
  id: number;
  /** Obligatoria si la lista sigue en borrador; se ignora si el supervisor ya firmo. */
  supervisorSignature?: string | null | undefined;
  areaResponsibleSignature: string;
  employeeSignature?: string | null;
  /** Decide la Fase 6 de la inscripcion. Default: true si la lista esta ligada a una inscripcion. */
  isFinal?: boolean | undefined;
  /** Ultimos cambios de cabecera que llegan junto con el cierre. */
  header?: UpdateSupervisionChecklistInput | undefined;
  closedByUserId: string;
  /** true = el responsable del area avalo con su propia cuenta (Mis supervisiones); si RH recaba el aval, queda solo closed_by. */
  endorsedByOwnAccount?: boolean | undefined;
}

export interface SupervisionPracticalOutcome {
  captured: boolean;
  status: 'passed' | 'failed' | null;
  score: number | null;
  message: string;
}

export interface CloseSupervisionChecklistResult {
  record: SupervisionChecklistRecord;
  practical: SupervisionPracticalOutcome | null;
}

/** La inscripcion debe poder recibir la nota: fase publicada y practica del puesto publicada. */
const assertPracticalAvailable = async (enrollmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT p.published_at, t.id AS template_id
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
       LEFT JOIN LATERAL (
         SELECT id FROM public.evaluation_templates
          WHERE training_course_id = COALESCE(e.training_course_id, p.training_course_id)
            AND evaluation_type = 'practical' AND status = 'published' AND is_active = TRUE
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  const row = result.rows[0];
  if (!row) {
    throwCoded('RH_SUPERVISION_ENROLLMENT_NOT_FOUND', 'La inscripcion de la Fase 6 ya no existe.');
  }
  if (!row.published_at) {
    throwCoded('RH_SUPERVISION_PHASE_NOT_PUBLISHED', 'La Fase 6 sigue en borrador; publicala antes de cerrar la lista final.');
  }
  if (!row.template_id) {
    throwCoded(
      'RH_SUPERVISION_PRACTICAL_NOT_AVAILABLE',
      'El puesto no tiene una evaluacion practica publicada en la Fase 6; habilitala en Capacitaciones del puesto antes de cerrar la lista final.',
    );
  }
};

const resolveFallbackUserId = async (): Promise<string | null> => {
  const admin = await pool.query(
    `SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].id) : null;
};

/** Requisitos comunes para firmar: datos completos, items calificados y firmantes independientes. */
const assertReadyToSign = (record: SupervisionChecklistRecord): void => {
  if (!record.supervisor_name.trim()) {
    throwCoded('RH_SUPERVISION_SUPERVISOR_REQUIRED', 'Captura el nombre del supervisor / auditor.');
  }
  if (!record.area_responsible_name.trim()) {
    throwCoded('RH_SUPERVISION_RESPONSIBLE_REQUIRED', 'Captura el nombre del responsable del area.');
  }
  if (record.summary.pending > 0) {
    throwCoded('RH_SUPERVISION_ITEMS_PENDING', `Faltan ${record.summary.pending} item(s) por calificar (Si, No o N/A).`);
  }
  if (record.summary.evaluated === 0 || record.summary.compliance_pct === null || !record.summary.conclusion) {
    throwCoded('RH_SUPERVISION_NOTHING_EVALUATED', 'Todos los items quedaron en N/A; la lista debe evaluar al menos un aspecto.');
  }
  if (record.sgc_follow_up_required && !record.sgc_reference?.trim()) {
    throwCoded('RH_SUPERVISION_SGC_REFERENCE_REQUIRED', 'Indica la referencia o descripcion de la situacion que requiere gestion del SGC.');
  }
  assertIndependentSigners(record);
};

const readStoredSupervisorSignaturePath = async (id: number): Promise<string | null> => {
  const result = await pool.query(`SELECT supervisor_signature_path FROM public.rh_supervision_checklists WHERE id = $1 LIMIT 1;`, [id]);
  return result.rows[0]?.supervisor_signature_path ? String(result.rows[0].supervisor_signature_path) : null;
};

const readStoredSupervisorSignature = async (id: number): Promise<Buffer | null> => {
  const filePath = await readStoredSupervisorSignaturePath(id);
  try {
    return filePath ? fs.readFileSync(filePath) : null;
  } catch {
    return null;
  }
};

/**
 * Paso 1 del cierre en dos firmas: el supervisor asignado califico todo y firma
 * con su cuenta. La lista queda bloqueada esperando el aval del responsable.
 */
export const signSupervisionAsSupervisor = async (input: {
  id: number;
  signature: string;
  header?: UpdateSupervisionChecklistInput | undefined;
  userId: string;
}): Promise<SupervisionChecklistRecord> => {
  let record = await getSupervisionChecklist(input.id);
  if (record.status !== 'DRAFT') {
    throwCoded('RH_SUPERVISION_SUPERVISOR_SIGNED', 'La lista ya fue firmada por el supervisor.');
  }
  if (input.header) {
    record = await updateSupervisionChecklist(input.id, input.header);
  }
  assertReadyToSign(record);
  const png = decodeSignaturePng(input.signature);
  if (!png) {
    throwCoded('RH_SUPERVISION_INVALID_SIGNATURE', 'Traza tu firma para firmar la lista.');
  }
  const signaturePath = writeSignaturePng(png!, 'SUP-ANA060');
  const updated = await pool.query(
    `UPDATE public.rh_supervision_checklists
        SET status = 'SUPERVISOR_SIGNED', supervisor_signature_path = $2, supervisor_user_id = $3, supervisor_signed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'DRAFT' RETURNING id;`,
    [input.id, signaturePath, input.userId],
  );
  if (updated.rows.length === 0) {
    try {
      fs.unlinkSync(signaturePath);
    } catch {
      /* limpieza best-effort */
    }
    throwCoded('RH_SUPERVISION_SUPERVISOR_SIGNED', 'La lista ya fue firmada por el supervisor.');
  }
  return getSupervisionChecklist(input.id);
};

export const closeSupervisionChecklist = async (input: CloseSupervisionChecklistInput): Promise<CloseSupervisionChecklistResult> => {
  let record = await getSupervisionChecklist(input.id);
  if (record.status === 'CLOSED') {
    throwCoded('RH_SUPERVISION_ALREADY_CLOSED', 'La lista ya esta cerrada y firmada.');
  }
  if (input.header && record.status === 'DRAFT') {
    record = await updateSupervisionChecklist(input.id, input.header);
  }
  assertReadyToSign(record);

  const isFinal = input.isFinal ?? record.enrollment_id !== null;
  if (isFinal && !record.enrollment_id) {
    throwCoded('RH_SUPERVISION_FINAL_WITHOUT_ENROLLMENT', 'Solo una lista ligada a una inscripcion de la Fase 6 puede ser la final.');
  }
  if (isFinal && record.enrollment_id) {
    await assertPracticalAvailable(record.enrollment_id);
  }

  const supervisorPng =
    record.status === 'SUPERVISOR_SIGNED' ? await readStoredSupervisorSignature(record.id) : decodeSignaturePng(input.supervisorSignature ?? '');
  const areaPng = decodeSignaturePng(input.areaResponsibleSignature);
  if (!supervisorPng || !areaPng) {
    throwCoded('RH_SUPERVISION_INVALID_SIGNATURE', 'Las firmas del supervisor y del responsable del area son obligatorias.');
  }
  const employeePng = input.employeeSignature ? decodeSignaturePng(input.employeeSignature) : null;
  if (input.employeeSignature && !employeePng) {
    throwCoded('RH_SUPERVISION_INVALID_SIGNATURE', 'La firma del colaborador esta vacia; borrala o vuelve a trazarla.');
  }

  const closedAt = new Date();
  const summary = record.summary;
  const conclusionLabel = SUPERVISION_CONCLUSION_LABELS[summary.conclusion!];
  const pdf = await buildSupervisionChecklistPdf({
    record: { ...record, status: 'CLOSED', closed_at: closedAt.toISOString(), is_final: isFinal, compliance_pct: summary.compliance_pct, conclusion: summary.conclusion, passed: summary.passed },
    draft: false,
    generatedAt: closedAt,
    signatures: { supervisor: supervisorPng!, areaResponsible: areaPng!, employee: employeePng },
  });

  const uploadedByUserId = input.closedByUserId || (await resolveFallbackUserId()) || throwCoded('RH_SUPERVISION_USER_NOT_FOUND');
  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: record.employee_id,
    documentTypeCode: 'SUPERVISION_ANA060',
    referenceKey: `supervision:${record.id}`,
    title: `${record.form_code} ${record.folio} · ${record.position_code} · ${conclusionLabel}`,
    description:
      `${record.enrollment_id ? 'Fase 6 de Induccion' : 'Supervision de area'} · ${record.position_name} · ` +
      `${summary.compliant}/${summary.evaluated} conformes (${summary.compliance_pct!.toFixed(2)} %) · supervisor ${record.supervisor_name}`,
    pdf,
    uploadedByUserId,
  });

  const storedSupervisorPath = record.status === 'SUPERVISOR_SIGNED' ? await readStoredSupervisorSignaturePath(record.id) : null;
  const paths = {
    supervisor: storedSupervisorPath ?? writeSignaturePng(supervisorPng!, 'SUP-ANA060'),
    area: writeSignaturePng(areaPng!, 'SUP-ANA060'),
    employee: employeePng ? writeSignaturePng(employeePng, 'SUP-ANA060') : null,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isFinal && record.enrollment_id) {
      await client.query(`UPDATE public.rh_supervision_checklists SET is_final = FALSE WHERE enrollment_id = $1 AND is_final = TRUE;`, [
        record.enrollment_id,
      ]);
    }
    await client.query(
      `UPDATE public.rh_supervision_checklists
          SET status = 'CLOSED', items_evaluated = $2, items_compliant = $3, items_non_compliant = $4, compliance_pct = $5,
              conclusion = $6, passed = $7, is_final = $8, supervisor_signature_path = $9, area_responsible_signature_path = $10,
              employee_signature_path = $11, closed_at = $12, closed_by_user_id = $13, document_id = $14,
              area_responsible_user_id = $15, updated_at = NOW()
        WHERE id = $1 AND status IN ('DRAFT', 'SUPERVISOR_SIGNED');`,
      [
        record.id,
        summary.evaluated,
        summary.compliant,
        summary.non_compliant,
        summary.compliance_pct,
        summary.conclusion,
        summary.passed,
        isFinal,
        paths.supervisor,
        paths.area,
        paths.employee,
        closedAt,
        input.closedByUserId,
        documentId,
        input.endorsedByOwnAccount ? input.closedByUserId : null,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    for (const filePath of [storedSupervisorPath ? null : paths.supervisor, paths.area, paths.employee]) {
      try {
        filePath && fs.existsSync(filePath) && fs.unlinkSync(filePath);
      } catch {
        /* limpieza best-effort */
      }
    }
    throw error;
  } finally {
    client.release();
  }

  // Nota a la practica de la Fase 6 (fuera de la transaccion: emite constancia,
  // checklist y siguiente puesto). Si fallara, la lista ya es evidencia cerrada
  // y RH puede capturar la nota a mano desde el tablero.
  let practical: SupervisionPracticalOutcome | null = null;
  if (isFinal && record.enrollment_id) {
    const score = practicalScoreFromPct(summary.compliance_pct!);
    try {
      const captured = await captureEnrollmentPractical({
        enrollmentId: record.enrollment_id,
        score,
        capturedAt: `${record.supervision_date}T12:00:00-06:00`,
        actorUserId: input.closedByUserId,
      });
      practical = {
        captured: true,
        status: captured.status,
        score: captured.score,
        message:
          captured.status === 'passed'
            ? `Fase 6 del puesto ${record.position_code} acreditada con ${summary.compliance_pct!.toFixed(2)} % (${score}/10).`
            : `Fase 6 del puesto ${record.position_code} NO acreditada: ${summary.compliance_pct!.toFixed(2)} % (minimo 80 %).`,
      };
    } catch (error: any) {
      console.error(`ANA-REG-060 ${record.folio}: no se pudo capturar la practica de la inscripcion ${record.enrollment_id}:`, error);
      practical = {
        captured: false,
        status: null,
        score,
        message: error?.publicMessage || 'La lista quedo cerrada, pero no se pudo registrar la calificacion en la Fase 6; capturala desde el tablero.',
      };
    }
  }

  return { record: await getSupervisionChecklist(record.id), practical };
};

/** PDF de consulta: cerrada con sus firmas (si siguen en disco) o borrador con marca de agua. */
export const renderSupervisionChecklistPdf = async (id: number): Promise<{ record: SupervisionChecklistRecord; pdf: Buffer }> => {
  const record = await getSupervisionChecklist(id);
  const readPng = async (filePath: string | null): Promise<Buffer | null> => {
    if (!filePath) return null;
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  };
  let signatures = { supervisor: null as Buffer | null, areaResponsible: null as Buffer | null, employee: null as Buffer | null };
  if (record.status !== 'DRAFT') {
    const result = await pool.query(
      `SELECT supervisor_signature_path, area_responsible_signature_path, employee_signature_path
         FROM public.rh_supervision_checklists WHERE id = $1 LIMIT 1;`,
      [id],
    );
    const row = result.rows[0] ?? {};
    signatures = {
      supervisor: await readPng(row.supervisor_signature_path ? String(row.supervisor_signature_path) : null),
      areaResponsible: await readPng(row.area_responsible_signature_path ? String(row.area_responsible_signature_path) : null),
      employee: await readPng(row.employee_signature_path ? String(row.employee_signature_path) : null),
    };
  }
  // Firmada solo por el supervisor: sigue con marca de agua hasta el aval del responsable.
  const pdf = await buildSupervisionChecklistPdf({ record, draft: record.status !== 'CLOSED', generatedAt: new Date(), signatures });
  return { record, pdf };
};
