import pool from '../config/db';
import { getAssignmentLetter, type AssignmentLetterRecord } from './rh-assignment-letter.service';
import { getEvaluationById, type CompetencyEvaluationRecord } from './rh-competency-evaluation.service';
import {
  DOCUMENT_FORM_CODES,
  DOCUMENT_SIGNER_ROLES,
  DOCUMENT_TITLES,
  describeDocumentRoles,
  documentRolesOf,
  documentRolesToSign,
  type DocumentSignerAssignment,
  type DocumentSignerRole,
  type SignedDocumentKind,
} from './rh-document-signature.rules';
import { loadDocumentSigners, type DocumentSignerStatus } from './rh-document-signature.service';
import { describeRoles } from './rh-supervision-signature.rules';
import { listSignatureInbox as listSupervisionInbox, type SignatureInboxEntry as SupervisionInboxEntry } from './rh-supervision-signature.service';

// -----------------------------------------------------------------------------
// Buzon de firmas unificado: lo que espera la firma del colaborador de la sesion
// en los tres registros que se firman a distancia:
//   * SUPERVISION            ANA-REG-060 (Fase 6)
//   * COMPETENCY_EVALUATION  REH-REG-003 (Fase 7)
//   * ASSIGNMENT_LETTER      REH-REG-008 (Fase 7)
// Cada entrada se identifica por (kind, id). Las de la Fase 6 siguen saliendo del
// motor del ANA-REG-060; las de la Fase 7, de rh_document_signatures.
// -----------------------------------------------------------------------------

export type InboxKind = 'SUPERVISION' | SignedDocumentKind;

export const INBOX_KINDS: InboxKind[] = ['SUPERVISION', 'COMPETENCY_EVALUATION', 'ASSIGNMENT_LETTER'];

export const isInboxKind = (value: unknown): value is InboxKind => INBOX_KINDS.includes(value as InboxKind);

export const INBOX_FORM_CODES: Record<InboxKind, string> = { SUPERVISION: 'ANA-REG-060', ...DOCUMENT_FORM_CODES };

export interface InboxEntry {
  kind: InboxKind;
  id: number;
  form_code: string;
  title: string;
  folio: string;
  status: 'IN_SIGNATURE' | 'CLOSED';
  employee_name: string;
  employee_code: string;
  position_code: string;
  position_name: string;
  branch_name: string | null;
  /** Dato corto que distingue el registro (fecha de supervision, tipo de evaluacion...). */
  detail: string | null;
  /** Roles que ocupo y cuales me falta firmar, ya en texto. */
  my_roles_label: string;
  pending_roles_label: string;
  has_pending: boolean;
  requested_at: string | null;
  requested_by_name: string | null;
  signatures_done: number;
  signatures_total: number;
  my_signed_at: string | null;
  closed_at: string | null;
}

export interface UnifiedInbox {
  pending: InboxEntry[];
  signed: InboxEntry[];
}

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);
const dateOnly = (value: unknown): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10));

const fromSupervision = (entry: SupervisionInboxEntry): InboxEntry => ({
  kind: 'SUPERVISION',
  id: entry.checklist_id,
  form_code: 'ANA-REG-060',
  title: 'Lista de verificación de Supervisión',
  folio: entry.folio,
  status: entry.status === 'CLOSED' ? 'CLOSED' : 'IN_SIGNATURE',
  employee_name: entry.employee_name,
  employee_code: entry.employee_code,
  position_code: entry.position_code,
  position_name: entry.position_name,
  branch_name: entry.branch_name,
  detail: `Supervisión del ${entry.supervision_date}${entry.enrollment_id ? (entry.is_final ? ' · final de la Fase 6' : ' · Fase 6') : ' · de área'}`,
  my_roles_label: describeRoles(entry.my_roles),
  pending_roles_label: describeRoles(entry.pending_roles),
  has_pending: entry.pending_roles.length > 0,
  requested_at: entry.requested_at,
  requested_by_name: entry.requested_by_name,
  signatures_done: entry.signatures_done,
  signatures_total: 3,
  my_signed_at: entry.my_signed_at,
  closed_at: entry.closed_at,
});

const EVALUATION_TYPE_LABELS: Record<string, string> = {
  INICIAL: 'Inicial (Fase 7)',
  PERIODICA: 'Periódica',
  REEVALUACION: 'Reevaluación',
  CAMBIO_PUESTO: 'Cambio de puesto',
  POST_CAPACITACION: 'Posterior a capacitación',
};

/** SELECT de cada registro de la Fase 7 con sus firmantes y las firmas vigentes. */
const DOCUMENT_SOURCES: Record<SignedDocumentKind, { from: string; signerColumns: string; detail: (row: any) => string; folio: (row: any) => string; branch: string }> = {
  COMPETENCY_EVALUATION: {
    from: `public.rh_competency_evaluations d`,
    signerColumns: `d.employee_id AS signer_employee, d.evaluator_employee_id AS signer_evaluator, d.area_signatory_employee_id AS signer_area,
                    d.rh_signatory_employee_id AS signer_rh, d.director_signatory_employee_id AS signer_director`,
    detail: (row) => `${EVALUATION_TYPE_LABELS[String(row.evaluation_type)] ?? String(row.evaluation_type)} · evaluada el ${dateOnly(row.evaluation_date)}`,
    folio: (row) => `REH-REG-003-${String(row.id).padStart(5, '0')}`,
    branch: `NULL::text`,
  },
  ASSIGNMENT_LETTER: {
    from: `public.rh_assignment_letters d`,
    signerColumns: `d.employee_id AS signer_employee, d.area_signatory_employee_id AS signer_area, d.director_signatory_employee_id AS signer_director`,
    detail: (row) => `Carta del ${dateOnly(row.letter_date)}`,
    folio: (row) => (row.folio ? String(row.folio) : `REH-REG-008-${String(row.id).padStart(5, '0')}`),
    branch: `NULL::text`,
  },
};

const assignmentFromRow = (kind: SignedDocumentKind, row: any): DocumentSignerAssignment => {
  const assignment: DocumentSignerAssignment = {};
  for (const role of DOCUMENT_SIGNER_ROLES[kind]) {
    const value = row[`signer_${role.toLowerCase()}`];
    assignment[role] = value ? Number(value) : null;
  }
  return assignment;
};

const documentSelect = (kind: SignedDocumentKind): string => {
  const source = DOCUMENT_SOURCES[kind];
  return `
    SELECT d.*, ${source.signerColumns}, ${source.branch} AS branch_name,
           emp.full_name AS employee_name, emp.employee_code, rp.code AS position_code, rp.name AS position_name,
           sr.full_name AS requested_by_name,
           ARRAY(SELECT s.signer_role FROM public.rh_document_signatures s
                  WHERE s.document_kind = '${kind}' AND s.document_id = d.id AND s.invalidated_at IS NULL) AS signed_roles,
           (SELECT max(s.signed_at) FROM public.rh_document_signatures s
             WHERE s.document_kind = '${kind}' AND s.document_id = d.id AND s.invalidated_at IS NULL AND s.signer_employee_id = $1) AS my_signed_at
      FROM ${source.from}
      JOIN public.employees emp ON emp.id = d.employee_id
      JOIN public.rh_positions rp ON rp.id = d.position_id
      LEFT JOIN public.users sr ON sr.id = d.signature_requested_by_user_id`;
};

const mapDocumentRow = (kind: SignedDocumentKind, row: any, employeeId: number): InboxEntry => {
  const assignment = assignmentFromRow(kind, row);
  const signedRoles = ((row.signed_roles as string[] | null) ?? []) as DocumentSignerRole[];
  const closed = String(row.status) === 'CLOSED';
  const pending = closed ? [] : documentRolesToSign(kind, assignment, employeeId, signedRoles);
  return {
    kind,
    id: Number(row.id),
    form_code: DOCUMENT_FORM_CODES[kind],
    title: DOCUMENT_TITLES[kind],
    folio: DOCUMENT_SOURCES[kind].folio(row),
    status: closed ? 'CLOSED' : 'IN_SIGNATURE',
    employee_name: String(row.employee_name),
    employee_code: String(row.employee_code),
    position_code: String(row.position_code),
    position_name: String(row.position_name),
    branch_name: row.branch_name ? String(row.branch_name) : null,
    detail: DOCUMENT_SOURCES[kind].detail(row),
    my_roles_label: describeDocumentRoles(documentRolesOf(kind, assignment, employeeId)),
    pending_roles_label: describeDocumentRoles(pending),
    has_pending: pending.length > 0,
    requested_at: iso(row.signature_requested_at),
    requested_by_name: row.requested_by_name ? String(row.requested_by_name) : null,
    signatures_done: signedRoles.length,
    signatures_total: DOCUMENT_SIGNER_ROLES[kind].length,
    my_signed_at: iso(row.my_signed_at),
    closed_at: iso(row.closed_at),
  };
};

const mineClause = (kind: SignedDocumentKind): string =>
  `$1 IN (${DOCUMENT_SIGNER_ROLES[kind].map((role) => `d.${role === 'EMPLOYEE' ? 'employee_id' : role === 'EVALUATOR' ? 'evaluator_employee_id' : `${role.toLowerCase()}_signatory_employee_id`}`).join(', ')})`;

const RECENT_SIGNED_LIMIT = 30;

const listDocumentsForEmployee = async (kind: SignedDocumentKind, employeeId: number): Promise<UnifiedInbox> => {
  const [pending, signed] = await Promise.all([
    pool.query(
      `${documentSelect(kind)}
        WHERE d.status = 'DRAFT' AND d.signature_requested_at IS NOT NULL AND ${mineClause(kind)}
        ORDER BY d.signature_requested_at ASC, d.id ASC;`,
      [employeeId],
    ),
    pool.query(
      `${documentSelect(kind)}
        WHERE (d.status = 'CLOSED' OR d.signature_requested_at IS NOT NULL)
          AND EXISTS (SELECT 1 FROM public.rh_document_signatures mine
                       WHERE mine.document_kind = '${kind}' AND mine.document_id = d.id
                         AND mine.invalidated_at IS NULL AND mine.signer_employee_id = $1)
        ORDER BY my_signed_at DESC LIMIT ${RECENT_SIGNED_LIMIT};`,
      [employeeId],
    ),
  ]);
  const pendingEntries = pending.rows.map((row) => mapDocumentRow(kind, row, employeeId)).filter((entry) => entry.has_pending);
  const pendingIds = new Set(pendingEntries.map((entry) => entry.id));
  return {
    pending: pendingEntries,
    // Quien ocupa dos roles y solo ha firmado uno sigue viendo el registro en pendientes.
    signed: signed.rows.map((row) => mapDocumentRow(kind, row, employeeId)).filter((entry) => !pendingIds.has(entry.id)),
  };
};

const byRequestedAt = (a: InboxEntry, b: InboxEntry) => String(a.requested_at ?? '').localeCompare(String(b.requested_at ?? '')) || a.id - b.id;
const bySignedAtDesc = (a: InboxEntry, b: InboxEntry) => String(b.my_signed_at ?? '').localeCompare(String(a.my_signed_at ?? ''));

export const listUnifiedInbox = async (employeeId: number): Promise<UnifiedInbox> => {
  const [supervision, competency, letters] = await Promise.all([
    listSupervisionInbox(employeeId),
    listDocumentsForEmployee('COMPETENCY_EVALUATION', employeeId),
    listDocumentsForEmployee('ASSIGNMENT_LETTER', employeeId),
  ]);
  return {
    pending: [...supervision.pending.map(fromSupervision), ...competency.pending, ...letters.pending].sort(byRequestedAt),
    signed: [...supervision.signed.map(fromSupervision), ...competency.signed, ...letters.signed].sort(bySignedAtDesc).slice(0, RECENT_SIGNED_LIMIT),
  };
};

/** Numero de registros que esperan la firma del colaborador (badge del menu). */
export const countUnifiedInboxPending = async (employeeId: number): Promise<number> => (await listUnifiedInbox(employeeId)).pending.length;

// --- Detalle de un registro de la Fase 7 ---------------------------------------------

export interface DocumentInboxDetail {
  kind: SignedDocumentKind;
  evaluation: CompetencyEvaluationRecord | null;
  letter: AssignmentLetterRecord | null;
  signers: DocumentSignerStatus[];
  my_roles_label: string;
  pending_roles_label: string;
  has_pending: boolean;
}

const notYours = (form: string): never => {
  const error = new Error('RH_DOC_SIGNATURE_NOT_YOURS') as Error & { code: string; publicMessage: string };
  error.code = 'RH_DOC_SIGNATURE_NOT_YOURS';
  error.publicMessage = `Este ${form} no esta en tu buzon de firmas.`;
  throw error;
};

/**
 * El registro visto desde el buzon. Solo lo abre quien es firmante de el, y nunca
 * un borrador editable: hasta enviarse a firma no es de nadie mas que de RH.
 */
export const getDocumentInboxDetail = async (kind: SignedDocumentKind, id: number, employeeId: number): Promise<DocumentInboxDetail> => {
  const form = DOCUMENT_FORM_CODES[kind];
  const evaluation = kind === 'COMPETENCY_EVALUATION' ? await getEvaluationById(id) : null;
  const letter = kind === 'ASSIGNMENT_LETTER' ? await getAssignmentLetter(id).catch(() => null) : null;
  const record = evaluation ?? letter;
  if (!record || (record.status === 'DRAFT' && !record.in_signature)) return notYours(form);
  const signers = await loadDocumentSigners(kind, id);
  const assignment: DocumentSignerAssignment = Object.fromEntries(signers.map((signer) => [signer.role, signer.employee_id]));
  const myRoles = documentRolesOf(kind, assignment, employeeId);
  if (myRoles.length === 0) return notYours(form);
  const signedRoles = signers.filter((signer) => signer.signed_at).map((signer) => signer.role);
  const pending = record.status === 'CLOSED' ? [] : documentRolesToSign(kind, assignment, employeeId, signedRoles);
  return {
    kind,
    evaluation,
    letter,
    signers,
    my_roles_label: describeDocumentRoles(myRoles),
    pending_roles_label: describeDocumentRoles(pending),
    has_pending: pending.length > 0,
  };
};
