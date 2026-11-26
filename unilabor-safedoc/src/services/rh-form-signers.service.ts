import crypto from 'crypto';
import pool from '../config/db';
import { trimSignaturePng } from '../utils/png-trim';
import { readSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { withTransaction } from '../utils/transaction';

// Firmantes de los formatos controlados de RH (ELABORO / REVISO / AUTORIZO):
// nombre, cargo y firma que imprime el PDF al pie. Un registro vigente por
// formato y puesto; cambiarlo retira el anterior (nunca se borra).

export const FORM_SIGNER_SLOTS = ['ELABORO', 'REVISO', 'AUTORIZO'] as const;
export type FormSignerSlot = (typeof FORM_SIGNER_SLOTS)[number];

export const FORM_SIGNER_SLOT_LABEL: Record<FormSignerSlot, string> = {
  ELABORO: 'Elaboró',
  REVISO: 'Revisó',
  AUTORIZO: 'Autorizó',
};

export interface FormSigner {
  id: number;
  form_code: string;
  slot: FormSignerSlot;
  signer_name: string;
  signer_title: string;
  /** true cuando hay imagen de firma registrada. */
  has_signature: boolean;
  sha256: string | null;
  registered_at: string;
  registered_by_name: string | null;
}

/** Los tres puestos de firma del formato; null donde no se ha capturado nada. */
export type FormSignersBySlot = Record<FormSignerSlot, FormSigner | null>;

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

const SELECT = `
  SELECT s.id, s.form_code, s.slot, s.signer_name, s.signer_title, s.signature_path, s.sha256, s.registered_at,
         u.full_name AS registered_by_name
    FROM public.rh_form_signers s
    LEFT JOIN public.users u ON u.id = s.registered_by_user_id`;

const mapSigner = (row: any): FormSigner => ({
  id: Number(row.id),
  form_code: String(row.form_code),
  slot: String(row.slot) as FormSignerSlot,
  signer_name: String(row.signer_name),
  signer_title: String(row.signer_title),
  has_signature: Boolean(row.signature_path),
  sha256: row.sha256 ? String(row.sha256) : null,
  registered_at: new Date(row.registered_at).toISOString(),
  registered_by_name: row.registered_by_name ? String(row.registered_by_name) : null,
});

export const listFormSigners = async (formCode: string): Promise<FormSignersBySlot> => {
  const result = await pool.query(`${SELECT} WHERE s.form_code = $1 AND s.retired_at IS NULL;`, [formCode]);
  const bySlot: FormSignersBySlot = { ELABORO: null, REVISO: null, AUTORIZO: null };
  for (const row of result.rows) bySlot[String(row.slot) as FormSignerSlot] = mapSigner(row);
  return bySlot;
};

export interface SetFormSignerInput {
  formCode: string;
  slot: FormSignerSlot;
  signerName: string;
  signerTitle: string;
  /** PNG nuevo de la firma; si no viene, se conserva la firma vigente (si la hay). */
  png: Buffer | null;
  userId: string;
}

/** Registra nombre, cargo y (opcionalmente) firma nueva; el registro anterior del puesto queda retirado. */
export const setFormSigner = async (input: SetFormSignerInput): Promise<FormSigner> => {
  const current = await pool.query(
    `SELECT signature_path, sha256 FROM public.rh_form_signers WHERE form_code = $1 AND slot = $2 AND retired_at IS NULL LIMIT 1;`,
    [input.formCode, input.slot],
  );
  let signaturePath: string | null = current.rows[0]?.signature_path ? String(current.rows[0].signature_path) : null;
  let sha256: string | null = current.rows[0]?.sha256 ? String(current.rows[0].sha256) : null;
  if (input.png) {
    // Recortada a la tinta, para que el pie del PDF muestre el trazo y no el lienzo.
    const png = trimSignaturePng(input.png);
    signaturePath = writeSignaturePng(png, `FORM-${input.formCode.replace(/[^A-Za-z0-9]+/g, '')}-${input.slot}`);
    sha256 = crypto.createHash('sha256').update(png).digest('hex');
  }
  const id = await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.rh_form_signers SET retired_at = NOW(), retired_by_user_id = $3
        WHERE form_code = $1 AND slot = $2 AND retired_at IS NULL;`,
      [input.formCode, input.slot, input.userId],
    );
    const inserted = await client.query(
      `INSERT INTO public.rh_form_signers (form_code, slot, signer_name, signer_title, signature_path, sha256, registered_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
      [input.formCode, input.slot, input.signerName, input.signerTitle, signaturePath, sha256, input.userId],
    );
    return Number(inserted.rows[0].id);
  });
  const result = await pool.query(`${SELECT} WHERE s.id = $1;`, [id]);
  return mapSigner(result.rows[0]);
};

/** Retira al firmante vigente del puesto (el PDF vuelve a imprimir el nombre del formato, sin firma). */
export const retireFormSigner = async (formCode: string, slot: FormSignerSlot, userId: string): Promise<FormSigner> => {
  const result = await pool.query(
    `UPDATE public.rh_form_signers SET retired_at = NOW(), retired_by_user_id = $3
      WHERE form_code = $1 AND slot = $2 AND retired_at IS NULL RETURNING id;`,
    [formCode, slot, userId],
  );
  if (result.rows.length === 0) return throwCoded('RH_FORM_SIGNER_NOT_FOUND', 'Ese puesto de firma no tiene firmante vigente.');
  const row = await pool.query(`${SELECT} WHERE s.id = $1;`, [Number(result.rows[0].id)]);
  return mapSigner(row.rows[0]);
};

/** PNG de la firma vigente del puesto (recortado); null si no hay firmante o no tiene imagen. */
export const getFormSignerImage = async (formCode: string, slot: FormSignerSlot): Promise<{ signer: FormSigner; png: Buffer } | null> => {
  const result = await pool.query(`${SELECT} WHERE s.form_code = $1 AND s.slot = $2 AND s.retired_at IS NULL LIMIT 1;`, [formCode, slot]);
  const row = result.rows[0];
  if (!row?.signature_path) return null;
  const png = readSignaturePng(String(row.signature_path));
  if (!png) return throwCoded('RH_FORM_SIGNER_FILE_MISSING', 'No se encontró la imagen de la firma en el servidor.');
  return { signer: mapSigner(row), png: trimSignaturePng(png) };
};

export interface FormSignerForPdf {
  slot: FormSignerSlot;
  name: string;
  title: string;
  png: Buffer | null;
  signedAt: string | null;
}

/** Firmantes vigentes con su imagen, listos para el pie del PDF (los puestos sin firmante no se incluyen). */
export const loadFormSignersForPdf = async (formCode: string): Promise<Partial<Record<FormSignerSlot, FormSignerForPdf>>> => {
  const result = await pool.query(`${SELECT} WHERE s.form_code = $1 AND s.retired_at IS NULL;`, [formCode]);
  const out: Partial<Record<FormSignerSlot, FormSignerForPdf>> = {};
  for (const row of result.rows) {
    const slot = String(row.slot) as FormSignerSlot;
    const raw = row.signature_path ? readSignaturePng(String(row.signature_path)) : null;
    out[slot] = {
      slot,
      name: String(row.signer_name),
      title: String(row.signer_title),
      png: raw ? trimSignaturePng(raw) : null,
      signedAt: raw ? new Date(row.registered_at).toISOString() : null,
    };
  }
  return out;
};
