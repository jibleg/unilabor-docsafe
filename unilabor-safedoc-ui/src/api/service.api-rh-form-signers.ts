import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { FormSignerSlot, RhFormSigner, RhFormSignersBySlot } from '../types/models';

/**
 * Firmantes del pie del PDF de un formato (Elaboró / Revisó / Autorizó). Cada
 * módulo expone las mismas rutas bajo su propia base: `/rh/authorized-personnel`
 * (REH-REG-026), `/rh/signature-registry` (REH-REG-027).
 */

export const listFormSigners = async (basePath: string): Promise<RhFormSignersBySlot> => {
  const response = await api.get(`${basePath}/signers`);
  return asRecord(unwrapPayload(response.data))?.signers as RhFormSignersBySlot;
};

export interface SaveFormSignerPayload {
  signer_name: string;
  signer_title: string;
  /** PNG en data URL; sin imagen se conserva la firma vigente. */
  image?: string;
}

export const saveFormSigner = async (basePath: string, slot: FormSignerSlot, payload: SaveFormSignerPayload): Promise<{ message: string; signer: RhFormSigner }> => {
  const response = await api.put(`${basePath}/signers/${slot}`, payload);
  const record = asRecord(unwrapPayload(response.data));
  return { message: String(record?.message ?? 'Firmante registrado.'), signer: record?.signer as RhFormSigner };
};

export const retireFormSigner = async (basePath: string, slot: FormSignerSlot): Promise<string> => {
  const response = await api.post(`${basePath}/signers/${slot}/retire`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? 'Firmante retirado.');
};

/** PNG de la firma vigente del puesto como URL de blob (null si no hay firma). */
export const getFormSignerImageUrl = async (basePath: string, slot: FormSignerSlot): Promise<string | null> => {
  try {
    const response = await api.get(`${basePath}/signers/${slot}/image`, { responseType: 'blob' });
    return URL.createObjectURL(response.data as Blob);
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) return null;
    throw error;
  }
};
