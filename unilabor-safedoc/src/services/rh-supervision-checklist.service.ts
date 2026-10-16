import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import {
  summarizeSupervisionResults,
  supervisionFolio,
  type SupervisionConclusion,
  type SupervisionResult,
  type SupervisionSummary,
} from './rh-supervision-checklist.rules';

// -----------------------------------------------------------------------------
// Lista de verificacion de Supervision ANA-REG-060 (rev. 1): captura digital
// por colaborador y puesto. Ligada a una inscripcion de la Fase 6 es la
// evidencia que aprueba la fase (REH-MAN-002 §6.2.2.12); sin inscripcion es la
// supervision periodica de area del ANA-PRC-005. Aqui: alta, edicion en
// borrador, consulta y baja de borradores. El cierre (firmas, PDF, expediente
// y nota a la practica) vive en rh-supervision-checklist-close.service.ts.
// -----------------------------------------------------------------------------

export type SupervisionChecklistStatus = 'DRAFT' | 'CLOSED';
export type SupervisionType = 'PROGRAMADA' | 'NO_PROGRAMADA';

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface SupervisionChecklistItem {
  item_id: number;
  section_code: string;
  section_title: string;
  section_order: number;
  item_no: number;
  item_text: string;
  result: SupervisionResult | null;
  observations: string | null;
  /** El item esta preconfigurado como "no aplica" para el puesto. */
  position_na: boolean;
}

export interface SupervisionChecklistSection {
  section_code: string;
  section_title: string;
  section_order: number;
  items: SupervisionChecklistItem[];
}

export interface SupervisionChecklistListRow {
  id: number;
  folio: string;
  status: SupervisionChecklistStatus;
  form_code: string;
  form_revision: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_code: string;
  position_name: string;
  enrollment_id: number | null;
  supervision_date: string;
  supervision_type: SupervisionType;
  area_name: string | null;
  branch_name: string | null;
  supervisor_name: string;
  area_responsible_name: string;
  compliance_pct: number | null;
  conclusion: SupervisionConclusion | null;
  passed: boolean | null;
  is_final: boolean;
  items_pending: number;
  closed_at: string | null;
  document_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupervisionChecklistRecord extends SupervisionChecklistListRow {
  sgc_follow_up_required: boolean;
  sgc_reference: string | null;
  supervisor_comments: string | null;
  supervisor_user_id: string | null;
  employee_signed: boolean;
  summary: SupervisionSummary;
  sections: SupervisionChecklistSection[];
}

const dateOnly = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '').slice(0, 10);
};

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

const LIST_SELECT = `
  SELECT c.id, c.folio, c.status, c.form_code, c.form_revision, c.employee_id, c.position_id, c.enrollment_id,
         c.supervision_date, c.supervision_type, c.area_name, c.branch_name, c.supervisor_name, c.supervisor_user_id,
         c.area_responsible_name, c.compliance_pct, c.conclusion, c.passed, c.is_final, c.closed_at, c.document_id,
         c.sgc_follow_up_required, c.sgc_reference, c.supervisor_comments, c.employee_signature_path IS NOT NULL AS employee_signed,
         c.created_at, c.updated_at,
         emp.full_name AS employee_name, emp.employee_code,
         rp.code AS position_code, rp.name AS position_name,
         (SELECT count(*) FROM public.rh_supervision_checklist_results r WHERE r.checklist_id = c.id AND r.result IS NULL) AS items_pending
    FROM public.rh_supervision_checklists c
    JOIN public.employees emp ON emp.id = c.employee_id
    JOIN public.rh_positions rp ON rp.id = c.position_id`;

const mapListRow = (row: any): SupervisionChecklistListRow => ({
  id: Number(row.id),
  folio: row.folio ? String(row.folio) : supervisionFolio(Number(row.id)),
  status: String(row.status) as SupervisionChecklistStatus,
  form_code: String(row.form_code),
  form_revision: Number(row.form_revision),
  employee_id: Number(row.employee_id),
  employee_name: String(row.employee_name),
  employee_code: String(row.employee_code),
  position_id: Number(row.position_id),
  position_code: String(row.position_code),
  position_name: String(row.position_name),
  enrollment_id: row.enrollment_id ? Number(row.enrollment_id) : null,
  supervision_date: dateOnly(row.supervision_date),
  supervision_type: String(row.supervision_type) as SupervisionType,
  area_name: row.area_name ? String(row.area_name) : null,
  branch_name: row.branch_name ? String(row.branch_name) : null,
  supervisor_name: String(row.supervisor_name ?? ''),
  area_responsible_name: String(row.area_responsible_name ?? ''),
  compliance_pct: row.compliance_pct === null || row.compliance_pct === undefined ? null : Number(row.compliance_pct),
  conclusion: row.conclusion ? (String(row.conclusion) as SupervisionConclusion) : null,
  passed: row.passed === null || row.passed === undefined ? null : Boolean(row.passed),
  is_final: Boolean(row.is_final),
  items_pending: Number(row.items_pending ?? 0),
  closed_at: iso(row.closed_at),
  document_id: row.document_id ? Number(row.document_id) : null,
  created_at: iso(row.created_at) ?? '',
  updated_at: iso(row.updated_at) ?? '',
});

const loadSections = async (checklistId: number, positionId: number): Promise<SupervisionChecklistSection[]> => {
  const result = await pool.query(
    `SELECT i.id AS item_id, i.section_code, i.section_title, i.section_order, i.item_no, i.item_text,
            r.result, r.observations,
            EXISTS (SELECT 1 FROM public.rh_position_supervision_na_items na WHERE na.position_id = $2 AND na.item_id = i.id) AS position_na
       FROM public.rh_supervision_checklist_results r
       JOIN public.rh_supervision_form_items i ON i.id = r.item_id
      WHERE r.checklist_id = $1
      ORDER BY i.section_order ASC, i.item_no ASC;`,
    [checklistId, positionId],
  );
  const sections: SupervisionChecklistSection[] = [];
  for (const row of result.rows) {
    const item: SupervisionChecklistItem = {
      item_id: Number(row.item_id),
      section_code: String(row.section_code),
      section_title: String(row.section_title),
      section_order: Number(row.section_order),
      item_no: Number(row.item_no),
      item_text: String(row.item_text),
      result: row.result ? (String(row.result) as SupervisionResult) : null,
      observations: row.observations ? String(row.observations) : null,
      position_na: Boolean(row.position_na),
    };
    let section = sections[sections.length - 1];
    if (!section || section.section_code !== item.section_code) {
      section = { section_code: item.section_code, section_title: item.section_title, section_order: item.section_order, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
};

/** Registro completo (cabecera + secciones + resumen en vivo). */
export const getSupervisionChecklist = async (id: number): Promise<SupervisionChecklistRecord> => {
  const result = await pool.query(`${LIST_SELECT} WHERE c.id = $1 LIMIT 1;`, [id]);
  if (result.rows.length === 0) {
    return throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
  }
  const row = result.rows[0];
  const base = mapListRow(row);
  const sections = await loadSections(base.id, base.position_id);
  const summary = summarizeSupervisionResults(sections.flatMap((section) => section.items.map((item) => item.result)));
  return {
    ...base,
    sgc_follow_up_required: Boolean(row.sgc_follow_up_required),
    sgc_reference: row.sgc_reference ? String(row.sgc_reference) : null,
    supervisor_comments: row.supervisor_comments ? String(row.supervisor_comments) : null,
    supervisor_user_id: row.supervisor_user_id ? String(row.supervisor_user_id) : null,
    employee_signed: Boolean(row.employee_signed),
    summary,
    sections,
  };
};

// --- Catalogo del formato ----------------------------------------------------

export interface SupervisionFormItem {
  id: number;
  form_code: string;
  form_revision: number;
  section_code: string;
  section_title: string;
  section_order: number;
  item_no: number;
  item_text: string;
}

export const listSupervisionFormItems = async (): Promise<SupervisionFormItem[]> => {
  const result = await pool.query(
    `SELECT id, form_code, form_revision, section_code, section_title, section_order, item_no, item_text
       FROM public.rh_supervision_form_items
      WHERE is_active = TRUE
      ORDER BY form_revision DESC, section_order ASC, item_no ASC;`,
  );
  // Solo la revision vigente (la mas alta activa).
  const latest = result.rows.length > 0 ? Number(result.rows[0].form_revision) : 1;
  return result.rows
    .filter((row) => Number(row.form_revision) === latest)
    .map((row) => ({
      id: Number(row.id),
      form_code: String(row.form_code),
      form_revision: Number(row.form_revision),
      section_code: String(row.section_code),
      section_title: String(row.section_title),
      section_order: Number(row.section_order),
      item_no: Number(row.item_no),
      item_text: String(row.item_text),
    }));
};

// --- Alta --------------------------------------------------------------------

export interface CreateSupervisionChecklistInput {
  /** Opcionales cuando viene enrollmentId (se resuelven de la inscripcion). */
  employeeId?: number | null | undefined;
  positionId?: number | null | undefined;
  /** Inscripcion de la Fase 6 a la que se liga; si se omite, se busca la activa del puesto. */
  enrollmentId?: number | null;
  supervisionDate: string;
  supervisionType?: SupervisionType | undefined;
  supervisorName?: string | null | undefined;
  areaResponsibleName?: string | null | undefined;
  areaName?: string | null | undefined;
  createdByUserId: string | null;
  /** true = si ya hay un borrador de la misma inscripcion, se devuelve ese en vez de crear otro. */
  reuseDraft?: boolean | undefined;
}

interface EnrollmentFacts {
  id: number;
  employee_id: number;
  position_id: number;
  queue_status: string;
  phase_number: number;
}

const loadEnrollmentFacts = async (enrollmentId: number): Promise<EnrollmentFacts | null> => {
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.position_id, e.queue_status, p.phase_number
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    employee_id: Number(row.employee_id),
    position_id: row.position_id ? Number(row.position_id) : 0,
    queue_status: String(row.queue_status),
    phase_number: Number(row.phase_number),
  };
};

const findActivePhase6Enrollment = async (employeeId: number, positionId: number): Promise<number | null> => {
  const result = await pool.query(
    `SELECT e.id FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
      WHERE e.employee_id = $1 AND e.position_id = $2 AND e.queue_status = 'ACTIVE'
      ORDER BY e.id DESC LIMIT 1;`,
    [employeeId, positionId],
  );
  return result.rows.length > 0 ? Number(result.rows[0].id) : null;
};

export const createSupervisionChecklist = async (raw: CreateSupervisionChecklistInput): Promise<SupervisionChecklistRecord> => {
  const input = { ...raw } as CreateSupervisionChecklistInput & { employeeId: number; positionId: number };
  if (input.enrollmentId && (!input.employeeId || !input.positionId)) {
    const facts = await loadEnrollmentFacts(input.enrollmentId);
    if (!facts) {
      return throwCoded('RH_SUPERVISION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
    }
    input.employeeId = facts.employee_id;
    input.positionId = facts.position_id;
  }
  if (!input.employeeId || !input.positionId) {
    return throwCoded('RH_SUPERVISION_POSITION_NOT_FOUND', 'Indica el colaborador y el puesto de la supervision.');
  }
  const employee = await pool.query(
    `SELECT emp.id, emp.full_name, emp.area, emp.is_active, bu.name AS branch_name
       FROM public.employees emp
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
      WHERE emp.id = $1 LIMIT 1;`,
    [input.employeeId],
  );
  if (employee.rows.length === 0 || !employee.rows[0].is_active) {
    return throwCoded('RH_SUPERVISION_EMPLOYEE_NOT_FOUND', 'El colaborador no existe o esta inactivo.');
  }
  const position = await pool.query(`SELECT id FROM public.rh_positions WHERE id = $1 AND is_active = TRUE LIMIT 1;`, [input.positionId]);
  if (position.rows.length === 0) {
    return throwCoded('RH_SUPERVISION_POSITION_NOT_FOUND', 'El puesto no existe o esta inactivo.');
  }

  let enrollmentId: number | null = null;
  if (input.enrollmentId) {
    const facts = await loadEnrollmentFacts(input.enrollmentId);
    if (!facts || facts.employee_id !== input.employeeId) {
      return throwCoded('RH_SUPERVISION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe o no es de este colaborador.');
    }
    if (facts.phase_number !== 6 || facts.position_id !== input.positionId) {
      return throwCoded('RH_SUPERVISION_ENROLLMENT_MISMATCH', 'La inscripcion no corresponde a la Fase 6 de este puesto.');
    }
    if (facts.queue_status === 'CANCELLED') {
      return throwCoded('RH_SUPERVISION_ENROLLMENT_CANCELLED', 'La inscripcion de la Fase 6 fue dada de baja.');
    }
    enrollmentId = facts.id;
  } else {
    enrollmentId = await findActivePhase6Enrollment(input.employeeId, input.positionId);
  }

  if (enrollmentId && input.reuseDraft !== false) {
    const draft = await pool.query(
      `SELECT id FROM public.rh_supervision_checklists WHERE enrollment_id = $1 AND status = 'DRAFT' ORDER BY id DESC LIMIT 1;`,
      [enrollmentId],
    );
    if (draft.rows.length > 0) {
      return getSupervisionChecklist(Number(draft.rows[0].id));
    }
  }

  let supervisorName = (input.supervisorName ?? '').trim();
  if (!supervisorName && input.createdByUserId) {
    const actor = await pool.query(`SELECT full_name FROM public.users WHERE id = $1 LIMIT 1;`, [input.createdByUserId]);
    supervisorName = String(actor.rows[0]?.full_name ?? '').trim();
  }

  const items = await listSupervisionFormItems();
  if (items.length === 0) {
    return throwCoded('RH_SUPERVISION_FORM_EMPTY', 'El catalogo de items del ANA-REG-060 esta vacio.');
  }
  const naItems = await pool.query(`SELECT item_id FROM public.rh_position_supervision_na_items WHERE position_id = $1;`, [
    input.positionId,
  ]);
  const naSet = new Set(naItems.rows.map((row) => Number(row.item_id)));

  const id = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.rh_supervision_checklists
         (form_code, form_revision, employee_id, position_id, enrollment_id, supervision_date, supervision_type,
          area_name, branch_name, supervisor_name, supervisor_user_id, area_responsible_name, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id;`,
      [
        items[0]!.form_code,
        items[0]!.form_revision,
        input.employeeId,
        input.positionId,
        enrollmentId,
        input.supervisionDate,
        input.supervisionType ?? 'PROGRAMADA',
        (input.areaName ?? employee.rows[0].area ?? null) || null,
        employee.rows[0].branch_name ? String(employee.rows[0].branch_name) : null,
        supervisorName,
        input.createdByUserId,
        (input.areaResponsibleName ?? '').trim(),
        input.createdByUserId,
      ],
    );
    const checklistId = Number(inserted.rows[0].id);
    await client.query(`UPDATE public.rh_supervision_checklists SET folio = $2 WHERE id = $1;`, [checklistId, supervisionFolio(checklistId)]);
    for (const item of items) {
      await client.query(
        `INSERT INTO public.rh_supervision_checklist_results (checklist_id, item_id, result) VALUES ($1, $2, $3);`,
        [checklistId, item.id, naSet.has(item.id) ? 'NA' : null],
      );
    }
    return checklistId;
  });
  return getSupervisionChecklist(id);
};

// --- Edicion en borrador -----------------------------------------------------

export interface UpdateSupervisionChecklistInput {
  supervisionDate?: string | undefined;
  supervisionType?: SupervisionType | undefined;
  areaName?: string | null | undefined;
  supervisorName?: string | undefined;
  areaResponsibleName?: string | undefined;
  sgcFollowUpRequired?: boolean | undefined;
  sgcReference?: string | null | undefined;
  supervisorComments?: string | null | undefined;
}

const assertDraft = async (id: number): Promise<void> => {
  const result = await pool.query(`SELECT status FROM public.rh_supervision_checklists WHERE id = $1 LIMIT 1;`, [id]);
  if (result.rows.length === 0) {
    throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
  }
  if (String(result.rows[0].status) !== 'DRAFT') {
    throwCoded('RH_SUPERVISION_ALREADY_CLOSED', 'La lista ya esta cerrada y firmada; no se puede modificar.');
  }
};

export const updateSupervisionChecklist = async (id: number, input: UpdateSupervisionChecklistInput): Promise<SupervisionChecklistRecord> => {
  await assertDraft(id);
  const sets: string[] = [];
  const params: unknown[] = [id];
  const push = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (input.supervisionDate !== undefined) push('supervision_date', input.supervisionDate, '::date');
  if (input.supervisionType !== undefined) push('supervision_type', input.supervisionType);
  if (input.areaName !== undefined) push('area_name', input.areaName?.trim() || null);
  if (input.supervisorName !== undefined) push('supervisor_name', input.supervisorName.trim());
  if (input.areaResponsibleName !== undefined) push('area_responsible_name', input.areaResponsibleName.trim());
  if (input.sgcFollowUpRequired !== undefined) push('sgc_follow_up_required', input.sgcFollowUpRequired);
  if (input.sgcReference !== undefined) push('sgc_reference', input.sgcReference?.trim() || null);
  if (input.supervisorComments !== undefined) push('supervisor_comments', input.supervisorComments?.trim() || null);
  if (sets.length > 0) {
    await pool.query(`UPDATE public.rh_supervision_checklists SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1;`, params);
  }
  return getSupervisionChecklist(id);
};

export interface SupervisionResultInput {
  item_id: number;
  result: SupervisionResult | null;
  observations?: string | null;
}

/** Guarda (parcial o total) los resultados de los items del borrador. */
export const saveSupervisionResults = async (id: number, results: SupervisionResultInput[]): Promise<SupervisionChecklistRecord> => {
  await assertDraft(id);
  await withTransaction(async (client) => {
    for (const entry of results) {
      await client.query(
        `UPDATE public.rh_supervision_checklist_results
            SET result = $3, observations = $4, updated_at = NOW()
          WHERE checklist_id = $1 AND item_id = $2;`,
        [id, entry.item_id, entry.result, entry.observations?.trim() || null],
      );
    }
  });
  return getSupervisionChecklist(id);
};

/** Un borrador sin firmas no es evidencia: se puede eliminar. Las cerradas nunca. */
export const deleteSupervisionDraft = async (id: number): Promise<void> => {
  await assertDraft(id);
  await pool.query(`DELETE FROM public.rh_supervision_checklists WHERE id = $1 AND status = 'DRAFT';`, [id]);
};

// --- Listado -----------------------------------------------------------------

export interface SupervisionChecklistQuery {
  status?: SupervisionChecklistStatus | undefined;
  employeeId?: number | undefined;
  positionId?: number | undefined;
  enrollmentId?: number | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

export interface SupervisionChecklistPage {
  rows: SupervisionChecklistListRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export const listSupervisionChecklists = async (query: SupervisionChecklistQuery): Promise<SupervisionChecklistPage> => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace('?', `$${params.length}`));
  };
  if (query.status) add('c.status = ?', query.status);
  if (query.employeeId) add('c.employee_id = ?', query.employeeId);
  if (query.positionId) add('c.position_id = ?', query.positionId);
  if (query.enrollmentId) add('c.enrollment_id = ?', query.enrollmentId);
  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    const n = `$${params.length}`;
    clauses.push(
      `(emp.full_name ILIKE ${n} OR emp.employee_code ILIKE ${n} OR rp.code ILIKE ${n} OR rp.name ILIKE ${n}` +
        ` OR COALESCE(c.folio, '') ILIKE ${n} OR COALESCE(c.area_name, '') ILIKE ${n})`,
    );
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await pool.query(
    `SELECT count(*) AS total FROM public.rh_supervision_checklists c
       JOIN public.employees emp ON emp.id = c.employee_id
       JOIN public.rh_positions rp ON rp.id = c.position_id ${where};`,
    params,
  );
  const total = Number(count.rows[0]?.total ?? 0);
  const limit = Math.max(1, Math.min(100, query.limit));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const rows = await pool.query(`${LIST_SELECT} ${where} ORDER BY c.supervision_date DESC, c.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit};`, params);
  return { rows: rows.rows.map(mapListRow), total, page, limit, total_pages: totalPages };
};
