import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { SignatureInbox, SignatureInboxDetail, SignatureInboxEntry, SignatureInboxSignResult } from '../types/models';

// Buzón de firmas (ANA-REG-060): cada firmante coloca su firma desde su propia
// sesión. El backend deduce el rol de la sesión; aquí solo viaja la firma.

const BASE = '/my/signature-inbox';

export const listSignatureInbox = async (): Promise<SignatureInbox> => {
  const response = await api.get(BASE);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    pending: (data.pending as SignatureInboxEntry[]) ?? [],
    signed: (data.signed as SignatureInboxEntry[]) ?? [],
  };
};

/** Número de listas que esperan mi firma (badge del menú). */
export const getSignatureInboxCount = async (): Promise<number> => {
  const response = await api.get(`${BASE}/count`);
  return Number(asRecord(unwrapPayload(response.data))?.count ?? 0);
};

export const getSignatureInboxDetail = async (id: number): Promise<SignatureInboxDetail> => {
  const response = await api.get(`${BASE}/${id}`);
  return unwrapPayload(response.data) as SignatureInboxDetail;
};

export const signFromInbox = async (id: number, signature: string): Promise<SignatureInboxSignResult> => {
  const response = await api.post(`${BASE}/${id}/sign`, { signature });
  return unwrapPayload(response.data) as SignatureInboxSignResult;
};

/** PDF de la lista (en firma con marca de agua; cerrada con sus firmas) como URL de blob. */
export const getSignatureInboxPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
