import { AUTHORIZED_PERSONNEL_WARNING_DAYS, daysBetween } from './rh-authorized-personnel.rules';

/**
 * Reglas puras del Registro de firmas autorizadas (REH-REG-027): el ESTADO de
 * cada fila (misma cascada que calcula el Excel) y la propuesta del alcance de
 * firma a partir de la carta REH-REG-008. Sin acceso a datos, para probarlas.
 */

/** Meses de vigencia de la competencia cuando el REH-REG-003 no trae valid_until. */
export const COMPETENCY_VALIDITY_MONTHS = 12;

export type SignatureRegistryStatus = 'DADA_DE_BAJA' | 'INCOMPLETA' | 'SIN_EVALUACION' | 'VENCIDA' | 'POR_VENCER' | 'VIGENTE';

export type SignatureRegistryTone = 'green' | 'amber' | 'red' | 'gray';

export const SIGNATURE_REGISTRY_STATUS_LABEL: Record<SignatureRegistryStatus, string> = {
  DADA_DE_BAJA: 'DADA DE BAJA',
  INCOMPLETA: 'INCOMPLETA',
  SIN_EVALUACION: 'SIN EVALUACIÓN',
  VENCIDA: 'VENCIDA',
  POR_VENCER: 'POR VENCER',
  VIGENTE: 'VIGENTE',
};

export const SIGNATURE_REGISTRY_STATUS_TONE: Record<SignatureRegistryStatus, SignatureRegistryTone> = {
  DADA_DE_BAJA: 'gray',
  INCOMPLETA: 'red',
  SIN_EVALUACION: 'red',
  VENCIDA: 'red',
  POR_VENCER: 'amber',
  VIGENTE: 'green',
};

/** Lo que decide el estado de una fila. */
export interface SignatureRegistryStatusInput {
  /** Colaborador de baja o puesto terminado. */
  retired: boolean;
  hasPosition: boolean;
  hasScope: boolean;
  hasSignatureSpecimen: boolean;
  /** Fecha de alta = carta REH-REG-008 cerrada del puesto. */
  startDate: string | null;
  lastEvaluationDate: string | null;
  /** Vigencia que fijo el REH-REG-003 (null = se calculan 12 meses desde la evaluacion). */
  validUntil: string | null;
}

export interface SignatureRegistryStatusResult {
  status: SignatureRegistryStatus;
  status_label: string;
  status_tone: SignatureRegistryTone;
  /** Fecha en que vence la competencia (null sin evaluacion). */
  expires_on: string | null;
  /** Dias que le quedan (negativo = vencida); null sin evaluacion. */
  days_remaining: number | null;
  /** Que le falta a una fila INCOMPLETA, para la pantalla. */
  missing: string[];
}

export const addMonths = (isoDate: string, months: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const missingOf = (input: SignatureRegistryStatusInput): string[] => {
  const missing: string[] = [];
  if (!input.hasPosition) missing.push('puesto');
  if (!input.hasScope) missing.push('actividades autorizadas a firmar');
  if (!input.hasSignatureSpecimen) missing.push('espécimen de firma');
  if (!input.startDate) missing.push('fecha de alta (carta REH-REG-008 cerrada)');
  return missing;
};

/**
 * Cascada del formato: DADA DE BAJA -> INCOMPLETA (sin puesto, alcance, firma o
 * fecha de alta) -> SIN EVALUACION -> VENCIDA -> POR VENCER (60 dias) -> VIGENTE.
 */
export const resolveSignatureRegistryStatus = (input: SignatureRegistryStatusInput, today: string): SignatureRegistryStatusResult => {
  const expiresOn = input.lastEvaluationDate ? input.validUntil ?? addMonths(input.lastEvaluationDate, COMPETENCY_VALIDITY_MONTHS) : null;
  const days = expiresOn ? daysBetween(today, expiresOn) : null;
  const missing = missingOf(input);

  let status: SignatureRegistryStatus;
  if (input.retired) status = 'DADA_DE_BAJA';
  else if (missing.length > 0) status = 'INCOMPLETA';
  else if (days === null) status = 'SIN_EVALUACION';
  else if (days < 0) status = 'VENCIDA';
  else if (days <= AUTHORIZED_PERSONNEL_WARNING_DAYS) status = 'POR_VENCER';
  else status = 'VIGENTE';

  return {
    status,
    status_label: SIGNATURE_REGISTRY_STATUS_LABEL[status],
    status_tone: SIGNATURE_REGISTRY_STATUS_TONE[status],
    expires_on: expiresOn,
    days_remaining: days,
    missing: status === 'INCOMPLETA' ? missing : [],
  };
};

// --- Propuesta del alcance desde la carta REH-REG-008 ------------------------

/**
 * Autorizaciones del REH-REG-008 (rev. 1) que implican firmar, validar, liberar
 * o aprobar algo; las demas son accesos y tareas operativas que no dejan firma.
 * La autorizacion "Otras" (texto libre) se recibe aparte, por su numero.
 */
export const SIGNING_SCOPE_ITEM_NOS = [
  17, // Aceptacion o rechazo de muestras
  28, // Liberacion de reactivos
  37, // Evaluacion del control de calidad
  39, // Validacion tecnica de resultados
  40, // Liberacion de resultados
  41, // Informar resultados criticos
  42, // Modificacion de resultados
  43, // Cancelacion de resultados
  44, // Emision de comentarios clinicos
  57, // Liberacion de insumos
  59, // Aprobacion de compras
  62, // Elaboracion de documentos
  63, // Revision de documentos
  64, // Aprobacion de documentos
  73, // Autorizacion de vacaciones
  81, // Autorizacion para firmar documentos oficiales
];

export interface ScopeSourceItem {
  item_no: number;
  item_text: string;
  authorized: boolean;
}

export interface ScopeSource {
  items: ScopeSourceItem[];
  /** Texto libre de la autorizacion "Otras" de la carta. */
  otherAuthorizations: string | null;
  /** Numero de la autorizacion "Otras" en el formato (OTHER_AUTHORIZATIONS_ITEM_NO). */
  otherItemNo: number;
}

const lowerFirst = (value: string): string => (value ? value.charAt(0).toLowerCase() + value.slice(1) : value);

/**
 * Texto propuesto para "Actividades y documentos que esta autorizada a firmar"
 * a partir de los Si de la carta. Devuelve null si la carta no autoriza nada
 * de lo que deja firma. Los items salen en el orden del formato; "Otras" al
 * final con su texto libre.
 */
export const proposeSigningScope = (source: ScopeSource): string | null => {
  const wanted = new Set(SIGNING_SCOPE_ITEM_NOS);
  const parts: string[] = [];
  let other: string | null = null;
  for (const item of [...source.items].sort((a, b) => a.item_no - b.item_no)) {
    if (!item.authorized) continue;
    if (item.item_no === source.otherItemNo) {
      other = source.otherAuthorizations?.trim() || null;
      continue;
    }
    if (!wanted.has(item.item_no)) continue;
    parts.push(parts.length === 0 ? item.item_text.trim() : lowerFirst(item.item_text.trim()));
  }
  if (other) parts.push(`${parts.length === 0 ? 'Otras' : 'otras'}: ${other}`);
  return parts.length > 0 ? `${parts.join('; ')}.` : null;
};
