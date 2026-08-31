import fs from 'fs';
import pool from '../config/db';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { buildCompetencyEvaluationPdf } from './rh-competency-evaluation.pdf';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

/**
 * Motor del REH-REG-003 (Evaluacion de competencia tecnica, desempeno laboral
 * y conocimientos): el instrumento de la Fase 7 de Induccion y de la
 * reevaluacion anual. TODO el calculo es server-side y se sella al cerrar:
 *
 *  - Valor por criticidad: A=5, M=3, B=1. Calificacion 1-4 por item.
 *  - % de seccion = suma(calif x valor) / (suma(valor de items calificados) x 4).
 *  - Conocimiento: correcta=4, incorrecta=1 (derivado de is_correct).
 *  - Final = competencia x 0.50 + desempeno x 0.20 + conocimiento x 0.30.
 *  - VETO: una COMPETENCIA de criticidad A con calif < 3 dictamina
 *    NO_COMPETENTE aunque el porcentaje global apruebe (restriccion
 *    obligatoria del registro).
 *  - Dictamen: >=90 COMPETENTE_Y_AUTORIZADO / 80-89 CON_OBSERVACIONES /
 *    70-79 BAJO_SUPERVISION / <70 NO_COMPETENTE.
 *  - Vigencia de la autorizacion: 12 meses (exigencia ema).
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export type CompetencyCriticality = 'A' | 'M' | 'B';
export type CompetencySection = 'COMPETENCIA' | 'DESEMPENO' | 'CONOCIMIENTO';
export type CompetencyEvaluationType = 'INICIAL' | 'PERIODICA' | 'REEVALUACION' | 'CAMBIO_PUESTO' | 'POST_CAPACITACION';
export type CompetencyDictamen =
  | 'COMPETENTE_Y_AUTORIZADO'
  | 'COMPETENTE_CON_OBSERVACIONES'
  | 'COMPETENTE_BAJO_SUPERVISION'
  | 'NO_COMPETENTE';

export const DICTAMEN_LABELS: Record<CompetencyDictamen, string> = {
  COMPETENTE_Y_AUTORIZADO: 'COMPETENTE Y AUTORIZADO',
  COMPETENTE_CON_OBSERVACIONES: 'COMPETENTE CON OBSERVACIONES',
  COMPETENTE_BAJO_SUPERVISION: 'COMPETENTE BAJO SUPERVISIÓN',
  NO_COMPETENTE: 'NO COMPETENTE',
};

export const AUTHORIZATION_LABELS: Record<string, string> = {
  AUTORIZADO: 'AUTORIZADO',
  AUTORIZADO_CON_SEGUIMIENTO: 'AUTORIZADO CON SEGUIMIENTO',
  NO_AUTORIZADO: 'NO AUTORIZADO',
};

const CRITICALITY_VALUE: Record<CompetencyCriticality, number> = { A: 5, M: 3, B: 1 };

export interface CompetencyEvaluationItem {
  id?: number;
  section: CompetencySection;
  item_text: string;
  criticality: CompetencyCriticality;
  method: string | null;
  score: number | null;
  expected_answer: string | null;
  given_answer: string | null;
  is_correct: boolean | null;
  observations: string | null;
  sort_order: number;
}

export interface CompetencyEvaluationAction {
  id?: number;
  improvement_area: string;
  required_action: string;
  responsible: string | null;
  due_date: string | null;
  follow_up: string | null;
  sort_order: number;
}

export interface CompetencyEvaluationResults {
  competency_pct: number | null;
  performance_pct: number | null;
  knowledge_pct: number | null;
  final_pct: number | null;
  veto_applied: boolean;
  dictamen: CompetencyDictamen | null;
  authorization_result: string | null;
}

/** Calificacion efectiva de un item (conocimiento deriva 4/1 de is_correct). */
const effectiveScore = (item: CompetencyEvaluationItem): number | null => {
  if (item.section === 'CONOCIMIENTO') {
    if (item.is_correct === null || item.is_correct === undefined) return null;
    return item.is_correct ? 4 : 1;
  }
  return item.score ?? null;
};

const sectionPct = (items: CompetencyEvaluationItem[], section: CompetencySection): number | null => {
  const scored = items.filter((item) => item.section === section && effectiveScore(item) !== null);
  if (scored.length === 0) return null;
  const obtained = scored.reduce((sum, item) => sum + (effectiveScore(item) as number) * CRITICALITY_VALUE[item.criticality], 0);
  const max = scored.reduce((sum, item) => sum + CRITICALITY_VALUE[item.criticality] * 4, 0);
  return max > 0 ? Math.round((obtained / max) * 10000) / 100 : null;
};

/** Calcula resultados (en vivo para borradores, y para sellar al cerrar). */
export const computeResults = (items: CompetencyEvaluationItem[]): CompetencyEvaluationResults => {
  const competency = sectionPct(items, 'COMPETENCIA');
  const performance = sectionPct(items, 'DESEMPENO');
  const knowledge = sectionPct(items, 'CONOCIMIENTO');

  const final =
    competency !== null && performance !== null && knowledge !== null
      ? Math.round((competency * 0.5 + performance * 0.2 + knowledge * 0.3) * 100) / 100
      : null;

  // Restriccion obligatoria: VETO por competencia critica reprobada.
  const vetoApplied = items.some(
    (item) => item.section === 'COMPETENCIA' && item.criticality === 'A' && item.score !== null && item.score < 3,
  );

  let dictamen: CompetencyDictamen | null = null;
  if (final !== null) {
    if (vetoApplied || final < 70) dictamen = 'NO_COMPETENTE';
    else if (final >= 90) dictamen = 'COMPETENTE_Y_AUTORIZADO';
    else if (final >= 80) dictamen = 'COMPETENTE_CON_OBSERVACIONES';
    else dictamen = 'COMPETENTE_BAJO_SUPERVISION';
  }

  const authorization =
    dictamen === null
      ? null
      : dictamen === 'NO_COMPETENTE'
        ? 'NO_AUTORIZADO'
        : dictamen === 'COMPETENTE_BAJO_SUPERVISION'
          ? 'AUTORIZADO_CON_SEGUIMIENTO'
          : 'AUTORIZADO';

  return {
    competency_pct: competency,
    performance_pct: performance,
    knowledge_pct: knowledge,
    final_pct: final,
    veto_applied: vetoApplied,
    dictamen,
    authorization_result: authorization,
  };
};

// --- Registros -----------------------------------------------------------------

export interface CompetencyEvaluationRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_name: string;
  evaluation_type: CompetencyEvaluationType;
  evaluation_date: string;
  evaluator_name: string;
  reference_course_id: number | null;
  reference_course_title: string | null;
  reference_course_date: string | null;
  status: 'DRAFT' | 'CLOSED';
  results: CompetencyEvaluationResults;
  authorized_at: string | null;
  valid_until: string | null;
  area_signatory_name: string | null;
  rh_signatory_name: string | null;
  director_signatory_name: string | null;
  document_id: number | null;
  closed_at: string | null;
  created_at: string;
  items?: CompetencyEvaluationItem[];
  actions?: CompetencyEvaluationAction[];
}

const BASE_QUERY = `
  SELECT
    ev.*, e.full_name AS employee_name, e.employee_code, p.name AS position_name,
    tc.title AS reference_course_title
  FROM public.rh_competency_evaluations ev
  JOIN public.employees e ON e.id = ev.employee_id
  JOIN public.rh_positions p ON p.id = ev.position_id
  LEFT JOIN public.training_courses tc ON tc.id = ev.reference_course_id
`;

const toDateString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const mapRow = (row: any): CompetencyEvaluationRecord => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  employee_name: String(row.employee_name),
  employee_code: String(row.employee_code),
  position_id: Number(row.position_id),
  position_name: String(row.position_name),
  evaluation_type: String(row.evaluation_type) as CompetencyEvaluationType,
  evaluation_date: toDateString(row.evaluation_date) ?? '',
  evaluator_name: String(row.evaluator_name),
  reference_course_id: row.reference_course_id ? Number(row.reference_course_id) : null,
  reference_course_title: row.reference_course_title ? String(row.reference_course_title) : null,
  reference_course_date: toDateString(row.reference_course_date),
  status: String(row.status) as 'DRAFT' | 'CLOSED',
  results: {
    competency_pct: row.competency_pct !== null ? Number(row.competency_pct) : null,
    performance_pct: row.performance_pct !== null ? Number(row.performance_pct) : null,
    knowledge_pct: row.knowledge_pct !== null ? Number(row.knowledge_pct) : null,
    final_pct: row.final_pct !== null ? Number(row.final_pct) : null,
    veto_applied: Boolean(row.veto_applied),
    dictamen: row.dictamen ? (String(row.dictamen) as CompetencyDictamen) : null,
    authorization_result: row.authorization_result ? String(row.authorization_result) : null,
  },
  authorized_at: toDateString(row.authorized_at),
  valid_until: toDateString(row.valid_until),
  area_signatory_name: row.area_signatory_name ? String(row.area_signatory_name) : null,
  rh_signatory_name: row.rh_signatory_name ? String(row.rh_signatory_name) : null,
  director_signatory_name: row.director_signatory_name ? String(row.director_signatory_name) : null,
  document_id: row.document_id ? Number(row.document_id) : null,
  closed_at: row.closed_at ? String(row.closed_at) : null,
  created_at: String(row.created_at),
});

const mapItemRow = (row: any): CompetencyEvaluationItem => ({
  id: Number(row.id),
  section: String(row.section) as CompetencySection,
  item_text: String(row.item_text),
  criticality: String(row.criticality) as CompetencyCriticality,
  method: row.method ? String(row.method) : null,
  score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
  expected_answer: row.expected_answer ? String(row.expected_answer) : null,
  given_answer: row.given_answer ? String(row.given_answer) : null,
  is_correct: row.is_correct === null || row.is_correct === undefined ? null : Boolean(row.is_correct),
  observations: row.observations ? String(row.observations) : null,
  sort_order: Number(row.sort_order ?? 0),
});

export const listEvaluationItems = async (evaluationId: number): Promise<CompetencyEvaluationItem[]> => {
  const result = await pool.query(
    `SELECT * FROM public.rh_competency_evaluation_items
      WHERE evaluation_id = $1 ORDER BY section ASC, sort_order ASC, id ASC;`,
    [evaluationId],
  );
  return result.rows.map(mapItemRow);
};

const listEvaluationActions = async (evaluationId: number): Promise<CompetencyEvaluationAction[]> => {
  const result = await pool.query(
    `SELECT * FROM public.rh_competency_evaluation_actions
      WHERE evaluation_id = $1 ORDER BY sort_order ASC, id ASC;`,
    [evaluationId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    improvement_area: String(row.improvement_area),
    required_action: String(row.required_action),
    responsible: row.responsible ? String(row.responsible) : null,
    due_date: toDateString(row.due_date),
    follow_up: row.follow_up ? String(row.follow_up) : null,
    sort_order: Number(row.sort_order ?? 0),
  }));
};

// --- CRUD ---------------------------------------------------------------------

export interface CreateEvaluationInput {
  employeeId: number;
  positionId: number;
  evaluationType: CompetencyEvaluationType;
  evaluationDate: string;
  evaluatorName: string;
  referenceCourseId?: number | null;
  referenceCourseDate?: string | null;
  createdByUserId: string | null;
}

/**
 * Crea el borrador y PRECARGA los items: las competencias del puesto (con su
 * criticidad del catalogo) y los 7 criterios de desempeno. El conocimiento se
 * captura desde cero (10 preguntas sugeridas en la UI).
 */
export const createEvaluation = async (input: CreateEvaluationInput): Promise<CompetencyEvaluationRecord> => {
  const employee = await pool.query(`SELECT id FROM public.employees WHERE id = $1 AND is_active = TRUE LIMIT 1;`, [
    input.employeeId,
  ]);
  if (employee.rows.length === 0) {
    throwCoded('RH_COMP_EVAL_EMPLOYEE_NOT_FOUND', 'El colaborador indicado no existe o esta inactivo.');
  }
  const position = await pool.query(`SELECT id FROM public.rh_positions WHERE id = $1 AND is_active = TRUE LIMIT 1;`, [
    input.positionId,
  ]);
  if (position.rows.length === 0) {
    throwCoded('RH_COMP_EVAL_POSITION_NOT_FOUND', 'El puesto indicado no existe o esta inactivo.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO public.rh_competency_evaluations
         (employee_id, position_id, evaluation_type, evaluation_date, evaluator_name,
          reference_course_id, reference_course_date, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [
        input.employeeId,
        input.positionId,
        input.evaluationType,
        input.evaluationDate,
        input.evaluatorName.trim(),
        input.referenceCourseId ?? null,
        input.referenceCourseDate ?? null,
        input.createdByUserId,
      ],
    );
    const evaluationId = Number(inserted.rows[0].id);

    // Precarga: competencias del puesto (catalogo, con criticidad).
    await client.query(
      `INSERT INTO public.rh_competency_evaluation_items (evaluation_id, section, item_text, criticality, sort_order)
       SELECT $1, 'COMPETENCIA', competency_text, criticality, sort_order
         FROM public.rh_position_competencies
        WHERE position_id = $2
        ORDER BY sort_order ASC, id ASC;`,
      [evaluationId, input.positionId],
    );

    // Precarga: los 7 criterios de desempeno.
    await client.query(
      `INSERT INTO public.rh_competency_evaluation_items (evaluation_id, section, item_text, criticality, sort_order)
       SELECT $1, 'DESEMPENO', criterion_text, criticality, sort_order
         FROM public.rh_performance_criteria
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC;`,
      [evaluationId],
    );

    await client.query('COMMIT');
    const created = await getEvaluationById(evaluationId);
    return created as CompetencyEvaluationRecord;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export interface EvaluationListOptions extends PaginationInput {
  search?: string | undefined;
  status?: string | undefined;
}

export const listEvaluations = async (
  options: EvaluationListOptions = {},
): Promise<PaginatedResult<CompetencyEvaluationRecord>> => {
  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(['e.full_name', 'e.employee_code', 'p.name'], options.search, 0);
  const conditions = [search.clause].filter(Boolean);
  const values: unknown[] = [...search.values];
  if (options.status) {
    values.push(options.status);
    conditions.push(`ev.status = $${values.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitSql = paginate ? `LIMIT $${values.length + 1} OFFSET $${values.length + 2}` : '';
  const dataValues = paginate ? [...values, limit, offset] : values;

  const dataResult = await pool.query(
    `${BASE_QUERY} ${whereClause} ORDER BY ev.created_at DESC, ev.id DESC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapRow);
  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.rh_competency_evaluations ev
       JOIN public.employees e ON e.id = ev.employee_id
       JOIN public.rh_positions p ON p.id = ev.position_id ${whereClause};`,
    values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getEvaluationById = async (evaluationId: number): Promise<CompetencyEvaluationRecord | null> => {
  const result = await pool.query(`${BASE_QUERY} WHERE ev.id = $1 LIMIT 1;`, [evaluationId]);
  if (result.rows.length === 0) {
    return null;
  }
  const record = mapRow(result.rows[0]);
  record.items = await listEvaluationItems(evaluationId);
  record.actions = await listEvaluationActions(evaluationId);
  // En borrador, los resultados se calculan en vivo para que la UI muestre el
  // avance; al cerrar quedan sellados en la fila y se reportan tal cual.
  if (record.status === 'DRAFT') {
    record.results = computeResults(record.items);
  }
  return record;
};

const loadDraft = async (evaluationId: number): Promise<CompetencyEvaluationRecord> => {
  const record = await getEvaluationById(evaluationId);
  if (!record) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  if (record.status !== 'DRAFT') {
    return throwCoded('RH_COMP_EVAL_ALREADY_CLOSED', 'La evaluacion ya esta cerrada; no se puede modificar.');
  }
  return record;
};

export interface UpdateEvaluationInput {
  evaluationType?: CompetencyEvaluationType;
  evaluationDate?: string;
  evaluatorName?: string;
  referenceCourseId?: number | null;
  referenceCourseDate?: string | null;
}

export const updateEvaluation = async (
  evaluationId: number,
  input: UpdateEvaluationInput,
): Promise<CompetencyEvaluationRecord> => {
  const current = await loadDraft(evaluationId);
  await pool.query(
    `UPDATE public.rh_competency_evaluations
        SET evaluation_type = $1, evaluation_date = $2, evaluator_name = $3,
            reference_course_id = $4, reference_course_date = $5, updated_at = NOW()
      WHERE id = $6;`,
    [
      input.evaluationType ?? current.evaluation_type,
      input.evaluationDate ?? current.evaluation_date,
      input.evaluatorName?.trim() || current.evaluator_name,
      input.referenceCourseId !== undefined ? input.referenceCourseId : current.reference_course_id,
      input.referenceCourseDate !== undefined ? input.referenceCourseDate : current.reference_course_date,
      evaluationId,
    ],
  );
  return (await getEvaluationById(evaluationId)) as CompetencyEvaluationRecord;
};

export interface SectionItemInput {
  item_text: string;
  criticality: CompetencyCriticality;
  method?: string | null;
  score?: number | null;
  expected_answer?: string | null;
  given_answer?: string | null;
  is_correct?: boolean | null;
  observations?: string | null;
}

/** Reemplaza los items de UNA seccion del borrador (transaccional). */
export const replaceSectionItems = async (
  evaluationId: number,
  section: CompetencySection,
  items: SectionItemInput[],
): Promise<CompetencyEvaluationRecord> => {
  await loadDraft(evaluationId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM public.rh_competency_evaluation_items WHERE evaluation_id = $1 AND section = $2;`,
      [evaluationId, section],
    );
    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO public.rh_competency_evaluation_items
           (evaluation_id, section, item_text, criticality, method, score, expected_answer, given_answer, is_correct, observations, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
        [
          evaluationId,
          section,
          item.item_text.trim(),
          item.criticality,
          section === 'COMPETENCIA' ? item.method ?? null : null,
          section === 'CONOCIMIENTO' ? null : item.score ?? null,
          section === 'CONOCIMIENTO' ? item.expected_answer?.trim() || null : null,
          section === 'CONOCIMIENTO' ? item.given_answer?.trim() || null : null,
          section === 'CONOCIMIENTO' ? item.is_correct ?? null : null,
          item.observations?.trim() || null,
          index,
        ],
      );
    }
    await client.query('COMMIT');
    return (await getEvaluationById(evaluationId)) as CompetencyEvaluationRecord;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export interface ActionInput {
  improvement_area: string;
  required_action: string;
  responsible?: string | null;
  due_date?: string | null;
  follow_up?: string | null;
}

export const replaceActions = async (evaluationId: number, actions: ActionInput[]): Promise<CompetencyEvaluationRecord> => {
  await loadDraft(evaluationId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM public.rh_competency_evaluation_actions WHERE evaluation_id = $1;`, [evaluationId]);
    for (const [index, action] of actions.entries()) {
      await client.query(
        `INSERT INTO public.rh_competency_evaluation_actions
           (evaluation_id, improvement_area, required_action, responsible, due_date, follow_up, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [
          evaluationId,
          action.improvement_area.trim(),
          action.required_action.trim(),
          action.responsible?.trim() || null,
          action.due_date ?? null,
          action.follow_up?.trim() || null,
          index,
        ],
      );
    }
    await client.query('COMMIT');
    return (await getEvaluationById(evaluationId)) as CompetencyEvaluationRecord;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const deleteDraftEvaluation = async (evaluationId: number): Promise<void> => {
  await loadDraft(evaluationId);
  await pool.query(`DELETE FROM public.rh_competency_evaluations WHERE id = $1;`, [evaluationId]);
};

// --- Cierre ---------------------------------------------------------------------

export interface CloseEvaluationInput {
  evaluationId: number;
  collaboratorSignature: string;
  evaluatorSignature: string;
  areaSignature: string;
  rhSignature: string;
  directorSignature: string;
  areaSignatoryName: string;
  rhSignatoryName: string;
  directorSignatoryName: string;
  closedByUserId: string | null;
}

const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

/**
 * Cierra la evaluacion: valida completitud, sella resultados, embebe las 5
 * firmas en el PDF oficial y lo archiva en el expediente (seccion Competencias
 * laborales) con expiry_date = vigencia de 12 meses — eso hace que las alertas
 * de expediente existentes reclamen la reevaluacion al vencer (CR-05).
 */
export const closeEvaluation = async (input: CloseEvaluationInput): Promise<CompetencyEvaluationRecord> => {
  const record = await loadDraft(input.evaluationId);
  const items = record.items ?? [];

  const bySection = (section: CompetencySection) => items.filter((item) => item.section === section);
  if (bySection('COMPETENCIA').length === 0 || bySection('DESEMPENO').length === 0 || bySection('CONOCIMIENTO').length === 0) {
    throwCoded('RH_COMP_EVAL_INCOMPLETE', 'Las tres secciones deben tener al menos un item antes de cerrar.');
  }
  const unscored = items.filter((item) => effectiveScore(item) === null);
  if (unscored.length > 0) {
    throwCoded(
      'RH_COMP_EVAL_UNSCORED_ITEMS',
      `Hay ${unscored.length} item(s) sin calificar; captura todas las calificaciones antes de cerrar.`,
    );
  }

  const results = computeResults(items);
  if (results.final_pct === null || !results.dictamen) {
    return throwCoded('RH_COMP_EVAL_INCOMPLETE', 'No se pudieron calcular los resultados.');
  }

  // Plan de acciones obligatorio salvo dictamen pleno.
  if (results.dictamen !== 'COMPETENTE_Y_AUTORIZADO' && (record.actions ?? []).length === 0) {
    throwCoded(
      'RH_COMP_EVAL_ACTIONS_REQUIRED',
      'El dictamen no es "Competente y autorizado": captura el plan de acciones antes de cerrar.',
    );
  }

  const signatures = {
    collaborator: decodeSignaturePng(input.collaboratorSignature),
    evaluator: decodeSignaturePng(input.evaluatorSignature),
    area: decodeSignaturePng(input.areaSignature),
    rh: decodeSignaturePng(input.rhSignature),
    director: decodeSignaturePng(input.directorSignature),
  };
  if (Object.values(signatures).some((buffer) => !buffer)) {
    throwCoded('RH_COMP_EVAL_INVALID_SIGNATURE', 'Las cinco firmas son obligatorias y no pueden estar vacias.');
  }

  const closedAt = new Date();
  const authorized = results.dictamen !== 'NO_COMPETENTE';
  const authorizedAt = authorized ? closedAt : null;
  const validUntil = authorized ? addMonths(closedAt, 12) : null;

  const pdf = await buildCompetencyEvaluationPdf({
    record: { ...record, results },
    items,
    actions: record.actions ?? [],
    closedAt,
    authorizedAt,
    validUntil,
    signatories: {
      collaboratorName: record.employee_name,
      evaluatorName: record.evaluator_name,
      areaName: input.areaSignatoryName.trim(),
      rhName: input.rhSignatoryName.trim(),
      directorName: input.directorSignatoryName.trim(),
    },
    signaturePngs: {
      collaborator: signatures.collaborator!,
      evaluator: signatures.evaluator!,
      area: signatures.area!,
      rh: signatures.rh!,
      director: signatures.director!,
    },
  });

  const uploadedByUserId: string =
    input.closedByUserId ??
    (await pool
      .query(`SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`)
      .then((r) => (r.rows.length > 0 ? String(r.rows[0].id) : null))) ??
    throwCoded('RH_COMP_EVAL_USER_NOT_FOUND');

  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: record.employee_id,
    documentTypeCode: 'COMPETENCY_EVALUATION',
    referenceKey: `competency_evaluation:${record.id}`,
    title: `REH-REG-003 Evaluación de competencia - ${DICTAMEN_LABELS[results.dictamen]}`,
    description: `Puesto: ${record.position_name}. Resultado final: ${results.final_pct}%.${results.veto_applied ? ' VETO aplicado por competencia critica.' : ''}`,
    pdf,
    uploadedByUserId,
    expiryDate: validUntil ? validUntil.toISOString().slice(0, 10) : null,
  });

  const paths = {
    collaborator: writeSignaturePng(signatures.collaborator!, 'COMP-EVAL'),
    evaluator: writeSignaturePng(signatures.evaluator!, 'COMP-EVAL'),
    area: writeSignaturePng(signatures.area!, 'COMP-EVAL'),
    rh: writeSignaturePng(signatures.rh!, 'COMP-EVAL'),
    director: writeSignaturePng(signatures.director!, 'COMP-EVAL'),
  };

  try {
    await pool.query(
      `UPDATE public.rh_competency_evaluations
          SET status = 'CLOSED',
              competency_pct = $1, performance_pct = $2, knowledge_pct = $3, final_pct = $4,
              veto_applied = $5, dictamen = $6, authorization_result = $7,
              authorized_at = $8, valid_until = $9,
              collaborator_signature_path = $10, evaluator_signature_path = $11,
              area_signature_path = $12, rh_signature_path = $13, director_signature_path = $14,
              area_signatory_name = $15, rh_signatory_name = $16, director_signatory_name = $17,
              document_id = $18, closed_at = $19, updated_at = NOW()
        WHERE id = $20 AND status = 'DRAFT';`,
      [
        results.competency_pct,
        results.performance_pct,
        results.knowledge_pct,
        results.final_pct,
        results.veto_applied,
        results.dictamen,
        results.authorization_result,
        authorizedAt,
        validUntil,
        paths.collaborator,
        paths.evaluator,
        paths.area,
        paths.rh,
        paths.director,
        input.areaSignatoryName.trim(),
        input.rhSignatoryName.trim(),
        input.directorSignatoryName.trim(),
        documentId,
        closedAt,
        record.id,
      ],
    );
  } catch (error) {
    for (const filePath of Object.values(paths)) {
      try {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
      } catch {
        /* limpieza best-effort */
      }
    }
    throw error;
  }

  return (await getEvaluationById(record.id)) as CompetencyEvaluationRecord;
};
