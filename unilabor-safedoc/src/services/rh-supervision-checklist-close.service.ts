import fs from 'fs';
import pool from '../config/db';
import type { PoolClient } from 'pg';
import { withTransaction, type Queryable } from '../utils/transaction';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { describePhase7AutoStart, type Phase7AutoStartOutcome } from './rh-induction-phase7-auto.service';
import { captureEnrollmentPractical } from './rh-induction-practical.service';
import { isEmployeePositionPhaseComplete, loadTrackEntries, loadTrackPhase } from './rh-induction-position-track.service';
import { buildSupervisionChecklistPdf } from './rh-supervision-checklist.pdf';
import { practicalScoreFromPct, SUPERVISION_CONCLUSION_LABELS } from './rh-supervision-checklist.rules';
import { canAutoClose, SUPERVISION_SIGNER_ROLE_LABELS, type SupervisionSignerRole } from './rh-supervision-signature.rules';
import { assertIndependentSigners } from './rh-supervision-signers.service';
import { getSupervisionChecklist, type SupervisionChecklistRecord } from './rh-supervision-checklist.service';

// -----------------------------------------------------------------------------
// Cierre de la lista ANA-REG-060. Ya no hay firma presencial: la lista se
// envia a firma (rh-supervision-signature.service.ts) y, cuando el Supervisor /
// Auditor, el Responsable del Area y el Colaborador evaluado firmaron desde su
// Buzon, SE CIERRA SOLA aqui: sella los totales, copia las firmas a la lista,
// genera el PDF oficial, lo archiva en el expediente y, si es la lista FINAL
// de una inscripcion de la Fase 6, captura la calificacion en la evaluacion
// practica del puesto (motor existente: emite la constancia, marca el
// checklist REH-REG-005 y activa el siguiente puesto de la ruta).
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
export const assertPracticalAvailable = async (enrollmentId: number): Promise<void> => {
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

/** Requisitos de contenido para firmar: datos completos, items calificados y firmantes independientes. */
export const assertReadyToSign = (record: SupervisionChecklistRecord): void => {
  if (!record.supervisor_name.trim()) {
    throwCoded('RH_SUPERVISION_SUPERVISOR_REQUIRED', 'Falta el supervisor / auditor de la lista.');
  }
  if (!record.area_responsible_name.trim()) {
    throwCoded('RH_SUPERVISION_RESPONSIBLE_REQUIRED', 'Falta el responsable del area de la lista.');
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

export interface ActiveSupervisionSignature {
  role: SupervisionSignerRole;
  signer_user_id: string | null;
  signature_path: string;
  signed_at: Date;
}

/** Firmas vigentes (no invalidadas) de la lista. */
export const loadActiveSignatures = async (db: Queryable, checklistId: number): Promise<ActiveSupervisionSignature[]> => {
  const result = await db.query(
    `SELECT signer_role, signer_user_id, signature_path, signed_at
       FROM public.rh_supervision_checklist_signatures
      WHERE checklist_id = $1 AND invalidated_at IS NULL;`,
    [checklistId],
  );
  return result.rows.map((row) => ({
    role: String(row.signer_role) as SupervisionSignerRole,
    signer_user_id: row.signer_user_id ? String(row.signer_user_id) : null,
    signature_path: String(row.signature_path),
    signed_at: new Date(row.signed_at),
  }));
};

const readPng = (filePath: string | null): Buffer | null => {
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
};

/**
 * Que sigue para el colaborador tras acreditar el puesto. En la Fase 6 todos
 * sus puestos corren a la vez: se informa cuales le faltan. Al acreditar el ultimo, la Fase 7 se
 * abre sola (REH-REG-003 inicial del primer puesto): aqui se informa lo que
 * realmente paso con ella (abierta, con o sin evaluador, o por que no se abrio).
 */
const describeNextStep = async (employeeId: number, phase7: Phase7AutoStartOutcome | null): Promise<string> => {
  try {
    if (await isEmployeePositionPhaseComplete(employeeId, 6)) {
      return ` Con este puesto concluyo la Fase 6 en todos sus puestos. ${describePhase7AutoStart(phase7)}`.trimEnd();
    }
    const phase = await loadTrackPhase(6);
    const pending = (await loadTrackEntries(employeeId, phase.id)).filter((entry) => entry.queue_status !== 'CANCELLED' && !entry.passed);
    if (pending.length === 0) return '';
    const codes = pending.map((entry) => entry.position_code).join(', ');
    return pending.length === 1 ? ` Le falta el puesto ${codes} en la Fase 6.` : ` Le faltan ${pending.length} puestos en la Fase 6 (${codes}).`;
  } catch {
    return '';
  }
};

interface SealedChecklist {
  record: SupervisionChecklistRecord;
  actorUserId: string;
}

/**
 * Dentro de la transaccion y con el candado de la fila: si la lista sigue en
 * firma y ya tiene las tres firmas vigentes, genera y archiva el PDF y la
 * sella como CLOSED. Devuelve null si no procede (faltan firmas, ya la cerro
 * otra peticion o RH cancelo el envio).
 */
const sealFullySignedChecklist = async (client: PoolClient, id: number, triggeredByUserId: string): Promise<SealedChecklist | null> => {
  const locked = await client.query(
    `SELECT status, signature_requested_by_user_id FROM public.rh_supervision_checklists WHERE id = $1 FOR UPDATE;`,
    [id],
  );
  if (locked.rows.length === 0) {
    throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
  }
  const signatures = await loadActiveSignatures(client, id);
  const signedRoles = signatures.map((signature) => signature.role);
  if (!canAutoClose(String(locked.rows[0].status), signedRoles)) {
    return null;
  }

  const record = await getSupervisionChecklist(id);
  assertReadyToSign(record);
  if (record.is_final && !record.enrollment_id) {
    throwCoded('RH_SUPERVISION_FINAL_WITHOUT_ENROLLMENT', 'Solo una lista ligada a una inscripcion de la Fase 6 puede ser la final.');
  }
  if (record.is_final && record.enrollment_id) {
    await assertPracticalAvailable(record.enrollment_id);
  }

  const byRole = new Map(signatures.map((signature) => [signature.role, signature]));
  const png = (role: SupervisionSignerRole): Buffer => {
    const buffer = readPng(byRole.get(role)!.signature_path);
    if (!buffer) {
      throwCoded(
        'RH_SUPERVISION_SIGNATURE_FILE_MISSING',
        `No se encontro la imagen de la firma de ${SUPERVISION_SIGNER_ROLE_LABELS[role]}; cancela el envio a firma y vuelve a recabarla.`,
      );
    }
    return buffer!;
  };

  // Responsable del cierre: quien envio la lista a firma (RH o el supervisor). El
  // ultimo firmante puede ser el propio evaluado y no debe quedar como autor de su nota.
  const actorUserId = locked.rows[0].signature_requested_by_user_id ? String(locked.rows[0].signature_requested_by_user_id) : triggeredByUserId;
  const closedAt = new Date();
  const summary = record.summary;
  const pdf = await buildSupervisionChecklistPdf({
    record: { ...record, status: 'CLOSED', closed_at: closedAt.toISOString(), compliance_pct: summary.compliance_pct, conclusion: summary.conclusion, passed: summary.passed },
    draft: false,
    generatedAt: closedAt,
    signatures: { supervisor: png('SUPERVISOR'), areaResponsible: png('AREA_RESPONSIBLE'), employee: png('EMPLOYEE') },
  });

  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: record.employee_id,
    documentTypeCode: 'SUPERVISION_ANA060',
    referenceKey: `supervision:${record.id}`,
    title: `${record.form_code} ${record.folio} · ${record.position_code} · ${SUPERVISION_CONCLUSION_LABELS[summary.conclusion!]}`,
    description:
      `${record.enrollment_id ? 'Fase 6 de Induccion' : 'Supervision de area'} · ${record.position_name} · ` +
      `${summary.compliant}/${summary.evaluated} conformes (${summary.compliance_pct!.toFixed(2)} %) · supervisor ${record.supervisor_name}`,
    pdf,
    uploadedByUserId: actorUserId,
  });

  if (record.is_final && record.enrollment_id) {
    // Una sola lista final vigente por inscripcion: esta sustituye a la anterior.
    await client.query(`UPDATE public.rh_supervision_checklists SET is_final = FALSE WHERE enrollment_id = $1 AND is_final = TRUE AND id <> $2;`, [
      record.enrollment_id,
      record.id,
    ]);
  }
  await client.query(
    `UPDATE public.rh_supervision_checklists
        SET status = 'CLOSED', items_evaluated = $2, items_compliant = $3, items_non_compliant = $4, compliance_pct = $5,
            conclusion = $6, passed = $7, supervisor_signature_path = $8, area_responsible_signature_path = $9,
            employee_signature_path = $10, supervisor_signed_at = $11, supervisor_user_id = $12, area_responsible_user_id = $13,
            closed_at = $14, closed_by_user_id = $15, document_id = $16, updated_at = NOW()
      WHERE id = $1 AND status = 'PENDING_SIGNATURES';`,
    [
      record.id,
      summary.evaluated,
      summary.compliant,
      summary.non_compliant,
      summary.compliance_pct,
      summary.conclusion,
      summary.passed,
      byRole.get('SUPERVISOR')!.signature_path,
      byRole.get('AREA_RESPONSIBLE')!.signature_path,
      byRole.get('EMPLOYEE')!.signature_path,
      byRole.get('SUPERVISOR')!.signed_at,
      byRole.get('SUPERVISOR')!.signer_user_id,
      byRole.get('AREA_RESPONSIBLE')!.signer_user_id,
      closedAt,
      actorUserId,
      documentId,
    ],
  );
  return { record, actorUserId };
};

/**
 * Cierre automatico de una lista con sus tres firmas. Devuelve null cuando no
 * procede. El candado de la fila serializa dos firmas simultaneas: la segunda
 * espera y encuentra la lista ya cerrada, asi que nunca se cierra dos veces ni
 * queda a medias (si algo falla antes de sellarla, la transaccion se revierte y
 * la lista sigue en firma con sus firmas intactas para reintentar el cierre).
 */
export const closeFullySignedChecklist = async (id: number, triggeredByUserId: string): Promise<CloseSupervisionChecklistResult | null> => {
  const sealed = await withTransaction((client) => sealFullySignedChecklist(client, id, triggeredByUserId));
  if (!sealed) {
    return null;
  }
  const { record, actorUserId } = sealed;
  const summary = record.summary;
  // Nota a la practica de la Fase 6 (fuera de la transaccion: emite constancia,
  // checklist y siguiente puesto). Si fallara, la lista ya es evidencia cerrada
  // y RH puede capturar la nota a mano desde el tablero.
  let practical: SupervisionPracticalOutcome | null = null;
  if (record.is_final && record.enrollment_id) {
    const score = practicalScoreFromPct(summary.compliance_pct!);
    try {
      const captured = await captureEnrollmentPractical({
        enrollmentId: record.enrollment_id,
        score,
        capturedAt: `${record.supervision_date}T12:00:00-06:00`,
        actorUserId,
      });
      practical = {
        captured: true,
        status: captured.status,
        score: captured.score,
        message:
          captured.status === 'passed'
            ? `Fase 6 del puesto ${record.position_code} acreditada con ${summary.compliance_pct!.toFixed(2)} % (${score}/10).${await describeNextStep(record.employee_id, captured.phase7)}`
            : `Fase 6 del puesto ${record.position_code} NO acreditada: ${summary.compliance_pct!.toFixed(2)} % (minimo 80 %); RH debera programar una nueva supervision.`,
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

/** PDF de consulta: cerrada con sus firmas, o borrador con marca de agua (en firma muestra las ya recabadas). */
export const renderSupervisionChecklistPdf = async (id: number): Promise<{ record: SupervisionChecklistRecord; pdf: Buffer }> => {
  const record = await getSupervisionChecklist(id);
  let signatures = { supervisor: null as Buffer | null, areaResponsible: null as Buffer | null, employee: null as Buffer | null };
  if (record.status === 'CLOSED') {
    const result = await pool.query(
      `SELECT supervisor_signature_path, area_responsible_signature_path, employee_signature_path
         FROM public.rh_supervision_checklists WHERE id = $1 LIMIT 1;`,
      [id],
    );
    const row = result.rows[0] ?? {};
    signatures = {
      supervisor: readPng(row.supervisor_signature_path ? String(row.supervisor_signature_path) : null),
      areaResponsible: readPng(row.area_responsible_signature_path ? String(row.area_responsible_signature_path) : null),
      employee: readPng(row.employee_signature_path ? String(row.employee_signature_path) : null),
    };
  } else if (record.status === 'PENDING_SIGNATURES') {
    const byRole = new Map((await loadActiveSignatures(pool, id)).map((signature) => [signature.role, signature.signature_path]));
    signatures = {
      supervisor: readPng(byRole.get('SUPERVISOR') ?? null),
      areaResponsible: readPng(byRole.get('AREA_RESPONSIBLE') ?? null),
      employee: readPng(byRole.get('EMPLOYEE') ?? null),
    };
  }
  const pdf = await buildSupervisionChecklistPdf({ record, draft: record.status !== 'CLOSED', generatedAt: new Date(), signatures });
  return { record, pdf };
};
