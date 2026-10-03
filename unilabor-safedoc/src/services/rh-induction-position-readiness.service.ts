import pool from '../config/db';
import { courseEvaluationLateral, resolvePositionEvaluationState } from './rh-induction-position-evaluation';
import type { PositionEvaluationState } from './rh-induction-position-evaluation';
import { loadTransitionPhase, loadTransitionRows, TRANSITION_TARGETS } from './rh-induction-transition.service';
import type { TransitionTarget } from './rh-induction-transition.service';

// -----------------------------------------------------------------------------
// Preparacion por puesto de las Fases 5-7: que tiene listo cada puesto
// (habilitacion, documentos, evaluacion, firmas de constancia, competencias) y
// cuantos colaboradores esperan por el. Le dice a RH que configurar primero.
// -----------------------------------------------------------------------------

export interface PositionPhaseReadiness {
  enabled: boolean;
  course_id: number | null;
  evaluation_state: PositionEvaluationState | null;
  question_count: number;
  certificate_signatures: number;
  /** Colaboradores que aprobaron la fase anterior y esperan entrar a esta. */
  waiting: number;
  /** De los que esperan, cuantos ya estan listos para inscribirse. */
  ready: number;
  enrolled: number;
  /** El puesto puede recibir colaboradores en esta fase sin dejarlos en el limbo. */
  ok: boolean;
}

export interface PositionReadinessRow {
  position_id: number;
  position_code: string;
  position_name: string;
  employees_active: number;
  documents_total: number;
  competencies_total: number;
  phase5: PositionPhaseReadiness;
  phase6: PositionPhaseReadiness;
  phase7: { waiting: number; ready: number; started: number; ok: boolean };
}

const phaseReadiness = (row: any, prefix: 'f5' | 'f6', phaseNumber: 5 | 6): Omit<PositionPhaseReadiness, 'waiting' | 'ready' | 'ok'> => {
  const courseId = row[`${prefix}_course_id`] ? Number(row[`${prefix}_course_id`]) : null;
  return {
    enabled: courseId !== null,
    course_id: courseId,
    evaluation_state: courseId
      ? resolvePositionEvaluationState(
          {
            template_id: row[`${prefix}_template_id`] ? Number(row[`${prefix}_template_id`]) : null,
            status: row[`${prefix}_status`] ? String(row[`${prefix}_status`]) : null,
            question_count: Number(row[`${prefix}_question_count`] ?? 0),
          },
          phaseNumber === 6 ? 'practical' : 'quiz',
        )
      : null,
    question_count: Number(row[`${prefix}_question_count`] ?? 0),
    certificate_signatures: Number(row[`${prefix}_signatures`] ?? 0),
    enrolled: Number(row[`${prefix}_enrolled`] ?? 0),
  };
};

const signaturesSubquery = (courseColumn: string) => `
  (SELECT COUNT(*)::int FROM public.certificate_templates ct
     JOIN public.certificate_template_signatures cs ON cs.certificate_template_id = ct.id
    WHERE ct.training_course_id = ${courseColumn})`;

export const getPositionReadiness = async (): Promise<PositionReadinessRow[]> => {
  const [phase5, phase6] = await Promise.all([loadTransitionPhase(5), loadTransitionPhase(6)]);
  const result = await pool.query(
    `SELECT rp.id, rp.code, rp.name,
            (SELECT COUNT(DISTINCT rep.employee_id)::int FROM public.rh_employee_positions rep
               JOIN public.employees e ON e.id = rep.employee_id AND e.is_active = TRUE
              WHERE rep.position_id = rp.id AND rep.is_active = TRUE) AS employees_active,
            (SELECT COUNT(*)::int FROM public.rh_position_documents pd WHERE pd.position_id = rp.id) AS documents_total,
            (SELECT COUNT(*)::int FROM public.rh_position_competencies pc WHERE pc.position_id = rp.id) AS competencies_total,
            pp5.training_course_id AS f5_course_id, ev5.template_id AS f5_template_id, ev5.status AS f5_status,
            ev5.question_count AS f5_question_count, ${signaturesSubquery('pp5.training_course_id')} AS f5_signatures,
            (SELECT COUNT(*)::int FROM public.rh_induction_enrollments x WHERE x.phase_id = $1 AND x.training_course_id = pp5.training_course_id) AS f5_enrolled,
            pp6.training_course_id AS f6_course_id, ev6.template_id AS f6_template_id, ev6.status AS f6_status,
            ev6.question_count AS f6_question_count, ${signaturesSubquery('pp6.training_course_id')} AS f6_signatures,
            (SELECT COUNT(*)::int FROM public.rh_induction_enrollments x WHERE x.phase_id = $2 AND x.training_course_id = pp6.training_course_id) AS f6_enrolled
       FROM public.rh_positions rp
       LEFT JOIN public.rh_induction_phase_positions pp5 ON pp5.phase_id = $1 AND pp5.position_id = rp.id
       ${courseEvaluationLateral('pp5.training_course_id', `'quiz'`, 'ev5')}
       LEFT JOIN public.rh_induction_phase_positions pp6 ON pp6.phase_id = $2 AND pp6.position_id = rp.id
       ${courseEvaluationLateral('pp6.training_course_id', `'practical'`, 'ev6')}
      WHERE rp.is_active = TRUE
      ORDER BY rp.code ASC;`,
    [phase5.phase_id, phase6.phase_id],
  );

  // Espera y listos por puesto, desde la misma bandeja de avance.
  const waiting = new Map<string, { waiting: number; ready: number; started: number }>();
  for (const target of TRANSITION_TARGETS) {
    for (const row of await loadTransitionRows(target as TransitionTarget)) {
      if (!row.position_id) continue;
      const key = `${target}:${row.position_id}`;
      const entry = waiting.get(key) ?? { waiting: 0, ready: 0, started: 0 };
      if (row.state === 'STARTED') entry.started += 1;
      else entry.waiting += 1;
      if (row.state === 'READY') entry.ready += 1;
      waiting.set(key, entry);
    }
  }
  const counts = (target: number, positionId: number) => waiting.get(`${target}:${positionId}`) ?? { waiting: 0, ready: 0, started: 0 };

  return result.rows.map((row) => {
    const positionId = Number(row.id);
    const documentsTotal = Number(row.documents_total ?? 0);
    const competenciesTotal = Number(row.competencies_total ?? 0);
    const f5 = phaseReadiness(row, 'f5', 5);
    const f6 = phaseReadiness(row, 'f6', 6);
    const c5 = counts(5, positionId);
    const c6 = counts(6, positionId);
    const c7 = counts(7, positionId);
    return {
      position_id: positionId,
      position_code: String(row.code),
      position_name: String(row.name),
      employees_active: Number(row.employees_active ?? 0),
      documents_total: documentsTotal,
      competencies_total: competenciesTotal,
      phase5: { ...f5, waiting: c5.waiting, ready: c5.ready, ok: f5.enabled && documentsTotal > 0 && f5.evaluation_state === 'READY' },
      phase6: { ...f6, waiting: c6.waiting, ready: c6.ready, ok: f6.enabled && f6.evaluation_state === 'READY' },
      phase7: { waiting: c7.waiting, ready: c7.ready, started: c7.started, ok: competenciesTotal > 0 },
    };
  });
};
