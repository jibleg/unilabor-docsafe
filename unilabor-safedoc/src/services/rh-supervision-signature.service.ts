import fs from 'fs';
import pool from '../config/db';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { withTransaction } from '../utils/transaction';
import {
  assertPracticalAvailable,
  assertReadyToSign,
  closeFullySignedChecklist,
  type SupervisionPracticalOutcome,
} from './rh-supervision-checklist-close.service';
import { supervisionFolio } from './rh-supervision-checklist.rules';
import {
  getSupervisionChecklist,
  updateSupervisionChecklist,
  type SupervisionChecklistRecord,
  type SupervisionChecklistStatus,
  type UpdateSupervisionChecklistInput,
} from './rh-supervision-checklist.service';
import {
  pendingSignerRoles,
  rolesOfEmployee,
  rolesToSign,
  signerIssues,
  type SupervisionSignerRole,
} from './rh-supervision-signature.rules';
import { syncDraftSigners } from './rh-supervision-signers.service';

// -----------------------------------------------------------------------------
// Firma a distancia del ANA-REG-060 (Buzon de firmas).
//
//   DRAFT --(RH o el supervisor envian a firma)--> PENDING_SIGNATURES
//         --(firman los tres roles desde su buzon)--> CLOSED (cierre automatico)
//   PENDING_SIGNATURES --(RH cancela el envio)--> DRAFT, firmas invalidadas
//
// En firma la lista queda bloqueada, asi que los tres firman en cualquier
// orden. Cada firma es una fila de rh_supervision_checklist_signatures; el
// envio, la firma, la cancelacion y el cierre toman el candado de la fila de la
// lista, de modo que nunca se cruzan (no hay firmas sobre una lista ya
// cancelada ni dos cierres de la misma lista).
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

// --- Envio a firma -------------------------------------------------------------

export interface SendToSignatureInput {
  id: number;
  /** Decide la Fase 6 de la inscripcion. Default: true si la lista esta ligada a una inscripcion. */
  isFinal?: boolean | undefined;
  /** Ultimos cambios de cabecera que llegan junto con el envio. */
  header?: UpdateSupervisionChecklistInput | undefined;
  userId: string;
}

/**
 * Bloquea la lista y la deja esperando las tres firmas. No se envia si falta
 * calificar algo o si algun firmante no existe, esta de baja o no tiene
 * usuario: asi ninguna lista queda atorada en un buzon que nadie puede abrir.
 */
export const sendChecklistToSignature = async (input: SendToSignatureInput): Promise<SupervisionChecklistRecord> => {
  // Antes de tomar el candado: la edicion de cabecera usa su propia conexion (y ya exige borrador).
  if (input.header) {
    await updateSupervisionChecklist(input.id, input.header);
  }
  // Los firmantes se congelan al enviar: se toman los vigentes justo antes (y antes del
  // candado de la lista, que la sincronizacion necesita libre).
  await syncDraftSigners({ checklistIds: [input.id] });
  await withTransaction(async (client) => {
    // Con el candado nadie cambia resultados ni firmantes entre la validacion y el envio.
    const locked = await client.query(`SELECT status FROM public.rh_supervision_checklists WHERE id = $1 FOR UPDATE;`, [input.id]);
    if (locked.rows.length === 0) {
      throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
    }
    const status = String(locked.rows[0].status);
    if (status === 'PENDING_SIGNATURES') {
      throwCoded('RH_SUPERVISION_IN_SIGNATURE', 'La lista ya esta en firma.');
    }
    if (status !== 'DRAFT') {
      throwCoded('RH_SUPERVISION_ALREADY_CLOSED', 'La lista ya esta cerrada y firmada.');
    }
    const record = await getSupervisionChecklist(input.id);
    assertReadyToSign(record);

    const isFinal = input.isFinal ?? record.enrollment_id !== null;
    if (isFinal && !record.enrollment_id) {
      throwCoded('RH_SUPERVISION_FINAL_WITHOUT_ENROLLMENT', 'Solo una lista ligada a una inscripcion de la Fase 6 puede ser la final.');
    }
    if (isFinal && record.enrollment_id) {
      await assertPracticalAvailable(record.enrollment_id);
    }
    const issues = signerIssues(record.signers);
    if (issues.length > 0) {
      throwCoded('RH_SUPERVISION_SIGNERS_NOT_READY', `No se envio a firma. ${issues.join(' ')}`);
    }
    await client.query(
      `UPDATE public.rh_supervision_checklists
          SET status = 'PENDING_SIGNATURES', is_final = $2, signature_requested_at = NOW(),
              signature_requested_by_user_id = $3, updated_at = NOW()
        WHERE id = $1;`,
      [input.id, isFinal, input.userId],
    );
  });
  return getSupervisionChecklist(input.id);
};

// --- Cancelacion del envio -----------------------------------------------------

export interface InvalidatedSignature {
  role: SupervisionSignerRole;
  signer_name: string;
  signed_at: string;
}

export interface CancelSignatureResult {
  record: SupervisionChecklistRecord;
  /** Firmas que ya se habian recabado y quedaron invalidadas (rastro para auditoria). */
  invalidated: InvalidatedSignature[];
}

/**
 * RH regresa la lista a borrador para corregirla. El contenido puede cambiar,
 * asi que las firmas ya recabadas dejan de valer: NO se borran, se marcan como
 * invalidadas (con quien y cuando) y sus imagenes se conservan. Al reenviarla,
 * los tres vuelven a firmar.
 */
export const cancelSignatureRequest = async (id: number, userId: string): Promise<CancelSignatureResult> => {
  const invalidated: InvalidatedSignature[] = await withTransaction(async (client) => {
    const locked = await client.query(`SELECT status FROM public.rh_supervision_checklists WHERE id = $1 FOR UPDATE;`, [id]);
    if (locked.rows.length === 0) {
      throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
    }
    const status = String(locked.rows[0].status);
    if (status === 'CLOSED') {
      throwCoded('RH_SUPERVISION_ALREADY_CLOSED', 'La lista ya se cerro con sus tres firmas; una lista cerrada no se modifica.');
    }
    if (status !== 'PENDING_SIGNATURES') {
      throwCoded('RH_SUPERVISION_NOT_IN_SIGNATURE', 'La lista no esta en firma.');
    }
    const invalidatedRows = await client.query(
      `UPDATE public.rh_supervision_checklist_signatures
          SET invalidated_at = NOW(), invalidated_by_user_id = $2, invalidated_reason = 'ENVIO_A_FIRMA_CANCELADO'
        WHERE checklist_id = $1 AND invalidated_at IS NULL
        RETURNING signer_role, signer_name, signed_at;`,
      [id, userId],
    );
    await client.query(
      `UPDATE public.rh_supervision_checklists
          SET status = 'DRAFT', is_final = FALSE, signature_requested_at = NULL, signature_requested_by_user_id = NULL,
              supervisor_signature_path = NULL, supervisor_signed_at = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [id],
    );
    return invalidatedRows.rows.map((row) => ({
      role: String(row.signer_role) as SupervisionSignerRole,
      signer_name: String(row.signer_name ?? ''),
      signed_at: new Date(row.signed_at).toISOString(),
    }));
  });
  // De vuelta en borrador retoma los firmantes y la unidad vigentes (pudieron cambiar mientras estuvo en firma).
  await syncDraftSigners({ checklistIds: [id] });
  return { record: await getSupervisionChecklist(id), invalidated };
};

// --- Buzon de firmas ------------------------------------------------------------

export interface SignatureInboxEntry {
  checklist_id: number;
  folio: string;
  status: SupervisionChecklistStatus;
  employee_name: string;
  employee_code: string;
  position_code: string;
  position_name: string;
  process_area_name: string | null;
  /** Unidad del colaborador evaluado (ubica la lista a quien firma por varias unidades). */
  branch_name: string | null;
  supervision_date: string;
  /** Liga a la Fase 6 de Induccion (null = supervision de area). */
  enrollment_id: number | null;
  is_final: boolean;
  /** Roles que ocupo en la lista y cuales me falta firmar. */
  my_roles: SupervisionSignerRole[];
  pending_roles: SupervisionSignerRole[];
  requested_at: string | null;
  requested_by_name: string | null;
  signatures_done: number;
  /** Fecha de mi firma (la mas reciente si firme dos roles). */
  my_signed_at: string | null;
  closed_at: string | null;
}

export interface SignatureInbox {
  pending: SignatureInboxEntry[];
  /** Mis firmas vigentes mas recientes (listas aun en firma o ya cerradas). */
  signed: SignatureInboxEntry[];
}

const RECENT_SIGNED_LIMIT = 30;

const INBOX_SELECT = `
  SELECT c.id, c.folio, c.status, c.supervision_date, c.enrollment_id, c.is_final, c.closed_at, c.branch_name,
         c.employee_id, c.supervisor_employee_id, c.area_responsible_employee_id,
         c.signature_requested_at, req.full_name AS requested_by_name,
         emp.full_name AS employee_name, emp.employee_code, rp.code AS position_code, rp.name AS position_name,
         pa.name AS process_area_name,
         ARRAY(SELECT sg.signer_role FROM public.rh_supervision_checklist_signatures sg
                WHERE sg.checklist_id = c.id AND sg.invalidated_at IS NULL) AS signed_roles,
         (SELECT max(sg.signed_at) FROM public.rh_supervision_checklist_signatures sg
           WHERE sg.checklist_id = c.id AND sg.invalidated_at IS NULL AND sg.signer_employee_id = $1) AS my_signed_at
    FROM public.rh_supervision_checklists c
    JOIN public.employees emp ON emp.id = c.employee_id
    JOIN public.rh_positions rp ON rp.id = c.position_id
    LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
    LEFT JOIN public.users req ON req.id = c.signature_requested_by_user_id`;

const dateOnly = (value: unknown): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10));
const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

const mapInboxRow = (row: any, employeeId: number): SignatureInboxEntry => {
  const ids = {
    employee_id: Number(row.employee_id),
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
    area_responsible_employee_id: row.area_responsible_employee_id ? Number(row.area_responsible_employee_id) : null,
  };
  const signedRoles = ((row.signed_roles as string[] | null) ?? []) as SupervisionSignerRole[];
  return {
    checklist_id: Number(row.id),
    folio: row.folio ? String(row.folio) : supervisionFolio(Number(row.id)),
    status: String(row.status) as SupervisionChecklistStatus,
    employee_name: String(row.employee_name),
    employee_code: String(row.employee_code),
    position_code: String(row.position_code),
    position_name: String(row.position_name),
    process_area_name: row.process_area_name ? String(row.process_area_name) : null,
    branch_name: row.branch_name ? String(row.branch_name) : null,
    supervision_date: dateOnly(row.supervision_date),
    enrollment_id: row.enrollment_id ? Number(row.enrollment_id) : null,
    is_final: Boolean(row.is_final),
    my_roles: rolesOfEmployee(ids, employeeId),
    pending_roles: String(row.status) === 'PENDING_SIGNATURES' ? rolesToSign(ids, employeeId, signedRoles) : [],
    requested_at: iso(row.signature_requested_at),
    requested_by_name: row.requested_by_name ? String(row.requested_by_name) : null,
    signatures_done: signedRoles.length,
    my_signed_at: iso(row.my_signed_at),
    closed_at: iso(row.closed_at),
  };
};

const MINE = `$1 IN (c.employee_id, c.supervisor_employee_id, c.area_responsible_employee_id)`;

/** Listas en firma donde el colaborador ocupa algun rol que aun no firma. */
const listPendingForEmployee = async (employeeId: number): Promise<SignatureInboxEntry[]> => {
  const result = await pool.query(
    `${INBOX_SELECT} WHERE c.status = 'PENDING_SIGNATURES' AND ${MINE} ORDER BY c.signature_requested_at ASC NULLS LAST, c.id ASC;`,
    [employeeId],
  );
  return result.rows.map((row) => mapInboxRow(row, employeeId)).filter((entry) => entry.pending_roles.length > 0);
};

export const listSignatureInbox = async (employeeId: number): Promise<SignatureInbox> => {
  const [pending, signed] = await Promise.all([
    listPendingForEmployee(employeeId),
    pool.query(
      `${INBOX_SELECT}
        WHERE c.status IN ('PENDING_SIGNATURES', 'CLOSED')
          AND EXISTS (SELECT 1 FROM public.rh_supervision_checklist_signatures mine
                       WHERE mine.checklist_id = c.id AND mine.invalidated_at IS NULL AND mine.signer_employee_id = $1)
        ORDER BY my_signed_at DESC LIMIT ${RECENT_SIGNED_LIMIT};`,
      [employeeId],
    ),
  ]);
  const pendingIds = new Set(pending.map((entry) => entry.checklist_id));
  return {
    pending,
    // Quien ocupa dos roles y solo ha firmado uno sigue viendo la lista en pendientes.
    signed: signed.rows.map((row) => mapInboxRow(row, employeeId)).filter((entry) => !pendingIds.has(entry.checklist_id)),
  };
};

/** Numero de listas que esperan la firma del colaborador (badge del menu). */
export const countSignatureInboxPending = async (employeeId: number): Promise<number> => (await listPendingForEmployee(employeeId)).length;

export interface SignatureInboxDetail {
  checklist: SupervisionChecklistRecord;
  my_roles: SupervisionSignerRole[];
  pending_roles: SupervisionSignerRole[];
}

/**
 * La lista vista desde el buzon. Solo la abre quien es firmante de ella: el
 * supervisor, el responsable del area o el colaborador evaluado (que asi solo
 * ve su propia lista). Nunca un borrador: hasta enviarse a firma no es de nadie mas.
 */
export const getSignatureInboxDetail = async (id: number, employeeId: number): Promise<SignatureInboxDetail> => {
  const checklist = await getSupervisionChecklist(id);
  const myRoles = rolesOfEmployee(checklist, employeeId);
  if (myRoles.length === 0 || checklist.status === 'DRAFT') {
    throwCoded('RH_SUPERVISION_NOT_YOURS', 'Esta lista no esta en tu buzon de firmas.');
  }
  const signedRoles = checklist.signers.filter((signer) => signer.signed_at).map((signer) => signer.role);
  return {
    checklist,
    my_roles: myRoles,
    pending_roles: checklist.status === 'PENDING_SIGNATURES' ? rolesToSign(checklist, employeeId, signedRoles) : [],
  };
};

// --- Firma ---------------------------------------------------------------------

export interface SignFromInboxInput {
  id: number;
  userId: string;
  employeeId: number;
  signature: string;
}

export interface SignFromInboxResult {
  checklist: SupervisionChecklistRecord;
  /** Roles que quedaron firmados con esta accion. */
  signed_roles: SupervisionSignerRole[];
  /** Roles de la lista que siguen sin firma (de cualquier persona). */
  pending_roles: SupervisionSignerRole[];
  /** La lista quedo cerrada (por esta firma o por otra simultanea que completo las tres). */
  closed: boolean;
  /** Esta peticion fue la que sello el cierre (una sola entre firmas simultaneas): es la que lo audita. */
  closed_by_this_request: boolean;
  practical: SupervisionPracticalOutcome | null;
  /** La firma quedo registrada pero el cierre automatico fallo (RH puede reintentarlo). */
  close_error: string | null;
}

const unlinkQuietly = (paths: string[]): void => {
  for (const filePath of paths) {
    try {
      fs.existsSync(filePath) && fs.unlinkSync(filePath);
    } catch {
      /* limpieza best-effort */
    }
  }
};

/**
 * El firmante coloca su firma. El rol NO lo elige el cliente: se deduce del
 * colaborador de la sesion (nadie firma por otro). Si ocupa dos roles
 * (supervisor y responsable del area) la misma firma cubre ambos, una fila por
 * rol. Con la tercera firma se intenta el cierre automatico.
 */
export const signFromInbox = async (input: SignFromInboxInput): Promise<SignFromInboxResult> => {
  const png = decodeSignaturePng(input.signature);
  if (!png) {
    throwCoded('RH_SUPERVISION_INVALID_SIGNATURE', 'Traza tu firma para firmar la lista.');
  }
  const written: string[] = [];
  let signedRoles: SupervisionSignerRole[] = [];
  try {
    signedRoles = await withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT c.status, c.employee_id, c.supervisor_employee_id, c.area_responsible_employee_id, me.full_name AS signer_name
           FROM public.rh_supervision_checklists c
           LEFT JOIN public.employees me ON me.id = $2
          WHERE c.id = $1 FOR UPDATE OF c;`,
        [input.id, input.employeeId],
      );
      if (locked.rows.length === 0) {
        throwCoded('RH_SUPERVISION_NOT_FOUND', 'La lista de verificacion no existe.');
      }
      const row = locked.rows[0];
      const ids = {
        employee_id: Number(row.employee_id),
        supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
        area_responsible_employee_id: row.area_responsible_employee_id ? Number(row.area_responsible_employee_id) : null,
      };
      if (rolesOfEmployee(ids, input.employeeId).length === 0) {
        throwCoded('RH_SUPERVISION_NOT_YOURS', 'Esta lista no esta en tu buzon de firmas.');
      }
      const status = String(row.status);
      if (status === 'CLOSED') {
        throwCoded('RH_SUPERVISION_ALREADY_CLOSED', 'La lista ya esta cerrada y firmada.');
      }
      if (status !== 'PENDING_SIGNATURES') {
        throwCoded('RH_SUPERVISION_NOT_IN_SIGNATURE', 'La lista no esta en firma (sigue en borrador o RH cancelo el envio para corregirla). Volvera a tu buzon cuando se envie a firma.');
      }
      const active = await client.query(
        `SELECT signer_role FROM public.rh_supervision_checklist_signatures WHERE checklist_id = $1 AND invalidated_at IS NULL;`,
        [input.id],
      );
      const toSign = rolesToSign(
        ids,
        input.employeeId,
        active.rows.map((signature) => String(signature.signer_role) as SupervisionSignerRole),
      );
      if (toSign.length === 0) {
        throwCoded('RH_SUPERVISION_ALREADY_SIGNED', 'Ya firmaste esta lista.');
      }
      for (const role of toSign) {
        const signaturePath = writeSignaturePng(png!, 'SUP-ANA060');
        written.push(signaturePath);
        await client.query(
          `INSERT INTO public.rh_supervision_checklist_signatures
             (checklist_id, signer_role, signer_employee_id, signer_user_id, signer_name, signature_path)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [input.id, role, input.employeeId, input.userId, String(row.signer_name ?? ''), signaturePath],
        );
      }
      return toSign;
    });
  } catch (error) {
    unlinkQuietly(written);
    throw error;
  }

  // La firma ya es firme. El cierre va aparte: si fallara, no se pierde la firma.
  let practical: SupervisionPracticalOutcome | null = null;
  let closedHere = false;
  let closeError: string | null = null;
  try {
    const closed = await closeFullySignedChecklist(input.id, input.userId);
    closedHere = closed !== null;
    practical = closed?.practical ?? null;
  } catch (error: any) {
    console.error(`ANA-REG-060 lista ${input.id}: las firmas estan completas pero el cierre automatico fallo:`, error);
    closeError = error?.publicMessage || 'No se pudo cerrar la lista automaticamente.';
  }
  const checklist = await getSupervisionChecklist(input.id);
  return {
    checklist,
    signed_roles: signedRoles,
    pending_roles: pendingSignerRoles(checklist.signers.filter((signer) => signer.signed_at).map((signer) => signer.role)),
    closed: checklist.status === 'CLOSED',
    closed_by_this_request: closedHere,
    practical,
    close_error: closeError,
  };
};
