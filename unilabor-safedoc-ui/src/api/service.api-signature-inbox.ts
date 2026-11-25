import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  DocumentInboxDetail,
  InboxKind,
  PendingSigner,
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

/**
 * Firma por imagen a nombre del firmante (permiso RH.SIGNATURE_INBOX.SIGN_ON_BEHALF):
 * con el colaborador indicado, las mismas llamadas operan sobre SU buzón.
 */
const onBehalf = (employeeId?: number | null) => (employeeId ? { params: { on_behalf_of: employeeId } } : {});

/** Firmantes con registros en espera de su firma (solo con el permiso de firma por imagen). */
export const listPendingSigners = async (): Promise<PendingSigner[]> => {
  const response = await api.get(`${BASE}/signers`);
  return (asRecord(unwrapPayload(response.data))?.signers as PendingSigner[]) ?? [];
};

/** Tope de registros por firma en lote (lo valida también el backend). */
export const SIGNATURE_BATCH_MAX = 50;

export const listSignatureInbox = async (onBehalfOf?: number | null): Promise<SignatureInbox> => {
  const response = await api.get(BASE, onBehalf(onBehalfOf));
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

export const getSupervisionInboxDetail = async (id: number, onBehalfOf?: number | null): Promise<SupervisionInboxDetail> => {
  const response = await api.get(`${BASE}/SUPERVISION/${id}`, onBehalf(onBehalfOf));
  return asRecord(unwrapPayload(response.data))?.supervision as SupervisionInboxDetail;
};

export const getDocumentInboxDetail = async (
  kind: Exclude<InboxKind, 'SUPERVISION'>,
  id: number,
  onBehalfOf?: number | null,
): Promise<DocumentInboxDetail> => {
  const response = await api.get(`${BASE}/${kind}/${id}`, onBehalf(onBehalfOf));
  return unwrapPayload(response.data) as DocumentInboxDetail;
};

export const signFromInbox = async (kind: InboxKind, id: number, signature: string, onBehalfOf?: number | null): Promise<SignatureInboxSignOutcome> => {
  const response = await api.post(`${BASE}/${kind}/${id}/sign`, { signature }, onBehalf(onBehalfOf));
  return unwrapPayload(response.data) as SignatureInboxSignOutcome;
};

/** Firma en lote: un trazo para varios registros; cada uno se firma (y audita) por separado. */
export const batchSignFromInbox = async (
  items: Array<{ kind: InboxKind; id: number }>,
  signature: string,
  onBehalfOf?: number | null,
): Promise<SignatureInboxBatchResult> => {
  const response = await api.post(`${BASE}/batch-sign`, { items, signature }, onBehalf(onBehalfOf));
  return unwrapPayload(response.data) as SignatureInboxBatchResult;
};

/** PDF del registro (en firma con marca de agua; cerrado con sus firmas) como URL de blob. */
export const getSignatureInboxPdfUrl = async (kind: InboxKind, id: number, onBehalfOf?: number | null): Promise<string> => {
  const response = await api.get(`${BASE}/${kind}/${id}/pdf`, { responseType: 'blob', ...onBehalf(onBehalfOf) });
  return URL.createObjectURL(response.data as Blob);
};
