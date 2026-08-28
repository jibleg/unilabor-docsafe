import pool from '../config/db';
import { listEmployeePositions } from './rh-employee-position.service';
import { listEffectivenessReviews, type RhInductionEffectivenessReview } from './rh-induction-effectiveness.service';

/**
 * Reporte consolidado de las 7 fases (REH-REG-005 "Formato de Induccion").
 * Agrega lo que ya calculan enrollEmployeeInPhase/refreshEnrollmentReadingStatus
 * (lectura, evaluacion, certificado archivado en expediente) mas el checklist
 * de contenidos y el supervisor de Bloque 1.5. Para las Fases 5-7 (no
 * construidas todavia) nunca inventa datos: reporta NO_DISPONIBLE.
 *
 * La firma de cierre final (RH/Coordinador de area/Colaborador) NO se emite
 * aqui: cerrar el registro antes de que existan las 7 fases seria firmar "un
 * registro incompleto", justo lo que la hoja INSTRUCCIONES de REH-REG-005
 * prohibe. Se retoma cuando existan las Fases 5-7.
 */

export type RhInductionPhaseRowStatus = 'PENDIENTE' | 'EN_PROCESO' | 'APROBADA' | 'NO_APROBADA' | 'NO_DISPONIBLE';

export interface RhInductionMasterRecordPhaseRow {
  phase_number: number;
  name: string;
  responsible_label: string;
  supervisor_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  score_percentage: number | null;
  status: RhInductionPhaseRowStatus;
  checklist_total: number;
  checklist_completed: number;
  collaborator_signature_note: string;
  responsible_signature_note: string;
}

export type RhInductionVerdict = 'SIN_INICIAR' | 'EN_PROCESO' | 'NO_APROBADA' | 'COMPLETA_1_A_4';

export interface RhInductionMasterRecord {
  employee: {
    id: number;
    full_name: string;
    employee_code: string;
    area: string | null;
    position: string | null;
    active_positions: string[];
  };
  started_at: string | null;
  finished_at: string | null;
  phases: RhInductionMasterRecordPhaseRow[];
  summary: {
    approved_count: number;
    not_approved_count: number;
    pending_count: number;
    average_score: number | null;
    verdict: RhInductionVerdict;
    what_next: string;
  };
  effectiveness_reviews: RhInductionEffectivenessReview[];
}

const collaboratorSignatureNote = (readingTotal: number, readingSigned: number): string => {
  if (readingTotal === 0) {
    return 'Pendiente (fase sin documentos configurados)';
  }
  if (readingSigned === readingTotal) {
    return `✓ implícita, ${readingSigned}/${readingTotal} documentos leídos y firmados en Sala de Lectura`;
  }
  return `Pendiente (${readingSigned}/${readingTotal} documentos firmados)`;
};

const resolveStatus = (
  scope: string,
  hasEnrollment: boolean,
  evaluationStatus: string | null,
): RhInductionPhaseRowStatus => {
  if (scope !== 'INSTITUTIONAL') {
    return 'NO_DISPONIBLE';
  }
  if (!hasEnrollment) {
    return 'PENDIENTE';
  }
  if (evaluationStatus === 'passed') {
    return 'APROBADA';
  }
  if (evaluationStatus === 'failed' || evaluationStatus === 'expired') {
    return 'NO_APROBADA';
  }
  return 'EN_PROCESO';
};

export const getEmployeeInductionMasterRecord = async (employeeId: number): Promise<RhInductionMasterRecord> => {
  const employeeResult = await pool.query(
    `SELECT id, full_name, employee_code, area, position FROM public.employees WHERE id = $1 LIMIT 1;`,
    [employeeId],
  );
  if (employeeResult.rows.length === 0) {
    const error = new Error('RH_INDUCTION_EMPLOYEE_NOT_FOUND');
    (error as any).code = 'RH_INDUCTION_EMPLOYEE_NOT_FOUND';
    (error as any).publicMessage = 'El colaborador no existe.';
    throw error;
  }
  const employeeRow = employeeResult.rows[0];
  const activePositions = await listEmployeePositions(employeeId, false);

  const phasesResult = await pool.query(
    `SELECT
        p.phase_number, p.name, p.responsible_label, p.scope,
        e.id AS enrollment_id, e.created_at AS enrolled_at, e.supervisor_employee_id,
        sup.full_name AS supervisor_name,
        ea.status AS evaluation_status, ea.percentage AS evaluation_percentage, ea.graded_at,
        ea.certificate_document_id,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS reading_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri
           INNER JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
          WHERE ri.enrollment_id = e.id AND a.status = 'signed') AS reading_signed,
        (SELECT COUNT(*)::int FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) AS checklist_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) AS checklist_completed
      FROM public.rh_induction_phases p
      LEFT JOIN public.rh_induction_enrollments e ON e.phase_id = p.id AND e.employee_id = $1
      LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
     ORDER BY p.phase_number ASC;`,
    [employeeId],
  );

  const phases: RhInductionMasterRecordPhaseRow[] = phasesResult.rows.map((row) => {
    const hasEnrollment = row.enrollment_id !== null && row.enrollment_id !== undefined;
    const evaluationStatus = row.evaluation_status ? String(row.evaluation_status) : null;
    const readingTotal = Number(row.reading_total ?? 0);
    const readingSigned = Number(row.reading_signed ?? 0);
    return {
      phase_number: Number(row.phase_number),
      name: String(row.name),
      responsible_label: String(row.responsible_label),
      supervisor_name: row.supervisor_name ? String(row.supervisor_name) : null,
      started_at: row.enrolled_at ? String(row.enrolled_at) : null,
      finished_at: row.graded_at ? String(row.graded_at) : null,
      score_percentage:
        row.evaluation_percentage !== null && row.evaluation_percentage !== undefined
          ? Number(row.evaluation_percentage)
          : null,
      status: resolveStatus(String(row.scope), hasEnrollment, evaluationStatus),
      checklist_total: Number(row.checklist_total ?? 0),
      checklist_completed: Number(row.checklist_completed ?? 0),
      collaborator_signature_note: hasEnrollment ? collaboratorSignatureNote(readingTotal, readingSigned) : 'Pendiente',
      responsible_signature_note: row.certificate_document_id
        ? '✓ constancia emitida con 3 firmas'
        : 'Pendiente',
    };
  });

  const institutionalPhases = phases.filter((phase) => phase.status !== 'NO_DISPONIBLE');
  const approvedCount = institutionalPhases.filter((phase) => phase.status === 'APROBADA').length;
  const notApprovedCount = institutionalPhases.filter((phase) => phase.status === 'NO_APROBADA').length;
  const pendingCount = institutionalPhases.filter(
    (phase) => phase.status === 'PENDIENTE' || phase.status === 'EN_PROCESO',
  ).length;
  const numericScores = institutionalPhases
    .map((phase) => phase.score_percentage)
    .filter((score): score is number => score !== null);
  const averageScore =
    numericScores.length > 0
      ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 100) / 100
      : null;

  const anyEnrolled = institutionalPhases.some((phase) => phase.status !== 'PENDIENTE');
  let verdict: RhInductionVerdict;
  let whatNext: string;
  if (!anyEnrolled) {
    verdict = 'SIN_INICIAR';
    whatNext = 'Registre las fases conforme se vayan impartiendo.';
  } else if (notApprovedCount > 0) {
    verdict = 'NO_APROBADA';
    whatNext =
      'El responsable debe reforzar los temas necesarios y programar una nueva evaluación antes de permitir el avance a la siguiente fase.';
  } else if (approvedCount === institutionalPhases.length) {
    verdict = 'COMPLETA_1_A_4';
    whatNext = 'Fases institucionales completas. Proceda con la inducción por puesto (Fases 5-7) cuando esté disponible.';
  } else {
    verdict = 'EN_PROCESO';
    whatNext = 'Continúe con la siguiente fase institucional pendiente. No se avanza de fase sin aprobar la anterior.';
  }

  const startedTimestamps = phases.map((phase) => phase.started_at).filter((value): value is string => value !== null);
  const finishedTimestamps = phases.map((phase) => phase.finished_at).filter((value): value is string => value !== null);

  return {
    employee: {
      id: Number(employeeRow.id),
      full_name: String(employeeRow.full_name),
      employee_code: String(employeeRow.employee_code),
      area: employeeRow.area ? String(employeeRow.area) : null,
      position: employeeRow.position ? String(employeeRow.position) : null,
      active_positions: activePositions.map((position) => position.position_name),
    },
    started_at: startedTimestamps.length > 0 ? startedTimestamps.sort()[0] ?? null : null,
    finished_at: finishedTimestamps.length > 0 ? finishedTimestamps.sort().reverse()[0] ?? null : null,
    phases,
    summary: {
      approved_count: approvedCount,
      not_approved_count: notApprovedCount,
      pending_count: pendingCount,
      average_score: averageScore,
      verdict,
      what_next: whatNext,
    },
    effectiveness_reviews: await listEffectivenessReviews(employeeId),
  };
};
