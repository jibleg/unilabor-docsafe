import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { assignEvaluation } from './evaluation-assignment.service';
import { assignReaders, getPublicationById, publishReading } from './quality-reading.service';
import { tryNotifyInductionPhaseReady } from './rh-induction-notification.service';

/**
 * Orquestacion de las Fases 1-4 de induccion (institucionales, iguales para
 * todo colaborador). Reusa integro el motor de Evaluaciones (training_courses
 * -> evaluation_templates -> evaluation_assignments -> certificate_templates,
 * ya con firmas 1..N y archivo automatico en expediente) y el de Sala de
 * Lectura (quality_reading_publications/acknowledgements, con su gate
 * anti-fraude de lectura ya resuelto). Lo unico nuevo aqui es que fase le toca
 * a cada colaborador, que documentos debe leer antes, y el amarre entre ambos
 * motores.
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface RhInductionPhase {
  id: number;
  phase_number: number;
  name: string;
  responsible_label: string;
  responsible_name: string | null;
  responsible_phone: string | null;
  scope: 'INSTITUTIONAL' | 'POSITION';
  training_course_id: number | null;
  training_course_title: string | null;
  documents: RhInductionPhaseDocument[];
}

export const listInductionPhases = async (): Promise<RhInductionPhase[]> => {
  const result = await pool.query(`
    SELECT
      p.id, p.phase_number, p.name, p.responsible_label, p.responsible_name, p.responsible_phone,
      p.scope, p.training_course_id,
      tc.title AS training_course_title
    FROM public.rh_induction_phases p
    LEFT JOIN public.training_courses tc ON tc.id = p.training_course_id
    ORDER BY p.phase_number ASC;
  `);
  return Promise.all(
    result.rows.map(async (row) => ({
      id: Number(row.id),
      phase_number: Number(row.phase_number),
      name: String(row.name),
      responsible_label: String(row.responsible_label),
      responsible_name: row.responsible_name ? String(row.responsible_name) : null,
      responsible_phone: row.responsible_phone ? String(row.responsible_phone) : null,
      scope: row.scope as 'INSTITUTIONAL' | 'POSITION',
      training_course_id: row.training_course_id ? Number(row.training_course_id) : null,
      training_course_title: row.training_course_title ? String(row.training_course_title) : null,
      documents: await listPhaseDocuments(Number(row.id)),
    })),
  );
};

interface PhaseDocumentRow {
  document_id: string;
  title: string;
}

const getPhaseDocuments = async (phaseId: number): Promise<PhaseDocumentRow[]> => {
  const result = await pool.query(
    `SELECT pd.document_id, d.title
       FROM public.rh_induction_phase_documents pd
       INNER JOIN public.documents d ON d.id = pd.document_id
      WHERE pd.phase_id = $1
      ORDER BY pd.sort_order ASC, pd.id ASC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({ document_id: String(row.document_id), title: String(row.title) }));
};

export interface RhInductionPhaseDocument {
  id: number;
  document_id: string;
  title: string;
  code: string | null;
  sort_order: number;
}

export const listPhaseDocuments = async (phaseId: number): Promise<RhInductionPhaseDocument[]> => {
  const result = await pool.query(
    `SELECT pd.id, pd.document_id, pd.sort_order, d.title, d.code
       FROM public.rh_induction_phase_documents pd
       INNER JOIN public.documents d ON d.id = pd.document_id
      WHERE pd.phase_id = $1
      ORDER BY pd.sort_order ASC, pd.id ASC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    document_id: String(row.document_id),
    title: String(row.title),
    code: row.code ? String(row.code) : null,
    sort_order: Number(row.sort_order ?? 0),
  }));
};

export const addPhaseDocument = async (
  phaseId: number,
  documentId: string,
  sortOrder = 0,
): Promise<RhInductionPhaseDocument> => {
  try {
    const result = await pool.query(
      `INSERT INTO public.rh_induction_phase_documents (phase_id, document_id, sort_order)
       VALUES ($1, $2, $3) RETURNING id;`,
      [phaseId, documentId, sortOrder],
    );
    const documents = await listPhaseDocuments(phaseId);
    const created = documents.find((doc) => doc.id === Number(result.rows[0].id));
    if (!created) {
      return throwCoded('RH_INDUCTION_PHASE_DOCUMENT_CREATION_FAILED');
    }
    return created;
  } catch (error: any) {
    if (error?.code === '23505') {
      return throwCoded('RH_INDUCTION_PHASE_DOCUMENT_DUPLICATE', 'Ese documento ya esta asignado a esta fase.');
    }
    if (error?.code === '23503') {
      return throwCoded('RH_INDUCTION_PHASE_DOCUMENT_NOT_FOUND', 'La fase o el documento no existen.');
    }
    throw error;
  }
};

export const removePhaseDocument = async (phaseDocumentId: number): Promise<boolean> => {
  const result = await pool.query(`DELETE FROM public.rh_induction_phase_documents WHERE id = $1;`, [phaseDocumentId]);
  return (result.rowCount ?? 0) > 0;
};

const getOrOpenPublication = async (documentId: string, userId: string): Promise<number> => {
  const existing = await pool.query(
    `SELECT id FROM public.quality_reading_publications WHERE document_id = $1 AND status = 'open' LIMIT 1;`,
    [documentId],
  );
  if (existing.rows.length > 0) {
    return Number(existing.rows[0].id);
  }
  const publication = await publishReading({ document_id: documentId }, userId);
  return publication.id;
};

export interface RhInductionEnrollment {
  id: number;
  employee_id: number;
  phase_id: number;
  reading_completed_at: string | null;
  evaluation_assignment_id: number | null;
  supervisor_employee_id: number | null;
}

/** Inscribe a un colaborador en una fase institucional (1-4). Idempotente. */
export const enrollEmployeeInPhase = async (
  employeeId: number,
  phaseId: number,
  userId: string,
  supervisorEmployeeId?: number | null,
): Promise<RhInductionEnrollment> => {
  const phaseResult = await pool.query(
    `SELECT id, phase_number, scope FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phaseResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  if (phaseResult.rows[0].scope !== 'INSTITUTIONAL') {
    throwCoded(
      'RH_INDUCTION_PHASE_NOT_INSTITUTIONAL',
      'Esta fase es especifica por puesto; aun no se puede inscribir directamente.',
    );
  }
  const phaseNumber = Number(phaseResult.rows[0].phase_number);

  const existing = await pool.query(
    `SELECT id FROM public.rh_induction_enrollments WHERE employee_id = $1 AND phase_id = $2 LIMIT 1;`,
    [employeeId, phaseId],
  );
  if (existing.rows.length > 0) {
    throwCoded('RH_INDUCTION_ALREADY_ENROLLED', 'El colaborador ya esta inscrito en esta fase.');
  }

  // "NO SE AVANZA a la siguiente fase sin aprobar la anterior" (REH-REG-005,
  // hoja INSTRUCCIONES paso 4). Solo aplica entre fases institucionales
  // consecutivas (1-4); las fases POSITION (5-7) no se resuelven aqui todavia.
  if (phaseNumber > 1) {
    const previousPassed = await pool.query(
      `SELECT 1
         FROM public.rh_induction_enrollments e
         INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
         INNER JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
        WHERE e.employee_id = $1 AND p.phase_number = $2 AND ea.status = 'passed'
        LIMIT 1;`,
      [employeeId, phaseNumber - 1],
    );
    if (previousPassed.rows.length === 0) {
      return throwCoded(
        'RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED',
        `El colaborador debe aprobar la Fase ${phaseNumber - 1} antes de avanzar a la Fase ${phaseNumber}.`,
      );
    }
  }

  const employeeResult = await pool.query(`SELECT user_id FROM public.employees WHERE id = $1 LIMIT 1;`, [employeeId]);
  const rawEmployeeUserId = employeeResult.rows[0]?.user_id ? String(employeeResult.rows[0].user_id) : null;
  if (!rawEmployeeUserId) {
    return throwCoded(
      'RH_INDUCTION_EMPLOYEE_WITHOUT_USER',
      'El colaborador no tiene un usuario de sistema vinculado; no puede leer ni firmar en Sala de Lectura.',
    );
  }
  const employeeUserId = rawEmployeeUserId;

  const documents = await getPhaseDocuments(phaseId);
  if (documents.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS', 'Esta fase todavia no tiene documentos configurados.');
  }

  const enrollmentId = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.rh_induction_enrollments (employee_id, phase_id, enrolled_by_user_id, supervisor_employee_id)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [employeeId, phaseId, userId, supervisorEmployeeId ?? null],
    );
    return Number(inserted.rows[0].id);
  });

  for (const document of documents) {
    const publicationId = await getOrOpenPublication(document.document_id, userId);
    const { created, skipped_user_ids: skipped } = await assignReaders(
      publicationId,
      { mode: 'users', user_ids: [employeeUserId] },
      userId,
    );
    const acknowledgementId = created[0]?.id ?? null;
    if (!acknowledgementId && skipped.length > 0) {
      // El colaborador ya tenia una lectura vigente/firmada de este documento
      // (de otra asignacion previa): la reusamos en vez de duplicarla.
      const publication = await getPublicationById(publicationId);
      const reused = await pool.query(
        `SELECT id FROM public.quality_reading_acknowledgements
          WHERE publication_id = $1 AND user_id = $2
          ORDER BY created_at DESC LIMIT 1;`,
        [publication?.id ?? publicationId, employeeUserId],
      );
      await pool.query(
        `INSERT INTO public.rh_induction_reading_items (enrollment_id, document_id, acknowledgement_id)
         VALUES ($1, $2, $3);`,
        [enrollmentId, document.document_id, reused.rows[0]?.id ?? null],
      );
      continue;
    }
    await pool.query(
      `INSERT INTO public.rh_induction_reading_items (enrollment_id, document_id, acknowledgement_id)
       VALUES ($1, $2, $3);`,
      [enrollmentId, document.document_id, acknowledgementId],
    );
  }

  await refreshEnrollmentReadingStatus(enrollmentId);

  const result = await pool.query(
    `SELECT id, employee_id, phase_id, reading_completed_at, evaluation_assignment_id, supervisor_employee_id
       FROM public.rh_induction_enrollments WHERE id = $1;`,
    [enrollmentId],
  );
  const row = result.rows[0];
  return {
    id: Number(row.id),
    employee_id: Number(row.employee_id),
    phase_id: Number(row.phase_id),
    reading_completed_at: row.reading_completed_at ? String(row.reading_completed_at) : null,
    evaluation_assignment_id: row.evaluation_assignment_id ? Number(row.evaluation_assignment_id) : null,
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
  };
};

/** Asigna o cambia el supervisor de una inscripcion ya creada. */
export const setEnrollmentSupervisor = async (
  enrollmentId: number,
  supervisorEmployeeId: number | null,
): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE public.rh_induction_enrollments
        SET supervisor_employee_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id;`,
    [supervisorEmployeeId, enrollmentId],
  );
  return result.rows.length > 0;
};

export interface RhInductionChecklistItem {
  id: number;
  phase_id: number;
  item_text: string;
  sort_order: number;
}

export const listPhaseChecklistItems = async (phaseId: number): Promise<RhInductionChecklistItem[]> => {
  const result = await pool.query(
    `SELECT id, phase_id, item_text, sort_order
       FROM public.rh_induction_phase_checklist_items
      WHERE phase_id = $1
      ORDER BY sort_order ASC, id ASC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    phase_id: Number(row.phase_id),
    item_text: String(row.item_text),
    sort_order: Number(row.sort_order ?? 0),
  }));
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
  const row = result.rows[0];
  return {
    id: Number(row.id),
    phase_id: Number(row.phase_id),
    item_text: String(row.item_text),
    sort_order: Number(row.sort_order ?? 0),
  };
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

/**
 * Revisa si todos los documentos de la inscripcion ya estan firmados; si es
 * asi, marca la lectura completa y crea la evaluacion de la fase (si el
 * responsable ya publico su cuestionario). Se puede llamar varias veces sin
 * riesgo (idempotente): si ya estaba completa o la evaluacion ya existe, no
 * hace nada de nuevo.
 */
export const refreshEnrollmentReadingStatus = async (enrollmentId: number): Promise<void> => {
  const enrollmentResult = await pool.query(
    `SELECT e.id, e.employee_id, e.phase_id, e.reading_completed_at, e.evaluation_assignment_id,
            e.enrolled_by_user_id, p.training_course_id, p.name AS phase_name, p.responsible_label
       FROM public.rh_induction_enrollments e
       INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (enrollmentResult.rows.length === 0) {
    return;
  }
  const enrollment = enrollmentResult.rows[0];

  const itemsResult = await pool.query(
    `SELECT ri.acknowledgement_id, a.status
       FROM public.rh_induction_reading_items ri
       LEFT JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
      WHERE ri.enrollment_id = $1;`,
    [enrollmentId],
  );
  const allSigned =
    itemsResult.rows.length > 0 &&
    itemsResult.rows.every((row) => row.acknowledgement_id && row.status === 'signed');

  if (!allSigned) {
    return;
  }

  if (!enrollment.reading_completed_at) {
    await pool.query(
      `UPDATE public.rh_induction_enrollments SET reading_completed_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [enrollmentId],
    );
  }

  if (enrollment.evaluation_assignment_id || !enrollment.training_course_id) {
    return;
  }

  const templateResult = await pool.query(
    `SELECT id FROM public.evaluation_templates
      WHERE training_course_id = $1 AND status = 'published' AND is_active = TRUE
      ORDER BY created_at DESC LIMIT 1;`,
    [enrollment.training_course_id],
  );
  if (templateResult.rows.length === 0) {
    // El responsable de la fase todavia no publica el cuestionario: se
    // reintenta en la proxima llamada (p. ej. al recargar el portal del
    // colaborador o al firmar el ultimo documento pendiente).
    return;
  }
  const templateId = Number(templateResult.rows[0].id);

  try {
    const summary = await assignEvaluation(templateId, [Number(enrollment.employee_id)], enrollment.enrolled_by_user_id);
    if (summary.created > 0) {
      const assignmentResult = await pool.query(
        `SELECT id FROM public.evaluation_assignments
          WHERE template_id = $1 AND employee_id = $2
          ORDER BY created_at DESC LIMIT 1;`,
        [templateId, enrollment.employee_id],
      );
      const assignmentId = assignmentResult.rows[0]?.id ? Number(assignmentResult.rows[0].id) : null;
      if (assignmentId) {
        await pool.query(
          `UPDATE public.rh_induction_enrollments SET evaluation_assignment_id = $1, updated_at = NOW() WHERE id = $2;`,
          [assignmentId, enrollmentId],
        );
        void tryNotifyInductionPhaseReady(enrollmentId, String(enrollment.phase_name), String(enrollment.responsible_label));
      }
    }
  } catch (error) {
    console.error(`No se pudo crear la evaluacion de la fase para la inscripcion ${enrollmentId}:`, error);
  }
};

/** Hook best-effort desde la firma de Sala de Lectura: refresca cualquier inscripcion de induccion ligada a este acuse. */
export const refreshInductionForAcknowledgement = async (acknowledgementId: number): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT enrollment_id FROM public.rh_induction_reading_items WHERE acknowledgement_id = $1;`,
      [acknowledgementId],
    );
    for (const row of result.rows) {
      await refreshEnrollmentReadingStatus(Number(row.enrollment_id));
    }
  } catch (error) {
    console.error(`No se pudo refrescar la induccion para el acuse ${acknowledgementId}:`, error);
  }
};

export interface RhInductionProgressItem {
  enrollment_id: number;
  phase_id: number;
  phase_number: number;
  phase_name: string;
  responsible_label: string;
  reading_total: number;
  reading_signed: number;
  reading_completed_at: string | null;
  evaluation_assignment_id: number | null;
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  checklist_total: number;
  checklist_completed: number;
}

export const getEmployeeInductionProgress = async (employeeId: number): Promise<RhInductionProgressItem[]> => {
  // Auto-sana: si la lectura ya se completo pero todavia no habia cuestionario
  // publicado, reintenta crear la evaluacion cada vez que se consulta el
  // progreso (el responsable pudo publicar el cuestionario despues).
  const pendingResult = await pool.query(
    `SELECT id FROM public.rh_induction_enrollments
      WHERE employee_id = $1 AND reading_completed_at IS NOT NULL AND evaluation_assignment_id IS NULL;`,
    [employeeId],
  );
  for (const row of pendingResult.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }

  const result = await pool.query(
    `SELECT
        e.id AS enrollment_id, p.id AS phase_id, p.phase_number, p.name AS phase_name, p.responsible_label,
        e.reading_completed_at, e.evaluation_assignment_id,
        e.supervisor_employee_id, sup.full_name AS supervisor_name,
        ea.status AS evaluation_status, ea.percentage AS evaluation_percentage,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS reading_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri
           INNER JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
          WHERE ri.enrollment_id = e.id AND a.status = 'signed') AS reading_signed,
        (SELECT COUNT(*)::int FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) AS checklist_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) AS checklist_completed
      FROM public.rh_induction_enrollments e
      INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
      LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
     WHERE e.employee_id = $1
     ORDER BY p.phase_number ASC;`,
    [employeeId],
  );
  return result.rows.map((row) => ({
    enrollment_id: Number(row.enrollment_id),
    phase_id: Number(row.phase_id),
    phase_number: Number(row.phase_number),
    phase_name: String(row.phase_name),
    responsible_label: String(row.responsible_label),
    reading_total: Number(row.reading_total ?? 0),
    reading_signed: Number(row.reading_signed ?? 0),
    reading_completed_at: row.reading_completed_at ? String(row.reading_completed_at) : null,
    evaluation_assignment_id: row.evaluation_assignment_id ? Number(row.evaluation_assignment_id) : null,
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    evaluation_percentage: row.evaluation_percentage !== null && row.evaluation_percentage !== undefined ? Number(row.evaluation_percentage) : null,
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
    supervisor_name: row.supervisor_name ? String(row.supervisor_name) : null,
    checklist_total: Number(row.checklist_total ?? 0),
    checklist_completed: Number(row.checklist_completed ?? 0),
  }));
};

export interface RhInductionPhaseEnrollmentSummary {
  enrollment_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  reading_total: number;
  reading_signed: number;
  reading_completed_at: string | null;
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  checklist_total: number;
  checklist_completed: number;
}

export const listPhaseEnrollments = async (phaseId: number): Promise<RhInductionPhaseEnrollmentSummary[]> => {
  // Mismo auto-sanado que getEmployeeInductionProgress: reintenta crear la
  // evaluacion de quien ya termino de leer pero se quedo esperando el
  // cuestionario.
  const pendingResult = await pool.query(
    `SELECT id FROM public.rh_induction_enrollments
      WHERE phase_id = $1 AND reading_completed_at IS NOT NULL AND evaluation_assignment_id IS NULL;`,
    [phaseId],
  );
  for (const row of pendingResult.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }

  const result = await pool.query(
    `SELECT
        e.id AS enrollment_id, emp.id AS employee_id, emp.full_name AS employee_name, emp.employee_code,
        e.reading_completed_at,
        e.supervisor_employee_id, sup.full_name AS supervisor_name,
        ea.status AS evaluation_status, ea.percentage AS evaluation_percentage,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS reading_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri
           INNER JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
          WHERE ri.enrollment_id = e.id AND a.status = 'signed') AS reading_signed,
        (SELECT COUNT(*)::int FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = e.phase_id) AS checklist_total,
        (SELECT COUNT(*)::int FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) AS checklist_completed
      FROM public.rh_induction_enrollments e
      INNER JOIN public.employees emp ON emp.id = e.employee_id
      LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
     WHERE e.phase_id = $1
     ORDER BY e.created_at DESC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({
    enrollment_id: Number(row.enrollment_id),
    employee_id: Number(row.employee_id),
    employee_name: String(row.employee_name),
    employee_code: String(row.employee_code),
    reading_total: Number(row.reading_total ?? 0),
    reading_signed: Number(row.reading_signed ?? 0),
    reading_completed_at: row.reading_completed_at ? String(row.reading_completed_at) : null,
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    evaluation_percentage: row.evaluation_percentage !== null && row.evaluation_percentage !== undefined ? Number(row.evaluation_percentage) : null,
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
    supervisor_name: row.supervisor_name ? String(row.supervisor_name) : null,
    checklist_total: Number(row.checklist_total ?? 0),
    checklist_completed: Number(row.checklist_completed ?? 0),
  }));
};
