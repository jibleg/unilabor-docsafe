import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  DocumentInboxDetail,
  InboxKind,
  SignatureInbox,
  SignatureInboxBatchResult,
  SignatureInboxEntry,
  SignatureInboxSignOutcome,
  SupervisionInboxDetail,
} from '../types/models';

// Buzón de firmas (ANA-REG-060, REH-REG-003 y REH-REG-008): cada firmante coloca
// su firma desde su propia sesión. El backend deduce el rol de la sesión; aquí
// solo viaja la firma. Cada registro se identifica por (kind, id).

const BASE = '/my/signature-inbox';

/** Tope de registros por firma en lote (lo valida también el backend). */
export const SIGNATURE_BATCH_MAX = 50;

export const listSignatureInbox = async (): Promise<SignatureInbox> => {
  const response = await api.get(BASE);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    pending: (data.pending as SignatureInboxEntry[]) ?? [],
    signed: (data.signed as SignatureInboxEntry[]) ?? [],
  };
};

/** Número de registros que esperan mi firma (badge del menú). */
export const getSignatureInboxCount = async (): Promise<number> => {
  const response = await api.get(`${BASE}/count`);
  return Number(asRecord(unwrapPayload(response.data))?.count ?? 0);
};

export const getSupervisionInboxDetail = async (id: number): Promise<SupervisionInboxDetail> => {
  const response = await api.get(`${BASE}/SUPERVISION/${id}`);
  return asRecord(unwrapPayload(response.data))?.supervision as SupervisionInboxDetail;
};

export const getDocumentInboxDetail = async (kind: Exclude<InboxKind, 'SUPERVISION'>, id: number): Promise<DocumentInboxDetail> => {
  const response = await api.get(`${BASE}/${kind}/${id}`);
  return unwrapPayload(response.data) as DocumentInboxDetail;
};

export const signFromInbox = async (kind: InboxKind, id: number, signature: string): Promise<SignatureInboxSignOutcome> => {
  const response = await api.post(`${BASE}/${kind}/${id}/sign`, { signature });
  return unwrapPayload(response.data) as SignatureInboxSignOutcome;
};

/** Firma en lote: un trazo para varios registros; cada uno se firma (y audita) por separado. */
export const batchSignFromInbox = async (items: Array<{ kind: InboxKind; id: number }>, signature: string): Promise<SignatureInboxBatchResult> => {
  const response = await api.post(`${BASE}/batch-sign`, { items, signature });
  return unwrapPayload(response.data) as SignatureInboxBatchResult;
};

/** PDF del registro (en firma con marca de agua; cerrado con sus firmas) como URL de blob. */
export const getSignatureInboxPdfUrl = async (kind: InboxKind, id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${kind}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
