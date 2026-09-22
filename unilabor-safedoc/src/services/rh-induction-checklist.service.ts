import pool from '../config/db';

/**
 * Checklist de contenidos por fase de Induccion (REH-REG-005, "CONTENIDO DE
 * CADA FASE, marque conforme se imparta").
 *
 * - Catalogo de contenidos por fase (editable por RH).
 * - Progreso por inscripcion: quien marco cada contenido y cuando.
 * - Interruptor por fase "Completar checklist al aprobar": cuando la evaluacion
 *   de la fase queda acreditada, el sistema marca todos los contenidos de esa
 *   inscripcion con la cuenta de RH como autora. Idempotente: nunca duplica ni
 *   borra marcas, asi que RH conserva el desmarcado manual.
 */

/** Cuenta que firma las marcas automaticas (decision RH 2026-09-22). */
const AUTO_CHECKLIST_AUTHOR_EMAIL = (process.env.RH_INDUCTION_CHECKLIST_AUTHOR_EMAIL ?? 'recursos.humanos@unilabor.mx')
  .trim()
  .toLowerCase();

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface RhInductionChecklistItem {
  id: number;
  phase_id: number;
  item_text: string;
  sort_order: number;
}

const mapChecklistItem = (row: any): RhInductionChecklistItem => ({
  id: Number(row.id),
  phase_id: Number(row.phase_id),
  item_text: String(row.item_text),
  sort_order: Number(row.sort_order ?? 0),
});

export const listPhaseChecklistItems = async (phaseId: number): Promise<RhInductionChecklistItem[]> => {
  const result = await pool.query(
    `SELECT id, phase_id, item_text, sort_order
       FROM public.rh_induction_phase_checklist_items
      WHERE phase_id = $1
      ORDER BY sort_order ASC, id ASC;`,
    [phaseId],
  );
  return result.rows.map(mapChecklistItem);
};

export const addPhaseChecklistItem = async (
  phaseId: number,
  itemText: string,
  sortOrder = 0,
): Promise<RhInductionChecklistItem> => {
  const result = await pool.query(
    `INSERT INTO public.rh_induction_phase_checklist_items (phase_id, item_text, sort_order)
     VALUES ($1, $2, $3) RETURNING id, phase_id, item_text, sort_order;`,
    [phaseId, itemText, sortOrder],
  );
  return mapChecklistItem(result.rows[0]);
};

export const removePhaseChecklistItem = async (checklistItemId: number): Promise<boolean> => {
  const result = await pool.query(
    `DELETE FROM public.rh_induction_phase_checklist_items WHERE id = $1;`,
    [checklistItemId],
  );
  return (result.rowCount ?? 0) > 0;
};

export interface RhInductionChecklistProgressItem {
  checklist_item_id: number;
  item_text: string;
  sort_order: number;
  completed_at: string | null;
}

export const listEnrollmentChecklistProgress = async (
  enrollmentId: number,
): Promise<RhInductionChecklistProgressItem[]> => {
  const phaseResult = await pool.query(
    `SELECT phase_id FROM public.rh_induction_enrollments WHERE id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (phaseResult.rows.length === 0) {
    return throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const result = await pool.query(
    `SELECT ci.id AS checklist_item_id, ci.item_text, ci.sort_order, cp.completed_at
       FROM public.rh_induction_phase_checklist_items ci
       LEFT JOIN public.rh_induction_checklist_progress cp
         ON cp.checklist_item_id = ci.id AND cp.enrollment_id = $2
      WHERE ci.phase_id = $1
      ORDER BY ci.sort_order ASC, ci.id ASC;`,
    [phaseResult.rows[0].phase_id, enrollmentId],
  );
  return result.rows.map((row) => ({
    checklist_item_id: Number(row.checklist_item_id),
    item_text: String(row.item_text),
    sort_order: Number(row.sort_order ?? 0),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  }));
};

export const toggleChecklistItem = async (
  enrollmentId: number,
  checklistItemId: number,
  userId: string,
  completed: boolean,
): Promise<void> => {
  if (completed) {
    await pool.query(
      `INSERT INTO public.rh_induction_checklist_progress (enrollment_id, checklist_item_id, completed_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (enrollment_id, checklist_item_id) DO NOTHING;`,
      [enrollmentId, checklistItemId, userId],
    );
    return;
  }
  await pool.query(
    `DELETE FROM public.rh_induction_checklist_progress WHERE enrollment_id = $1 AND checklist_item_id = $2;`,
    [enrollmentId, checklistItemId],
  );
};

// ---------------------------------------------------------------------------
// Interruptor por fase "Completar checklist al aprobar"
// ---------------------------------------------------------------------------

export const setPhaseAutoCompleteChecklist = async (phaseId: number, enabled: boolean): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE public.rh_induction_phases
        SET auto_complete_checklist_on_pass = $2, updated_at = NOW()
      WHERE id = $1;`,
    [phaseId, enabled],
  );
  return (result.rowCount ?? 0) > 0;
};

const resolveAutoChecklistAuthorId = async (): Promise<string | null> => {
  const result = await pool.query(
    `SELECT id FROM public.users WHERE lower(email) = $1 AND is_active = TRUE LIMIT 1;`,
    [AUTO_CHECKLIST_AUTHOR_EMAIL],
  );
  return result.rows.length > 0 ? String(result.rows[0].id) : null;
};

export interface AutoCompleteChecklistResult {
  enrollment_id: number;
  phase_number: number;
  items_marked: number;
}

/**
 * Gancho al acreditar una evaluacion: si la asignacion pertenece a una
 * inscripcion de Induccion cuya fase tiene el interruptor encendido, marca los
 * contenidos que falten. Devuelve null si no aplica (curso normal, fase con el
 * interruptor apagado o evaluacion no acreditada).
 */
export const autoCompleteChecklistForPassedAssignment = async (
  assignmentId: number,
): Promise<AutoCompleteChecklistResult | null> => {
  const target = await pool.query(
    `SELECT e.id AS enrollment_id, p.phase_number
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
       JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.evaluation_assignment_id = $1
        AND ea.status = 'passed'
        AND p.auto_complete_checklist_on_pass = TRUE
      LIMIT 1;`,
    [assignmentId],
  );
  if (target.rows.length === 0) {
    return null;
  }
  const enrollmentId = Number(target.rows[0].enrollment_id);
  const authorId = await resolveAutoChecklistAuthorId();
  if (!authorId) {
    console.warn(
      `Checklist automatico de Induccion: la cuenta ${AUTO_CHECKLIST_AUTHOR_EMAIL} no existe o esta inactiva; las marcas quedan sin autor.`,
    );
  }
  const inserted = await pool.query(
    `INSERT INTO public.rh_induction_checklist_progress (enrollment_id, checklist_item_id, completed_at, completed_by_user_id)
     SELECT e.id, ci.id, NOW(), $2::uuid
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phase_checklist_items ci ON ci.phase_id = e.phase_id
      WHERE e.id = $1
     ON CONFLICT (enrollment_id, checklist_item_id) DO NOTHING;`,
    [enrollmentId, authorId],
  );
  return {
    enrollment_id: enrollmentId,
    phase_number: Number(target.rows[0].phase_number),
    items_marked: inserted.rowCount ?? 0,
  };
};
