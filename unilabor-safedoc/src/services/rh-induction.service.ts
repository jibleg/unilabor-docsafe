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
  duration_hours: number | null;
  reading_time_limit_hours: number | null;
  documents: RhInductionPhaseDocument[];
}

export const listInductionPhases = async (): Promise<RhInductionPhase[]> => {
  const result = await pool.query(`
    SELECT
      p.id, p.phase_number, p.name, p.responsible_label, p.responsible_name, p.responsible_phone,
      p.scope, p.training_course_id, p.duration_hours, p.reading_time_limit_hours,
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
      duration_hours: row.duration_hours !== null && row.duration_hours !== undefined ? Number(row.duration_hours) : null,
      reading_time_limit_hours:
        row.reading_time_limit_hours !== null && row.reading_time_limit_hours !== undefined
          ? Number(row.reading_time_limit_hours)
          : null,
      documents: await listPhaseDocuments(Number(row.id)),
    })),
  );
};

export interface InductionCertificatePhaseContext {
  phaseNumber: number;
  phaseName: string;
  durationHours: number | null;
}

/**
 * Fase de induccion ligada a esta training_course (o null si el curso no es de
 * induccion). Resuelve tanto los cursos institucionales (Fases 1-4, ligados
 * directo en rh_induction_phases) como los cursos por puesto (Fases 5-6, via
 * rh_induction_phase_positions).
 */
export const getInductionPhaseByCourseId = async (
  courseId: number,
): Promise<InductionCertificatePhaseContext | null> => {
  const result = await pool.query(
    `SELECT p.phase_number, p.name, p.duration_hours
       FROM public.rh_induction_phases p
      WHERE p.training_course_id = $1
     UNION ALL
     SELECT p.phase_number, p.name, p.duration_hours
       FROM public.rh_induction_phase_positions pp
       INNER JOIN public.rh_induction_phases p ON p.id = pp.phase_id
      WHERE pp.training_course_id = $1
      LIMIT 1;`,
    [courseId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    phaseNumber: Number(row.phase_number),
    phaseName: String(row.name),
    durationHours: row.duration_hours !== null && row.duration_hours !== undefined ? Number(row.duration_hours) : null,
  };
};

export interface RhInductionPhasePosition {
  id: number;
  position_id: number;
  position_name: string;
  position_code: string;
  training_course_id: number;
  course_code: string;
  has_published_template: boolean;
}

/** Puestos habilitados para una fase POSITION (5-6), con el estado de su cuestionario. */
export const listPhasePositions = async (phaseId: number): Promise<RhInductionPhasePosition[]> => {
  const result = await pool.query(
    `SELECT pp.id, pp.position_id, rp.name AS position_name, rp.code AS position_code,
            pp.training_course_id, tc.code AS course_code,
            EXISTS (
              SELECT 1 FROM public.evaluation_templates t
               WHERE t.training_course_id = pp.training_course_id
                 AND t.status = 'published' AND t.is_active = TRUE
            ) AS has_published_template
       FROM public.rh_induction_phase_positions pp
       INNER JOIN public.rh_positions rp ON rp.id = pp.position_id
       INNER JOIN public.training_courses tc ON tc.id = pp.training_course_id
      WHERE pp.phase_id = $1
      ORDER BY rp.name ASC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    position_id: Number(row.position_id),
    position_name: String(row.position_name),
    position_code: String(row.position_code),
    training_course_id: Number(row.training_course_id),
    course_code: String(row.course_code),
    has_published_template: Boolean(row.has_published_template),
  }));
};

/**
 * Habilita una fase POSITION (5-6) para un puesto: crea (si no existe) la
 * training_course propia de (fase, puesto) — sobre la que RH disena el
 * cuestionario (Fase 5) o la evaluacion practica (Fase 6) con la UI existente
 * de Capacitaciones — y registra el puente. Idempotente.
 */
export const enablePhaseForPosition = async (
  phaseId: number,
  positionId: number,
  userId: string | null,
): Promise<RhInductionPhasePosition> => {
  const phaseResult = await pool.query(
    `SELECT phase_number, name, scope FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phaseResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  const phaseNumber = Number(phaseResult.rows[0].phase_number);
  if (String(phaseResult.rows[0].scope) !== 'POSITION' || phaseNumber === 7) {
    throwCoded(
      'RH_INDUCTION_PHASE_NOT_POSITION',
      'Solo las Fases 5 y 6 se habilitan por puesto (la Fase 7 usa el REH-REG-003).',
    );
  }
  const positionResult = await pool.query(
    `SELECT code, name FROM public.rh_positions WHERE id = $1 AND is_active = TRUE LIMIT 1;`,
    [positionId],
  );
  if (positionResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_POSITION_NOT_FOUND', 'El puesto no existe o esta inactivo.');
  }
  const positionCode = String(positionResult.rows[0].code);
  const positionName = String(positionResult.rows[0].name);

  const existing = await pool.query(
    `SELECT id FROM public.rh_induction_phase_positions WHERE phase_id = $1 AND position_id = $2 LIMIT 1;`,
    [phaseId, positionId],
  );
  if (existing.rows.length === 0) {
    await withTransaction(async (client) => {
      const courseCode = `INDUCCION-FASE-${phaseNumber}-${positionCode.toUpperCase()}`;
      const courseResult = await client.query(
        `INSERT INTO public.training_courses (code, title, description, certificate_validity_months)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT DO NOTHING
         RETURNING id;`,
        [
          courseCode,
          `Fase ${phaseNumber} - ${String(phaseResult.rows[0].name)} — ${positionName}`,
          phaseNumber === 5
            ? `Induccion tecnica del puesto ${positionName}: lectura de sus documentos obligatorios + cuestionario.`
            : `Capacitacion practica supervisada del puesto ${positionName}: RH captura la calificacion (0-10).`,
        ],
      );
      let courseId: number;
      if (courseResult.rows.length > 0) {
        courseId = Number(courseResult.rows[0].id);
      } else {
        const found = await client.query(`SELECT id FROM public.training_courses WHERE code = $1 LIMIT 1;`, [courseCode]);
        courseId = Number(found.rows[0].id);
      }
      await client.query(
        `INSERT INTO public.rh_induction_phase_positions (phase_id, position_id, training_course_id, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (phase_id, position_id) DO NOTHING;`,
        [phaseId, positionId, courseId, userId],
      );
    });
  }

  const positions = await listPhasePositions(phaseId);
  const enabled = positions.find((entry) => entry.position_id === positionId);
  if (!enabled) {
    return throwCoded('RH_INDUCTION_PHASE_POSITION_ENABLE_FAILED');
  }
  return enabled;
};

/** Puesto (catalogo rh_positions) mas reciente y activo del colaborador, para la constancia. */
export const getEmployeeActivePositionName = async (employeeId: number): Promise<string | null> => {
  const result = await pool.query(
    `SELECT rp.name
       FROM public.rh_employee_positions rep
       INNER JOIN public.rh_positions rp ON rp.id = rep.position_id
      WHERE rep.employee_id = $1 AND rep.is_active = TRUE
      ORDER BY rep.assigned_at DESC
      LIMIT 1;`,
    [employeeId],
  );
  return result.rows.length > 0 ? String(result.rows[0].name) : null;
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

/**
 * Inscribe a un colaborador en una fase. Institucionales (1-4): documentos de
 * la fase + cuestionario del curso de la fase. POSITION (5-6): el curso y (en
 * Fase 5) los documentos se resuelven del PUESTO activo del colaborador —
 * Fase 6 es practica supervisada, sin lectura (RH captura la calificacion).
 * La Fase 7 no se inscribe aqui: su instrumento es el REH-REG-003.
 */
export const enrollEmployeeInPhase = async (
  employeeId: number,
  phaseId: number,
  userId: string,
  supervisorEmployeeId?: number | null,
): Promise<RhInductionEnrollment> => {
  const phaseResult = await pool.query(
    `SELECT id, phase_number, scope, reading_time_limit_hours FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phaseResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  const phaseScope = String(phaseResult.rows[0].scope);
  const phaseNumber = Number(phaseResult.rows[0].phase_number);
  const readingLimitHours = phaseResult.rows[0].reading_time_limit_hours
    ? Number(phaseResult.rows[0].reading_time_limit_hours)
    : null;
  if (phaseScope !== 'INSTITUTIONAL' && phaseNumber === 7) {
    throwCoded(
      'RH_INDUCTION_PHASE_NOT_INSTITUTIONAL',
      'La Fase 7 se resuelve con la Evaluacion de competencia (REH-REG-003), no por inscripcion.',
    );
  }

  // Fases POSITION: se resuelven contra el puesto activo del colaborador.
  let positionCourseId: number | null = null;
  let positionDocuments: PhaseDocumentRow[] = [];
  if (phaseScope === 'POSITION') {
    const positionResult = await pool.query(
      `SELECT rep.position_id, rp.name
         FROM public.rh_employee_positions rep
         INNER JOIN public.rh_positions rp ON rp.id = rep.position_id
        WHERE rep.employee_id = $1 AND rep.is_active = TRUE
        ORDER BY rep.assigned_at DESC LIMIT 1;`,
      [employeeId],
    );
    if (positionResult.rows.length === 0) {
      throwCoded(
        'RH_INDUCTION_EMPLOYEE_WITHOUT_POSITION',
        'El colaborador no tiene un puesto activo asignado; asignalo en Puestos (induccion) antes de inscribirlo.',
      );
    }
    const positionId = Number(positionResult.rows[0].position_id);
    const positionName = String(positionResult.rows[0].name);

    const bridgeResult = await pool.query(
      `SELECT training_course_id FROM public.rh_induction_phase_positions
        WHERE phase_id = $1 AND position_id = $2 LIMIT 1;`,
      [phaseId, positionId],
    );
    if (bridgeResult.rows.length === 0) {
      throwCoded(
        'RH_INDUCTION_PHASE_POSITION_NOT_ENABLED',
        `La Fase ${phaseNumber} no esta habilitada para el puesto "${positionName}". Habilitala primero en la fase.`,
      );
    }
    positionCourseId = Number(bridgeResult.rows[0].training_course_id);

    if (phaseNumber === 5) {
      const docsResult = await pool.query(
        `SELECT pd.document_id, d.title
           FROM public.rh_position_documents pd
           INNER JOIN public.documents d ON d.id = pd.document_id
          WHERE pd.position_id = $1
          ORDER BY pd.sort_order ASC, pd.id ASC;`,
        [positionId],
      );
      if (docsResult.rows.length === 0) {
        throwCoded(
          'RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS',
          `El puesto "${positionName}" no tiene documentos obligatorios configurados para la Fase 5.`,
        );
      }
      positionDocuments = docsResult.rows.map((row) => ({
        document_id: String(row.document_id),
        title: String(row.title),
      }));
    }
  }

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

  // Documentos a leer: los de la fase (institucionales) o los del puesto
  // (Fase 5). La Fase 6 no lleva lectura: es practica supervisada.
  let documents: PhaseDocumentRow[] = [];
  if (phaseScope === 'INSTITUTIONAL') {
    documents = await getPhaseDocuments(phaseId);
    if (documents.length === 0) {
      throwCoded('RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS', 'Esta fase todavia no tiene documentos configurados.');
    }
  } else if (phaseNumber === 5) {
    documents = positionDocuments;
  }

  // Fecha limite de lectura: se congela al inscribir (cambios posteriores en la
  // config de la fase no mueven inscripciones existentes). Solo aplica cuando
  // la fase lleva lectura.
  const readingDeadlineHours = documents.length > 0 && readingLimitHours ? readingLimitHours : null;

  const enrollmentId = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.rh_induction_enrollments
         (employee_id, phase_id, enrolled_by_user_id, supervisor_employee_id, training_course_id, reading_deadline_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE NOW() + make_interval(hours => $6::int) END)
       RETURNING id;`,
      [employeeId, phaseId, userId, supervisorEmployeeId ?? null, positionCourseId, readingDeadlineHours],
    );
    return Number(inserted.rows[0].id);
  });

  // Fase 6: sin lectura, queda lista de inmediato; la evaluacion practica la
  // captura RH y el refresh la vincula al enrollment.
  if (phaseScope === 'POSITION' && phaseNumber === 6) {
    await pool.query(
      `UPDATE public.rh_induction_enrollments SET reading_completed_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [enrollmentId],
    );
  }

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

/**
 * Elimina una inscripcion que aun no genera evidencia aprobatoria: borra el
 * enrollment (sus reading items y checklist caen en cascada), retira de la
 * Sala de Lectura los acuses PENDIENTES sin firma que solo esta inscripcion
 * habia asignado, y cancela la asignacion de evaluacion si nadie la ha
 * contestado. Los acuses firmados y las evaluaciones presentadas NUNCA se
 * tocan (evidencia ISO): con fase aprobada o evaluacion en revision, la baja
 * se rechaza.
 */
export const unenrollEmployeeFromPhase = async (enrollmentId: number): Promise<void> => {
  const enrollmentResult = await pool.query(
    `SELECT e.id, e.evaluation_assignment_id, ea.status AS assignment_status
       FROM public.rh_induction_enrollments e
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (enrollmentResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = enrollmentResult.rows[0];
  const assignmentStatus = row.assignment_status ? String(row.assignment_status) : null;
  if (assignmentStatus === 'passed') {
    throwCoded(
      'RH_INDUCTION_ENROLLMENT_ALREADY_PASSED',
      'La fase ya fue aprobada por el colaborador; la inscripcion es evidencia del programa y no puede eliminarse.',
    );
  }
  if (assignmentStatus === 'submitted' || assignmentStatus === 'grading') {
    throwCoded(
      'RH_INDUCTION_ENROLLMENT_EVALUATION_IN_REVIEW',
      'El colaborador ya presento la evaluacion y esta en revision; califica o descarta esa evaluacion antes de eliminar la inscripcion.',
    );
  }

  const pendingAcks = await pool.query(
    `SELECT ri.acknowledgement_id
       FROM public.rh_induction_reading_items ri
       INNER JOIN public.quality_reading_acknowledgements ack ON ack.id = ri.acknowledgement_id
      WHERE ri.enrollment_id = $1 AND ack.signed_at IS NULL;`,
    [enrollmentId],
  );
  const pendingAckIds = pendingAcks.rows.map((ackRow) => Number(ackRow.acknowledgement_id));

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM public.rh_induction_enrollments WHERE id = $1;`, [enrollmentId]);
    if (pendingAckIds.length > 0) {
      // Solo los acuses que ninguna otra inscripcion sigue usando.
      await client.query(
        `DELETE FROM public.quality_reading_acknowledgements ack
          WHERE ack.id = ANY($1::bigint[]) AND ack.signed_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.rh_induction_reading_items ri WHERE ri.acknowledgement_id = ack.id
            );`,
        [pendingAckIds],
      );
    }
    if (row.evaluation_assignment_id && assignmentStatus === 'pending') {
      await client.query(`DELETE FROM public.evaluation_assignments WHERE id = $1 AND status = 'pending';`, [
        Number(row.evaluation_assignment_id),
      ]);
    }
  });
};

export interface RhInductionBulkEnrollmentResult {
  total: number;
  enrolled: number;
  skipped: Array<{ employee_id: number; full_name: string; reason: string }>;
}

const BULK_SKIP_MESSAGES: Record<string, string> = {
  RH_INDUCTION_ALREADY_ENROLLED: 'Ya estaba inscrito en la fase',
  RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED: 'No ha aprobado la fase anterior',
  RH_INDUCTION_EMPLOYEE_WITHOUT_USER: 'Sin usuario de sistema vinculado',
};

/**
 * Inscribe a todos los colaboradores activos en una fase INSTITUCIONAL (1-4)
 * de una sola vez, reutilizando la inscripcion individual colaborador por
 * colaborador para conservar todas sus reglas (gate secuencial, asignacion de
 * lecturas, reuso de acuses previos). Los no elegibles quedan reportados como
 * omitidos con su motivo, sin frenar al resto.
 */
export const enrollAllEmployeesInPhase = async (
  phaseId: number,
  userId: string,
): Promise<RhInductionBulkEnrollmentResult> => {
  const phaseResult = await pool.query(
    `SELECT scope FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phaseResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  if (String(phaseResult.rows[0].scope) !== 'INSTITUTIONAL') {
    throwCoded(
      'RH_INDUCTION_BULK_ONLY_INSTITUTIONAL',
      'La inscripcion masiva solo aplica a las fases institucionales (1 a 4); las fases por puesto se inscriben individualmente.',
    );
  }
  const documents = await getPhaseDocuments(phaseId);
  if (documents.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS', 'Esta fase todavia no tiene documentos configurados.');
  }

  const employees = await pool.query(
    `SELECT id, full_name FROM public.employees WHERE is_active = TRUE ORDER BY full_name ASC;`,
  );
  const result: RhInductionBulkEnrollmentResult = { total: employees.rows.length, enrolled: 0, skipped: [] };
  for (const row of employees.rows) {
    const employeeId = Number(row.id);
    try {
      await enrollEmployeeInPhase(employeeId, phaseId, userId);
      result.enrolled += 1;
    } catch (error: any) {
      result.skipped.push({
        employee_id: employeeId,
        full_name: String(row.full_name),
        reason: BULK_SKIP_MESSAGES[error?.code] ?? String(error?.publicMessage ?? 'No se pudo inscribir'),
      });
    }
  }
  return result;
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
            e.enrolled_by_user_id, e.reading_deadline_at,
            COALESCE(e.training_course_id, p.training_course_id) AS training_course_id,
            p.name AS phase_name, p.responsible_label
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

  // Limite de lectura vencido: la evaluacion se abre aunque la lectura siga
  // incompleta (reading_completed_at se conserva fiel: solo se marca al firmar
  // todo).
  const readingWindowExpired =
    Boolean(enrollment.reading_deadline_at) && new Date(String(enrollment.reading_deadline_at)).getTime() <= Date.now();

  // Sin items solo procede si la lectura ya quedo marcada al inscribir
  // (Fase 6, practica supervisada: no lleva lectura).
  if (!allSigned && !readingWindowExpired && !(itemsResult.rows.length === 0 && enrollment.reading_completed_at)) {
    return;
  }

  if (allSigned && !enrollment.reading_completed_at) {
    await pool.query(
      `UPDATE public.rh_induction_enrollments SET reading_completed_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [enrollmentId],
    );
  }

  if (enrollment.evaluation_assignment_id || !enrollment.training_course_id) {
    return;
  }

  // Auto-vinculo: si ya existe una asignacion del colaborador para el curso de
  // la fase (p. ej. la calificacion practica de Fase 6 capturada por RH, o una
  // evaluacion asignada por fuera), se liga en vez de crear otra.
  const existingAssignment = await pool.query(
    `SELECT a.id FROM public.evaluation_assignments a
       INNER JOIN public.evaluation_templates t ON t.id = a.template_id
      WHERE t.training_course_id = $1 AND a.employee_id = $2
      ORDER BY a.created_at DESC LIMIT 1;`,
    [enrollment.training_course_id, enrollment.employee_id],
  );
  if (existingAssignment.rows.length > 0) {
    await pool.query(
      `UPDATE public.rh_induction_enrollments SET evaluation_assignment_id = $1, updated_at = NOW() WHERE id = $2;`,
      [Number(existingAssignment.rows[0].id), enrollmentId],
    );
    return;
  }

  const templateResult = await pool.query(
    `SELECT id FROM public.evaluation_templates
      WHERE training_course_id = $1 AND status = 'published' AND is_active = TRUE
        AND evaluation_type = 'quiz'
      ORDER BY created_at DESC LIMIT 1;`,
    [enrollment.training_course_id],
  );
  if (templateResult.rows.length === 0) {
    // El responsable de la fase todavia no publica el cuestionario (o la fase
    // es practica y RH aun no captura la calificacion): se reintenta en la
    // proxima llamada.
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
  reading_deadline_at: string | null;
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
      WHERE employee_id = $1 AND evaluation_assignment_id IS NULL
        AND (reading_completed_at IS NOT NULL
             OR (reading_deadline_at IS NOT NULL AND reading_deadline_at <= NOW()));`,
    [employeeId],
  );
  for (const row of pendingResult.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }

  const result = await pool.query(
    `SELECT
        e.id AS enrollment_id, p.id AS phase_id, p.phase_number, p.name AS phase_name, p.responsible_label,
        e.reading_completed_at, e.reading_deadline_at, e.evaluation_assignment_id,
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
    reading_deadline_at: row.reading_deadline_at ? String(row.reading_deadline_at) : null,
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
  reading_deadline_at: string | null;
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
      WHERE phase_id = $1 AND evaluation_assignment_id IS NULL
        AND (reading_completed_at IS NOT NULL
             OR (reading_deadline_at IS NOT NULL AND reading_deadline_at <= NOW()));`,
    [phaseId],
  );
  for (const row of pendingResult.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }

  const result = await pool.query(
    `SELECT
        e.id AS enrollment_id, emp.id AS employee_id, emp.full_name AS employee_name, emp.employee_code,
        e.reading_completed_at, e.reading_deadline_at,
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
    reading_deadline_at: row.reading_deadline_at ? String(row.reading_deadline_at) : null,
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    evaluation_percentage: row.evaluation_percentage !== null && row.evaluation_percentage !== undefined ? Number(row.evaluation_percentage) : null,
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
    supervisor_name: row.supervisor_name ? String(row.supervisor_name) : null,
    checklist_total: Number(row.checklist_total ?? 0),
    checklist_completed: Number(row.checklist_completed ?? 0),
  }));
};

// --- Preparacion de la constancia (control preventivo) -----------------------

export interface RhInductionCertificateReadiness {
  duration_ok: boolean;
  /** Cursos cuya plantilla de constancia emitiria para esta fase, con sus firmas configuradas. */
  courses: Array<{ course_id: number; label: string; signatures_count: number }>;
  employees_missing_branch: Array<{ employee_id: number; full_name: string }>;
  employees_missing_position: Array<{ employee_id: number; full_name: string }>;
  pending_enrollments: number;
}

/**
 * Radiografia de los datos que alimentan la constancia oficial de la fase
 * (PUESTO, SUCURSAL, DURACION y las 3 firmas de la plantilla): permite a RH
 * detectar ANTES de que alguien apruebe que la constancia saldria incompleta.
 * Solo revisa inscripciones cuya constancia aun no se emite (no aprobadas).
 */
export const getPhaseCertificateReadiness = async (
  phaseId: number,
): Promise<RhInductionCertificateReadiness> => {
  const phaseResult = await pool.query(
    `SELECT id, scope, duration_hours, training_course_id FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phaseResult.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  const phase = phaseResult.rows[0];

  // Cursos cuya constancia emite esta fase: el propio (institucional) o el de
  // cada puesto habilitado (fases POSITION).
  const coursesResult =
    String(phase.scope) === 'INSTITUTIONAL'
      ? await pool.query(
          `SELECT tc.id AS course_id, 'Constancia de la fase' AS label
             FROM public.training_courses tc WHERE tc.id = $1;`,
          [phase.training_course_id],
        )
      : await pool.query(
          `SELECT pp.training_course_id AS course_id, 'Puesto: ' || rp.name AS label
             FROM public.rh_induction_phase_positions pp
             INNER JOIN public.rh_positions rp ON rp.id = pp.position_id
            WHERE pp.phase_id = $1
            ORDER BY rp.name;`,
          [phaseId],
        );

  const courses = await Promise.all(
    coursesResult.rows.map(async (row) => {
      const signatures = await pool.query(
        `SELECT COUNT(s.id)::int AS total
           FROM public.certificate_templates ct
           LEFT JOIN public.certificate_template_signatures s ON s.certificate_template_id = ct.id
          WHERE ct.training_course_id = $1
          GROUP BY ct.id;`,
        [Number(row.course_id)],
      );
      return {
        course_id: Number(row.course_id),
        label: String(row.label),
        signatures_count: signatures.rows.length > 0 ? Number(signatures.rows[0].total) : 0,
      };
    }),
  );

  const employeesResult = await pool.query(
    `SELECT emp.id, emp.full_name,
            emp.branch_id IS NULL AS missing_branch,
            NOT EXISTS (
              SELECT 1 FROM public.rh_employee_positions ep
               WHERE ep.employee_id = emp.id AND ep.is_active = TRUE
            ) AS missing_position
       FROM public.rh_induction_enrollments e
       INNER JOIN public.employees emp ON emp.id = e.employee_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.phase_id = $1 AND (ea.status IS DISTINCT FROM 'passed')
      ORDER BY emp.full_name;`,
    [phaseId],
  );

  return {
    duration_ok: phase.duration_hours !== null && phase.duration_hours !== undefined,
    courses,
    employees_missing_branch: employeesResult.rows
      .filter((row) => row.missing_branch)
      .map((row) => ({ employee_id: Number(row.id), full_name: String(row.full_name) })),
    employees_missing_position: employeesResult.rows
      .filter((row) => row.missing_position)
      .map((row) => ({ employee_id: Number(row.id), full_name: String(row.full_name) })),
    pending_enrollments: employeesResult.rows.length,
  };
};

/**
 * Barrido periodico (cron): abre la evaluacion de las inscripciones cuyo
 * limite de lectura ya vencio sin completarse (reutiliza el refresh, que ya
 * contempla el vencimiento). Complementa los refrescos lazy al consultar el
 * progreso, para que el examen se abra aunque nadie visite la pagina.
 */
export const sweepExpiredInductionReadings = async (): Promise<number> => {
  const result = await pool.query(
    `SELECT id FROM public.rh_induction_enrollments
      WHERE reading_deadline_at IS NOT NULL AND reading_deadline_at <= NOW()
        AND evaluation_assignment_id IS NULL AND reading_completed_at IS NULL;`,
  );
  for (const row of result.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }
  return result.rows.length;
};
