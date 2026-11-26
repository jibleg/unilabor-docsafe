import crypto from 'crypto';
import pool from '../config/db';
import { readSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { withTransaction } from '../utils/transaction';
import { DOCUMENT_FORM_CODES, type SignedDocumentKind } from './rh-document-signature.rules';

/**
 * Especimenes de firma y rubrica del colaborador (REH-REG-027). Un PNG en la
 * carpeta de firmas con su sha256; a lo mas uno vigente por colaborador y tipo.
 * Nunca se borra: cargar uno nuevo retira el anterior (retired_at), y retirar
 * deja la fila como antecedente.
 */

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

export type SignatureSpecimenKind = 'FIRMA' | 'RUBRICA';
export type SignatureSpecimenSource = 'UPLOAD' | 'CLIPBOARD' | 'DOCUMENT_SIGNATURE';

export const SPECIMEN_KIND_LABEL: Record<SignatureSpecimenKind, string> = { FIRMA: 'Firma', RUBRICA: 'Rúbrica' };

export interface SignatureSpecimenSummary {
  id: number;
  employee_id: number;
  kind: SignatureSpecimenKind;
  source: SignatureSpecimenSource;
  source_note: string | null;
  sha256: string;
  registered_at: string;
  registered_by_name: string | null;
}

/** Consulta base del especimen; `extra` agrega columnas (p. ej. la ruta de la imagen). */
const specimenSelect = (extra = ''): string => `
  SELECT s.id, s.employee_id, s.kind, s.source, s.source_note, s.sha256, s.registered_at, u.full_name AS registered_by_name${extra}
    FROM public.rh_employee_signature_specimens s
    LEFT JOIN public.users u ON u.id = s.registered_by_user_id`;

const mapSpecimen = (row: any): SignatureSpecimenSummary => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  kind: String(row.kind) as SignatureSpecimenKind,
  source: String(row.source) as SignatureSpecimenSource,
  source_note: row.source_note ? String(row.source_note) : null,
  sha256: String(row.sha256),
  registered_at: new Date(row.registered_at).toISOString(),
  registered_by_name: row.registered_by_name ? String(row.registered_by_name) : null,
});

export type ActiveSpecimens = Partial<Record<SignatureSpecimenKind, SignatureSpecimenSummary>>;

/** Especimenes vigentes de todos los colaboradores, por colaborador y tipo. */
export const loadActiveSpecimensByEmployee = async (): Promise<Map<number, ActiveSpecimens>> => {
  const result = await pool.query(`${specimenSelect()} WHERE s.retired_at IS NULL;`);
  const map = new Map<number, ActiveSpecimens>();
  for (const row of result.rows) {
    const specimen = mapSpecimen(row);
    const current = map.get(specimen.employee_id) ?? {};
    current[specimen.kind] = specimen;
    map.set(specimen.employee_id, current);
  }
  return map;
};

/** Historial de especimenes del colaborador (vigentes y retirados), el mas reciente primero. */
export const listEmployeeSpecimens = async (employeeId: number): Promise<Array<SignatureSpecimenSummary & { retired_at: string | null }>> => {
  const result = await pool.query(`${specimenSelect(', s.retired_at')} WHERE s.employee_id = $1 ORDER BY s.registered_at DESC, s.id DESC;`, [employeeId]);
  return result.rows.map((row) => ({ ...mapSpecimen(row), retired_at: row.retired_at ? new Date(row.retired_at).toISOString() : null }));
};

const sha256Of = (buffer: Buffer): string => crypto.createHash('sha256').update(buffer).digest('hex');

export interface RegisterSpecimenInput {
  employeeId: number;
  kind: SignatureSpecimenKind;
  png: Buffer;
  source: SignatureSpecimenSource;
  sourceNote: string | null;
  userId: string;
}

/** Guarda el PNG y lo deja como especimen vigente; el anterior del mismo tipo queda retirado. */
export const registerSpecimen = async (input: RegisterSpecimenInput): Promise<SignatureSpecimenSummary> => {
  const employee = await pool.query(`SELECT id FROM public.employees WHERE id = $1 LIMIT 1;`, [input.employeeId]);
  if (employee.rows.length === 0) return throwCoded('RH_SIGNATURE_EMPLOYEE_NOT_FOUND', 'El colaborador no existe.');
  const imagePath = writeSignaturePng(input.png, `REHREG027-${input.kind}`);
  const id = await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.rh_employee_signature_specimens SET retired_at = NOW(), retired_by_user_id = $3
        WHERE employee_id = $1 AND kind = $2 AND retired_at IS NULL;`,
      [input.employeeId, input.kind, input.userId],
    );
    const inserted = await client.query(
      `INSERT INTO public.rh_employee_signature_specimens (employee_id, kind, image_path, sha256, source, source_note, registered_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
      [input.employeeId, input.kind, imagePath, sha256Of(input.png), input.source, input.sourceNote, input.userId],
    );
    return Number(inserted.rows[0].id);
  });
  const result = await pool.query(`${specimenSelect()} WHERE s.id = $1;`, [id]);
  return mapSpecimen(result.rows[0]);
};

/**
 * Ultima firma propia del colaborador en SafeDoc (REH-REG-003 / REH-REG-008
 * firmados desde su sesion, no a su nombre), para tomarla como especimen.
 */
export const findLastOwnDocumentSignature = async (
  employeeId: number,
): Promise<{ png: Buffer; note: string } | null> => {
  const result = await pool.query(
    `SELECT s.document_kind, s.document_id, s.signature_path, s.signed_at,
            CASE WHEN s.document_kind = 'ASSIGNMENT_LETTER' THEN (SELECT l.folio FROM public.rh_assignment_letters l WHERE l.id = s.document_id) END AS folio
       FROM public.rh_document_signatures s
      WHERE s.signer_employee_id = $1 AND s.signer_role = 'EMPLOYEE' AND s.on_behalf = FALSE AND s.invalidated_at IS NULL
      ORDER BY s.signed_at DESC, s.id DESC;`,
    [employeeId],
  );
  for (const row of result.rows) {
    const png = readSignaturePng(String(row.signature_path));
    if (!png) continue;
    const kind = String(row.document_kind) as SignedDocumentKind;
    const reference = row.folio ? String(row.folio) : `${DOCUMENT_FORM_CODES[kind] ?? kind} #${row.document_id}`;
    const signedOn = new Date(row.signed_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
    return { png, note: `Tomada de su firma en ${reference} (${signedOn})` };
  }
  return null;
};

export const retireSpecimen = async (id: number, userId: string): Promise<SignatureSpecimenSummary> => {
  const result = await pool.query(
    `UPDATE public.rh_employee_signature_specimens SET retired_at = NOW(), retired_by_user_id = $2
      WHERE id = $1 AND retired_at IS NULL RETURNING id;`,
    [id, userId],
  );
  if (result.rows.length === 0) return throwCoded('RH_SIGNATURE_SPECIMEN_NOT_FOUND', 'El espécimen no existe o ya estaba retirado.');
  const row = await pool.query(`${specimenSelect()} WHERE s.id = $1;`, [id]);
  return mapSpecimen(row.rows[0]);
};

export interface SpecimenImage {
  specimen: SignatureSpecimenSummary;
  png: Buffer;
}

/** PNG del especimen (vigente o retirado: el historial sigue consultable). */
export const getSpecimenImage = async (id: number): Promise<SpecimenImage> => {
  const result = await pool.query(`${specimenSelect(', s.image_path')} WHERE s.id = $1;`, [id]);
  const row = result.rows[0];
  if (!row) return throwCoded('RH_SIGNATURE_SPECIMEN_NOT_FOUND', 'El espécimen no existe.');
  const png = readSignaturePng(String(row.image_path));
  if (!png) return throwCoded('RH_SIGNATURE_SPECIMEN_FILE_MISSING', 'No se encontró la imagen del espécimen en el servidor.');
  return { specimen: mapSpecimen(row), png };
};

/** PNG de cada especimen pedido (para embeberlos en el PDF); los que faltan se omiten. */
export const loadSpecimenImages = async (ids: number[]): Promise<Map<number, Buffer>> => {
  const map = new Map<number, Buffer>();
  if (ids.length === 0) return map;
  const result = await pool.query(`SELECT id, image_path FROM public.rh_employee_signature_specimens WHERE id = ANY($1::bigint[]);`, [ids]);
  for (const row of result.rows) {
    const png = readSignaturePng(String(row.image_path));
    if (png) map.set(Number(row.id), png);
  }
  return map;
};
