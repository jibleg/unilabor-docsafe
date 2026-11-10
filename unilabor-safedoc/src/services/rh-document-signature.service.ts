import fs from 'fs';
import pool from '../config/db';
import { writeSignaturePng } from '../utils/signature-image';
import { withTransaction, type Queryable } from '../utils/transaction';
import {
  DOCUMENT_FORM_CODES,
  DOCUMENT_SIGNER_ROLES,
  documentRolesOf,
  documentRolesToSign,
  pendingDocumentRoles,
  type DocumentSignerAssignment,
  type DocumentSignerCandidate,
  type DocumentSignerRole,
  type SignedDocumentKind,
} from './rh-document-signature.rules';

// -----------------------------------------------------------------------------
// Firma a distancia del REH-REG-003 y del REH-REG-008 (Buzon de firmas).
//
//   DRAFT --(RH envia a firma)--> DRAFT + signature_requested_at (bloqueado)
//         --(firman todos los roles desde su buzon)--> CLOSED (cierre automatico)
//   en firma --(RH cancela el envio)--> DRAFT editable, firmas invalidadas
//
// Este modulo guarda y consulta las firmas; validar el envio y sellar el cierre
// es de cada registro (rh-competency-signature / rh-assignment-letter-signature).
// El envio, la firma, la cancelacion y el cierre toman el candado de la fila del
// registro, asi que nunca se cruzan: no hay firmas sobre un envio ya cancelado
// ni dos cierres del mismo registro.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

/** Tabla del registro y columna del colaborador que ocupa cada rol. */
const SOURCES: Record<SignedDocumentKind, { table: string; columns: Partial<Record<DocumentSignerRole, string>>; noun: string }> = {
  COMPETENCY_EVALUATION: {
    table: 'public.rh_competency_evaluations',
    columns: {
      EMPLOYEE: 'employee_id',
      EVALUATOR: 'evaluator_employee_id',
      AREA: 'area_signatory_employee_id',
      RH: 'rh_signatory_employee_id',
      DIRECTOR: 'director_signatory_employee_id',
    },
    noun: 'La evaluacion',
  },
  ASSIGNMENT_LETTER: {
    table: 'public.rh_assignment_letters',
    columns: { EMPLOYEE: 'employee_id', AREA: 'area_signatory_employee_id', DIRECTOR: 'director_signatory_employee_id' },
    noun: 'La carta',
  },
};

const roleColumns = (kind: SignedDocumentKind): string =>
  DOCUMENT_SIGNER_ROLES[kind].map((role) => `${SOURCES[kind].columns[role]} AS signer_${role.toLowerCase()}`).join(', ');

const assignmentFromRow = (kind: SignedDocumentKind, row: any): DocumentSignerAssignment => {
  const assignment: DocumentSignerAssignment = {};
  for (const role of DOCUMENT_SIGNER_ROLES[kind]) {
    const value = row[`signer_${role.toLowerCase()}`];
    assignment[role] = value ? Number(value) : null;
  }
  return assignment;
};

export interface LockedSignedDocument {
  status: 'DRAFT' | 'CLOSED';
  in_signature: boolean;
  signature_requested_by_user_id: string | null;
  assignment: DocumentSignerAssignment;
}

/** Toma el candado de la fila del registro (dentro de una transaccion). */
export const lockSignedDocument = async (client: Queryable, kind: SignedDocumentKind, id: number): Promise<LockedSignedDocument> => {
  const result = await client.query(
    `SELECT status, signature_requested_at, signature_requested_by_user_id, ${roleColumns(kind)}
       FROM ${SOURCES[kind].table} WHERE id = $1 FOR UPDATE;`,
    [id],
  );
  if (result.rows.length === 0) {
    throwCoded('RH_DOC_SIGNATURE_NOT_FOUND', `${SOURCES[kind].noun} no existe.`);
  }
  const row = result.rows[0];
  return {
    status: String(row.status) as 'DRAFT' | 'CLOSED',
    in_signature: String(row.status) === 'DRAFT' && row.signature_requested_at !== null,
    signature_requested_by_user_id: row.signature_requested_by_user_id ? String(row.signature_requested_by_user_id) : null,
    assignment: assignmentFromRow(kind, row),
  };
};

export interface DocumentSignature {
  role: DocumentSignerRole;
  signer_employee_id: number | null;
  signer_user_id: string | null;
  signer_name: string;
  signature_path: string;
  signed_at: string;
}

export const loadActiveDocumentSignatures = async (db: Queryable, kind: SignedDocumentKind, id: number): Promise<DocumentSignature[]> => {
  const result = await db.query(
    `SELECT signer_role, signer_employee_id, signer_user_id, signer_name, signature_path, signed_at
       FROM public.rh_document_signatures
      WHERE document_kind = $1 AND document_id = $2 AND invalidated_at IS NULL;`,
    [kind, id],
  );
  return result.rows.map((row) => ({
    role: String(row.signer_role) as DocumentSignerRole,
    signer_employee_id: row.signer_employee_id ? Number(row.signer_employee_id) : null,
    signer_user_id: row.signer_user_id ? String(row.signer_user_id) : null,
    signer_name: String(row.signer_name ?? ''),
    signature_path: String(row.signature_path),
    signed_at: new Date(row.signed_at).toISOString(),
  }));
};

/** Firmante del registro con su estado (activo, con usuario) y la fecha de su firma vigente. */
export interface DocumentSignerStatus extends DocumentSignerCandidate {
  signed_at: string | null;
}

/**
 * Los firmantes de un registro. `assignment` permite evaluar firmantes que aun no
 * se guardan (los que RH elige al enviar a firma).
 */
export const loadDocumentSigners = async (
  kind: SignedDocumentKind,
  id: number,
  assignment?: DocumentSignerAssignment,
): Promise<DocumentSignerStatus[]> => {
  let current = assignment;
  if (!current) {
    const row = await pool.query(`SELECT ${roleColumns(kind)} FROM ${SOURCES[kind].table} WHERE id = $1;`, [id]);
    if (row.rows.length === 0) throwCoded('RH_DOC_SIGNATURE_NOT_FOUND', `${SOURCES[kind].noun} no existe.`);
    current = assignmentFromRow(kind, row.rows[0]);
  }
  const roles = DOCUMENT_SIGNER_ROLES[kind];
  const ids = roles.map((role) => current![role] ?? null);
  const people = await pool.query(
    `SELECT emp.id, emp.full_name, COALESCE(emp.is_active, FALSE) AS is_active, COALESCE(u.is_active, FALSE) AS has_user
       FROM public.employees emp
       LEFT JOIN public.users u ON u.id = emp.user_id
      WHERE emp.id = ANY($1::bigint[]);`,
    [ids.filter((value): value is number => value !== null)],
  );
  const byId = new Map(people.rows.map((row) => [Number(row.id), row]));
  const signed = new Map((await loadActiveDocumentSignatures(pool, kind, id)).map((signature) => [signature.role, signature]));
  return roles.map((role) => {
    const employeeId = current![role] ?? null;
    const person = employeeId ? byId.get(employeeId) : undefined;
    const signature = signed.get(role);
    return {
      role,
      employee_id: employeeId,
      // Firmado: el nombre con que firmo (sellado). Sin firmar: el de la ficha.
      name: signature?.signer_name || (person ? String(person.full_name) : ''),
      is_active: Boolean(person?.is_active),
      has_user: Boolean(person?.has_user),
      signed_at: signature?.signed_at ?? null,
    };
  });
};

/** Marca el registro como enviado a firma (el llamador ya valido y tiene el candado). */
export const markSignatureRequested = async (client: Queryable, kind: SignedDocumentKind, id: number, userId: string): Promise<void> => {
  await client.query(
    `UPDATE ${SOURCES[kind].table}
        SET signature_requested_at = NOW(), signature_requested_by_user_id = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'DRAFT';`,
    [id, userId],
  );
};

export interface InvalidatedDocumentSignature {
  role: DocumentSignerRole;
  signer_name: string;
  signed_at: string;
}

/**
 * RH regresa el registro a borrador editable. El contenido puede cambiar, asi que
 * las firmas recabadas dejan de valer: NO se borran, se marcan como invalidadas
 * (con quien y cuando) y sus imagenes se conservan. Al reenviarlo, todos vuelven a firmar.
 */
export const cancelDocumentSignature = async (kind: SignedDocumentKind, id: number, userId: string): Promise<InvalidatedDocumentSignature[]> =>
  withTransaction(async (client) => {
    const locked = await lockSignedDocument(client, kind, id);
    if (locked.status === 'CLOSED') {
      throwCoded('RH_DOC_SIGNATURE_CLOSED', `${SOURCES[kind].noun} ya se cerro con todas sus firmas; no se modifica.`);
    }
    if (!locked.in_signature) {
      throwCoded('RH_DOC_SIGNATURE_NOT_IN_SIGNATURE', `${SOURCES[kind].noun} no esta en firma.`);
    }
    const invalidated = await client.query(
      `UPDATE public.rh_document_signatures
          SET invalidated_at = NOW(), invalidated_by_user_id = $3, invalidated_reason = 'ENVIO_A_FIRMA_CANCELADO'
        WHERE document_kind = $1 AND document_id = $2 AND invalidated_at IS NULL
        RETURNING signer_role, signer_name, signed_at;`,
      [kind, id, userId],
    );
    await client.query(
      `UPDATE ${SOURCES[kind].table}
          SET signature_requested_at = NULL, signature_requested_by_user_id = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [id],
    );
    return invalidated.rows.map((row) => ({
      role: String(row.signer_role) as DocumentSignerRole,
      signer_name: String(row.signer_name ?? ''),
      signed_at: new Date(row.signed_at).toISOString(),
    }));
  });

/** Un registro que ya recibio firmas (vigentes o invalidadas) no se elimina: es evidencia. */
export const assertNoDocumentSignatures = async (kind: SignedDocumentKind, id: number): Promise<void> => {
  const result = await pool.query(`SELECT 1 FROM public.rh_document_signatures WHERE document_kind = $1 AND document_id = $2 LIMIT 1;`, [kind, id]);
  if (result.rows.length > 0) {
    throwCoded(
      'RH_DOC_SIGNATURE_HAS_SIGNATURES',
      `${SOURCES[kind].noun} ya recibio firmas en el Buzon (aunque se cancelara el envio); se conserva como evidencia y no se elimina.`,
    );
  }
};

const unlinkQuietly = (paths: string[]): void => {
  for (const filePath of paths) {
    try {
      fs.existsSync(filePath) && fs.unlinkSync(filePath);
    } catch {
      /* limpieza best-effort */
    }
  }
};

export interface PlaceDocumentSignatureInput {
  kind: SignedDocumentKind;
  id: number;
  employeeId: number;
  userId: string;
  png: Buffer;
}

export interface PlacedDocumentSignature {
  signed_roles: DocumentSignerRole[];
  /** Roles del registro que siguen sin firma (de cualquier persona). */
  pending_roles: DocumentSignerRole[];
}

/**
 * El firmante coloca su firma. El rol NO lo elige el cliente: se deduce del
 * colaborador de la sesion (nadie firma por otro). Si ocupa varios roles la misma
 * firma cubre todos, una fila por rol. El cierre lo intenta el llamador.
 */
export const placeDocumentSignature = async (input: PlaceDocumentSignatureInput): Promise<PlacedDocumentSignature> => {
  const { kind, id } = input;
  const form = DOCUMENT_FORM_CODES[kind];
  const written: string[] = [];
  try {
    return await withTransaction(async (client) => {
      const locked = await lockSignedDocument(client, kind, id);
      if (documentRolesOf(kind, locked.assignment, input.employeeId).length === 0) {
        throwCoded('RH_DOC_SIGNATURE_NOT_YOURS', `Este ${form} no esta en tu buzon de firmas.`);
      }
      if (locked.status === 'CLOSED') {
        throwCoded('RH_DOC_SIGNATURE_CLOSED', `El ${form} ya esta cerrado y firmado.`);
      }
      if (!locked.in_signature) {
        throwCoded(
          'RH_DOC_SIGNATURE_NOT_IN_SIGNATURE',
          `El ${form} no esta en firma (RH cancelo el envio para corregirlo). Volvera a tu buzon cuando se envie de nuevo.`,
        );
      }
      const signed = (await loadActiveDocumentSignatures(client, kind, id)).map((signature) => signature.role);
      const toSign = documentRolesToSign(kind, locked.assignment, input.employeeId, signed);
      if (toSign.length === 0) {
        throwCoded('RH_DOC_SIGNATURE_ALREADY_SIGNED', `Ya firmaste este ${form}.`);
      }
      const me = await client.query(`SELECT full_name FROM public.employees WHERE id = $1;`, [input.employeeId]);
      const signerName = String(me.rows[0]?.full_name ?? '');
      for (const role of toSign) {
        const signaturePath = writeSignaturePng(input.png, form.replace(/-/g, ''));
        written.push(signaturePath);
        await client.query(
          `INSERT INTO public.rh_document_signatures
             (document_kind, document_id, signer_role, signer_employee_id, signer_user_id, signer_name, signature_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [kind, id, role, input.employeeId, input.userId, signerName, signaturePath],
        );
      }
      return { signed_roles: toSign, pending_roles: pendingDocumentRoles(kind, [...signed, ...toSign]) };
    });
  } catch (error) {
    unlinkQuietly(written);
    throw error;
  }
};
