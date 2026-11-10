import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { getCompetencySuggestedSigners } from './rh-competency-signers.service';
import { assertNoDocumentSignatures } from './rh-document-signature.service';

// -----------------------------------------------------------------------------
// Carta de asignacion de puesto REH-REG-008 (Fase 7, una por puesto). Se abre
// en borrador al AUTORIZAR el REH-REG-003 inicial del puesto, con las
// autorizaciones del puesto prellenadas (las 1-8 "a todos" en Si por defecto,
// pero se pueden negar) y
// los firmantes sugeridos. RH la revisa y la envia al Buzon de firmas, donde
// firman el colaborador, la Coordinacion del area y el Director General; con la
// tercera firma se cierra sola (rh-assignment-letter-signature.service.ts): PDF
// oficial archivado en el expediente. Una carta cerrada no se modifica.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

export type AssignmentLetterStatus = 'DRAFT' | 'CLOSED';

export interface AssignmentAuthorizationItem {
  id: number;
  item_no: number;
  item_text: string;
  applies_to_all: boolean;
  /** Etiqueta orientativa en pantalla (p. ej. CSI en 75-80). */
  scope_label: string | null;
  /** Seccion tematica para agrupar en pantalla. */
  group_order: number | null;
  group_label: string | null;
}

export interface AssignmentLetterItem extends AssignmentAuthorizationItem {
  authorized: boolean;
}

export interface AssignmentLetterRecord {
  id: number;
  folio: string;
  form_code: string;
  form_revision: number;
  status: AssignmentLetterStatus;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_code: string;
  position_name: string;
  competency_evaluation_id: number | null;
  letter_date: string;
  area_name: string | null;
  position_description_name: string | null;
  other_authorizations: string | null;
  area_signatory_employee_id: number | null;
  area_signatory_name: string;
  director_signatory_employee_id: number | null;
  director_signatory_name: string;
  /** En firma: borrador bloqueado esperando las firmas del Buzon (sigue en DRAFT). */
  in_signature: boolean;
  signature_requested_at: string | null;
  signature_requested_by_name: string | null;
  document_id: number | null;
  closed_at: string | null;
  created_at: string;
  items: AssignmentLetterItem[];
}

const folioOf = (id: number): string => `REH-REG-008-${String(id).padStart(5, '0')}`;
const todayInMexico = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const dateOnly = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);
const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

// --- Catalogo y configuracion por puesto --------------------------------------

export const listAuthorizationItems = async (): Promise<AssignmentAuthorizationItem[]> => {
  const result = await pool.query(
    `SELECT id, item_no, item_text, applies_to_all, scope_label, group_order, group_label
       FROM public.rh_assignment_authorization_items
      WHERE is_active = TRUE
        AND form_revision = (SELECT max(form_revision) FROM public.rh_assignment_authorization_items WHERE is_active = TRUE)
      ORDER BY item_no ASC;`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    item_no: Number(row.item_no),
    item_text: String(row.item_text),
    applies_to_all: Boolean(row.applies_to_all),
    scope_label: row.scope_label ? String(row.scope_label) : null,
    group_order: row.group_order !== null && row.group_order !== undefined ? Number(row.group_order) : null,
    group_label: row.group_label ? String(row.group_label) : null,
  }));
};

/**
 * Autorizaciones que aplican al puesto. Sin configuracion guardada, el puesto
 * toma por defecto las generales (1-8 "a todos").
 */
export const getPositionAuthorizations = async (positionId: number): Promise<number[]> => {
  const result = await pool.query(`SELECT item_id FROM public.rh_position_assignment_authorizations WHERE position_id = $1 ORDER BY item_id;`, [
    positionId,
  ]);
  if (result.rows.length > 0) return result.rows.map((row) => Number(row.item_id));
  return (await listAuthorizationItems()).filter((item) => item.applies_to_all).map((item) => item.id);
};

export const setPositionAuthorizations = async (positionId: number, itemIds: number[], actorUserId: string | null): Promise<number[]> => {
  const position = await pool.query(`SELECT id FROM public.rh_positions WHERE id = $1 LIMIT 1;`, [positionId]);
  if (position.rows.length === 0) throwCoded('RH_ASSIGNMENT_POSITION_NOT_FOUND', 'El puesto no existe.');
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM public.rh_position_assignment_authorizations WHERE position_id = $1;`, [positionId]);
    await client.query(
      `INSERT INTO public.rh_position_assignment_authorizations (position_id, item_id, updated_by_user_id)
       SELECT $1, i.id, $3 FROM public.rh_assignment_authorization_items i
        WHERE i.id = ANY($2::bigint[]) AND i.is_active = TRUE
       ON CONFLICT DO NOTHING;`,
      [positionId, itemIds, actorUserId],
    );
  });
  return getPositionAuthorizations(positionId);
};

// --- Consulta -----------------------------------------------------------------

const LETTER_SELECT = `
  SELECT l.*, emp.full_name AS employee_name, emp.employee_code, rp.code AS position_code, rp.name AS position_name,
         sr.full_name AS signature_requested_by_name
    FROM public.rh_assignment_letters l
    JOIN public.employees emp ON emp.id = l.employee_id
    JOIN public.rh_positions rp ON rp.id = l.position_id
    LEFT JOIN public.users sr ON sr.id = l.signature_requested_by_user_id`;

const mapLetter = (row: any, items: AssignmentLetterItem[]): AssignmentLetterRecord => ({
  id: Number(row.id),
  folio: row.folio ? String(row.folio) : folioOf(Number(row.id)),
  form_code: String(row.form_code),
  form_revision: Number(row.form_revision),
  status: String(row.status) as AssignmentLetterStatus,
  employee_id: Number(row.employee_id),
  employee_name: String(row.employee_name),
  employee_code: String(row.employee_code),
  position_id: Number(row.position_id),
  position_code: String(row.position_code),
  position_name: String(row.position_name),
  competency_evaluation_id: row.competency_evaluation_id ? Number(row.competency_evaluation_id) : null,
  letter_date: dateOnly(row.letter_date),
  area_name: row.area_name ? String(row.area_name) : null,
  position_description_name: row.position_description_name ? String(row.position_description_name) : null,
  other_authorizations: row.other_authorizations ? String(row.other_authorizations) : null,
  area_signatory_employee_id: row.area_signatory_employee_id ? Number(row.area_signatory_employee_id) : null,
  area_signatory_name: String(row.area_signatory_name ?? ''),
  director_signatory_employee_id: row.director_signatory_employee_id ? Number(row.director_signatory_employee_id) : null,
  director_signatory_name: String(row.director_signatory_name ?? ''),
  in_signature: String(row.status) === 'DRAFT' && Boolean(row.signature_requested_at),
  signature_requested_at: iso(row.signature_requested_at),
  signature_requested_by_name: row.signature_requested_by_name ? String(row.signature_requested_by_name) : null,
  document_id: row.document_id ? Number(row.document_id) : null,
  closed_at: iso(row.closed_at),
  created_at: iso(row.created_at) ?? '',
  items,
});

const loadItems = async (letterId: number): Promise<AssignmentLetterItem[]> => {
  const result = await pool.query(
    `SELECT i.id, i.item_no, i.item_text, i.applies_to_all, i.scope_label, i.group_order, i.group_label, li.authorized
       FROM public.rh_assignment_letter_items li
       JOIN public.rh_assignment_authorization_items i ON i.id = li.item_id
      WHERE li.letter_id = $1
      ORDER BY i.item_no ASC;`,
    [letterId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    item_no: Number(row.item_no),
    item_text: String(row.item_text),
    applies_to_all: Boolean(row.applies_to_all),
    scope_label: row.scope_label ? String(row.scope_label) : null,
    group_order: row.group_order !== null && row.group_order !== undefined ? Number(row.group_order) : null,
    group_label: row.group_label ? String(row.group_label) : null,
    authorized: Boolean(row.authorized),
  }));
};

export const getAssignmentLetter = async (id: number): Promise<AssignmentLetterRecord> => {
  const result = await pool.query(`${LETTER_SELECT} WHERE l.id = $1 LIMIT 1;`, [id]);
  if (result.rows.length === 0) return throwCoded('RH_ASSIGNMENT_LETTER_NOT_FOUND', 'La carta de asignacion no existe.');
  return mapLetter(result.rows[0], await loadItems(id));
};

export interface AssignmentLetterListRow extends Omit<AssignmentLetterRecord, 'items'> {
  authorized_count: number;
}

export const listAssignmentLetters = async (query: { status?: AssignmentLetterStatus | undefined; search?: string | undefined }): Promise<AssignmentLetterListRow[]> => {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (query.status) {
    params.push(query.status);
    clauses.push(`l.status = $${params.length}`);
  }
  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    const n = `$${params.length}`;
    clauses.push(`(emp.full_name ILIKE ${n} OR emp.employee_code ILIKE ${n} OR rp.code ILIKE ${n} OR rp.name ILIKE ${n} OR COALESCE(l.folio, '') ILIKE ${n})`);
  }
  const result = await pool.query(
    `SELECT q.*, (SELECT count(*) FROM public.rh_assignment_letter_items li WHERE li.letter_id = q.id AND li.authorized) AS authorized_count
       FROM (${LETTER_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}) q
      ORDER BY (q.status = 'DRAFT') DESC, q.letter_date DESC, q.id DESC
      LIMIT 300;`,
    params,
  );
  return result.rows.map((row) => ({ ...mapLetter(row, []), authorized_count: Number(row.authorized_count ?? 0) }));
};

// --- Alta al autorizar el REH-REG-003 ----------------------------------------

const AUTHORIZED_RESULTS = ['AUTORIZADO', 'AUTORIZADO_CON_SEGUIMIENTO'];

/** Abre (idempotente) el borrador de la carta del puesto de un REH-REG-003 inicial autorizado. */
export const createLetterForEvaluation = async (evaluationId: number, actorUserId: string | null): Promise<AssignmentLetterRecord> => {
  const existing = await pool.query(`SELECT id FROM public.rh_assignment_letters WHERE competency_evaluation_id = $1 LIMIT 1;`, [evaluationId]);
  if (existing.rows.length > 0) return getAssignmentLetter(Number(existing.rows[0].id));
  const evaluation = await pool.query(
    `SELECT ce.id, ce.employee_id, ce.position_id, ce.status, ce.evaluation_type, ce.authorization_result,
            rp.name AS position_name, pa.name AS area_name
       FROM public.rh_competency_evaluations ce
       JOIN public.rh_positions rp ON rp.id = ce.position_id
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
      WHERE ce.id = $1 LIMIT 1;`,
    [evaluationId],
  );
  const row = evaluation.rows[0];
  if (!row) return throwCoded('RH_ASSIGNMENT_EVALUATION_NOT_FOUND', 'La evaluacion de competencia no existe.');
  if (String(row.evaluation_type) !== 'INICIAL' || String(row.status) !== 'CLOSED' || !AUTHORIZED_RESULTS.includes(String(row.authorization_result))) {
    return throwCoded(
      'RH_ASSIGNMENT_EVALUATION_NOT_AUTHORIZED',
      'La carta de asignacion se emite cuando el REH-REG-003 inicial del puesto esta autorizado.',
    );
  }
  // Responsable del area (id y nombre) y Director General salen de la misma sugerencia del REH-REG-003.
  const signers = await getCompetencySuggestedSigners(evaluationId);
  const items = await listAuthorizationItems();
  const positionItems = new Set(await getPositionAuthorizations(Number(row.position_id)));
  const id = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.rh_assignment_letters
         (employee_id, position_id, competency_evaluation_id, letter_date, area_name, position_description_name,
          area_signatory_employee_id, area_signatory_name, director_signatory_name, created_by_user_id,
          director_signatory_employee_id)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11) RETURNING id;`,
      [
        row.employee_id,
        row.position_id,
        evaluationId,
        todayInMexico(),
        row.area_name ? String(row.area_name) : null,
        String(row.position_name),
        signers?.area_employee_id ?? null,
        signers?.area ?? '',
        signers?.director ?? '',
        actorUserId,
        signers?.director_employee_id ?? null,
      ],
    );
    const letterId = Number(inserted.rows[0].id);
    await client.query(`UPDATE public.rh_assignment_letters SET folio = $2 WHERE id = $1;`, [letterId, folioOf(letterId)]);
    for (const item of items) {
      await client.query(`INSERT INTO public.rh_assignment_letter_items (letter_id, item_id, authorized) VALUES ($1, $2, $3);`, [
        letterId,
        item.id,
        positionItems.has(item.id),
      ]);
    }
    return letterId;
  });
  return getAssignmentLetter(id);
};

/** Best-effort para el gancho de autorizacion: nunca lanza. */
export const tryCreateLetterForEvaluation = async (evaluationId: number, actorUserId: string | null): Promise<AssignmentLetterRecord | null> => {
  try {
    return await createLetterForEvaluation(evaluationId, actorUserId);
  } catch (error: any) {
    if (error?.code !== 'RH_ASSIGNMENT_EVALUATION_NOT_AUTHORIZED') {
      console.error(`REH-REG-008: no se pudo abrir la carta del REH-REG-003 ${evaluationId}:`, error);
    }
    return null;
  }
};

/** Abre las cartas que falten para los REH-REG-003 iniciales ya autorizados. */
export const generatePendingLetters = async (actorUserId: string | null): Promise<number> => {
  const pending = await pool.query(
    `SELECT ce.id FROM public.rh_competency_evaluations ce
      WHERE ce.evaluation_type = 'INICIAL' AND ce.status = 'CLOSED' AND ce.authorization_result = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM public.rh_assignment_letters l WHERE l.competency_evaluation_id = ce.id)
      ORDER BY ce.id;`,
    [AUTHORIZED_RESULTS],
  );
  let created = 0;
  for (const row of pending.rows) {
    if (await tryCreateLetterForEvaluation(Number(row.id), actorUserId)) created += 1;
  }
  return created;
};

// --- Edicion en borrador -------------------------------------------------------

/** Un borrador que se puede editar: ni cerrado ni en firma. */
export const assertLetterEditable = (letter: AssignmentLetterRecord): void => {
  if (letter.status !== 'DRAFT') throwCoded('RH_ASSIGNMENT_LETTER_CLOSED', 'La carta ya esta firmada; no se puede modificar.');
  if (letter.in_signature) {
    throwCoded(
      'RH_ASSIGNMENT_LETTER_IN_SIGNATURE',
      'La carta esta en firma en el Buzon y no se puede modificar. Si necesitas corregirla, cancela el envio a firma (las firmas recabadas se invalidan).',
    );
  }
};

export interface UpdateAssignmentLetterInput {
  letterDate?: string | undefined;
  otherAuthorizations?: string | null | undefined;
  /** Firmantes como colaboradores (firman en su Buzon); el nombre sale de la ficha. Omitidos = no cambian. */
  areaSignatoryEmployeeId?: number | undefined;
  directorSignatoryEmployeeId?: number | undefined;
  items?: Array<{ item_id: number; authorized: boolean }> | undefined;
}

const employeeName = async (employeeId: number | undefined): Promise<string | null> => {
  if (employeeId === undefined) return null;
  const result = await pool.query(`SELECT full_name FROM public.employees WHERE id = $1;`, [employeeId]);
  if (result.rows.length === 0) return throwCoded('RH_ASSIGNMENT_SIGNER_NOT_FOUND', 'El firmante elegido no existe.');
  return String(result.rows[0].full_name);
};

export const updateAssignmentLetter = async (id: number, input: UpdateAssignmentLetterInput): Promise<AssignmentLetterRecord> => {
  const letter = await getAssignmentLetter(id);
  assertLetterEditable(letter);
  if (input.areaSignatoryEmployeeId === letter.employee_id || input.directorSignatoryEmployeeId === letter.employee_id) {
    throwCoded('RH_ASSIGNMENT_SELF_SIGNATURE', 'El colaborador no puede firmar como otro rol de su propia carta.');
  }
  const [areaName, directorName] = await Promise.all([employeeName(input.areaSignatoryEmployeeId), employeeName(input.directorSignatoryEmployeeId)]);
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.rh_assignment_letters
          SET letter_date = COALESCE($2::date, letter_date),
              other_authorizations = CASE WHEN $3::boolean THEN $4 ELSE other_authorizations END,
              area_signatory_employee_id = COALESCE($5, area_signatory_employee_id),
              area_signatory_name = COALESCE($6, area_signatory_name),
              director_signatory_employee_id = COALESCE($7, director_signatory_employee_id),
              director_signatory_name = COALESCE($8, director_signatory_name),
              updated_at = NOW()
        WHERE id = $1;`,
      [
        id,
        input.letterDate ?? null,
        input.otherAuthorizations !== undefined,
        input.otherAuthorizations?.trim() || null,
        input.areaSignatoryEmployeeId ?? null,
        areaName,
        input.directorSignatoryEmployeeId ?? null,
        directorName,
      ],
    );
    for (const item of input.items ?? []) {
      // Tambien las generales ("a todos") se pueden negar para un colaborador.
      await client.query(`UPDATE public.rh_assignment_letter_items SET authorized = $3 WHERE letter_id = $1 AND item_id = $2;`, [
        id,
        item.item_id,
        item.authorized,
      ]);
    }
  });
  return getAssignmentLetter(id);
};

export const deleteAssignmentLetterDraft = async (id: number): Promise<void> => {
  assertLetterEditable(await getAssignmentLetter(id));
  await assertNoDocumentSignatures('ASSIGNMENT_LETTER', id);
  await pool.query(`DELETE FROM public.rh_assignment_letters WHERE id = $1 AND status = 'DRAFT' AND signature_requested_at IS NULL;`, [id]);
};
