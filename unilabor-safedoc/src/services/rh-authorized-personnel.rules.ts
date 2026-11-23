/**
 * Reglas puras del Listado de personal autorizado (REH-REG-026): que dice cada
 * fila (colaborador + puesto) a partir de su ultimo REH-REG-003 cerrado, y los
 * numeros del TABLERO. Sin acceso a datos, para poder probarlas.
 */

/** Dias antes del vencimiento en que la fila avisa "por vencer" (igual que el formato). */
export const AUTHORIZED_PERSONNEL_WARNING_DAYS = 60;

/** Nivel de autorizacion que libera y firma informes (renglon propio del TABLERO). */
export const REPORT_RELEASE_LEVEL_NO = 4;

export type AuthorizedPersonnelAlert =
  | 'SIN_PUESTO'
  | 'SIN_EVALUACION'
  | 'EN_CAPTURA'
  | 'NO_COMPETENTE'
  | 'PENDIENTE_AUTORIZACION'
  | 'NO_AUTORIZADO'
  | 'VENCIDA'
  | 'POR_VENCER'
  | 'SIN_NIVEL'
  | 'OK';

export type AuthorizedPersonnelTone = 'red' | 'amber' | 'none';

/** Ultima evaluacion CERRADA del colaborador en ese puesto (lo unico que decide la fila). */
export interface AuthorizedPersonnelEvaluation {
  id: number;
  evaluation_date: string;
  dictamen: string | null;
  authorization_result: string | null;
  /** Fecha de la decision de RH / Direccion General. */
  authorized_at: string | null;
  valid_until: string | null;
  authorization_level_id: number | null;
  authorization_level_no: number | null;
  authorization_level_name: string | null;
}

export interface AuthorizedPersonnelRowState {
  evaluation_id: number | null;
  /** null = todavia sin evaluacion cerrada (celda en blanco). */
  competent: boolean | null;
  last_evaluation_date: string | null;
  /** Fecha en que se autorizo (null si no esta autorizado). */
  authorized_at: string | null;
  valid_until: string | null;
  /** Cuenta regresiva: dias que le quedan de vigencia (negativo = vencida). */
  days_remaining: number | null;
  /** null = sin decision todavia (sin evaluacion o pendiente de autorizar). */
  authorized: boolean | null;
  authorization_level_id: number | null;
  authorization_level_no: number | null;
  authorization_level_name: string | null;
  alert: AuthorizedPersonnelAlert;
  alert_text: string;
  alert_tone: AuthorizedPersonnelTone;
}

const AUTHORIZED_RESULTS = ['AUTORIZADO', 'AUTORIZADO_CON_SEGUIMIENTO'];

export const daysBetween = (fromIsoDate: string, toIsoDate: string): number =>
  Math.round((Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIsoDate}T00:00:00Z`)) / 86_400_000);

const ALERT_TONE: Record<AuthorizedPersonnelAlert, AuthorizedPersonnelTone> = {
  SIN_PUESTO: 'amber',
  SIN_EVALUACION: 'amber',
  EN_CAPTURA: 'amber',
  NO_COMPETENTE: 'red',
  PENDIENTE_AUTORIZACION: 'amber',
  NO_AUTORIZADO: 'red',
  VENCIDA: 'red',
  POR_VENCER: 'amber',
  SIN_NIVEL: 'amber',
  OK: 'none',
};

const alertText = (alert: AuthorizedPersonnelAlert, days: number | null): string => {
  switch (alert) {
    case 'SIN_PUESTO':
      return 'Sin puesto asignado';
    case 'SIN_EVALUACION':
      return 'Sin fecha de última evaluación';
    case 'EN_CAPTURA':
      return 'Evaluación de competencia en captura';
    case 'NO_COMPETENTE':
      return 'NO COMPETENTE — enviar a recapacitación';
    case 'PENDIENTE_AUTORIZACION':
      return 'Competente, pendiente de autorización';
    case 'NO_AUTORIZADO':
      return 'NO AUTORIZADO por RH / Dirección';
    case 'VENCIDA':
      return 'COMPETENCIA VENCIDA — enviar a recapacitación';
    case 'POR_VENCER':
      return `POR VENCER — quedan ${days ?? 0} días`;
    case 'SIN_NIVEL':
      return 'Autorizado sin nivel de autorización';
    default:
      return '';
  }
};

const emptyState = (alert: AuthorizedPersonnelAlert): AuthorizedPersonnelRowState => ({
  evaluation_id: null,
  competent: null,
  last_evaluation_date: null,
  authorized_at: null,
  valid_until: null,
  days_remaining: null,
  authorized: null,
  authorization_level_id: null,
  authorization_level_no: null,
  authorization_level_name: null,
  alert,
  alert_text: alertText(alert, null),
  alert_tone: ALERT_TONE[alert],
});

/**
 * Estado de una fila. `hasPosition` = false para el colaborador activo que aun
 * no tiene puesto (aparece en el censo, sin datos). `hasDraft` = hay un
 * REH-REG-003 en captura o en firma para ese puesto.
 */
export const resolveAuthorizedPersonnelRow = (
  input: { hasPosition: boolean; latestClosed: AuthorizedPersonnelEvaluation | null; hasDraft: boolean },
  today: string,
): AuthorizedPersonnelRowState => {
  if (!input.hasPosition) return emptyState('SIN_PUESTO');
  const evaluation = input.latestClosed;
  if (!evaluation) return emptyState(input.hasDraft ? 'EN_CAPTURA' : 'SIN_EVALUACION');

  const competent = evaluation.dictamen !== null && evaluation.dictamen !== 'NO_COMPETENTE';
  const result = evaluation.authorization_result;
  const authorized = AUTHORIZED_RESULTS.includes(result ?? '') ? true : result === 'PENDIENTE' ? null : false;
  const validUntil = authorized ? evaluation.valid_until : null;
  const days = validUntil ? daysBetween(today, validUntil) : null;

  let alert: AuthorizedPersonnelAlert = 'OK';
  if (!competent) alert = 'NO_COMPETENTE';
  else if (authorized === null) alert = 'PENDIENTE_AUTORIZACION';
  else if (!authorized) alert = 'NO_AUTORIZADO';
  else if (days !== null && days < 0) alert = 'VENCIDA';
  else if (days !== null && days <= AUTHORIZED_PERSONNEL_WARNING_DAYS) alert = 'POR_VENCER';
  else if (!evaluation.authorization_level_id) alert = 'SIN_NIVEL';

  return {
    evaluation_id: evaluation.id,
    competent,
    last_evaluation_date: evaluation.evaluation_date,
    authorized_at: authorized ? evaluation.authorized_at : null,
    valid_until: validUntil,
    days_remaining: days,
    authorized,
    authorization_level_id: authorized ? evaluation.authorization_level_id : null,
    authorization_level_no: authorized ? evaluation.authorization_level_no : null,
    authorization_level_name: authorized ? evaluation.authorization_level_name : null,
    alert,
    alert_text: alertText(alert, days),
    alert_tone: ALERT_TONE[alert],
  };
};

/** Renglones del TABLERO del formato, en su orden. */
export interface AuthorizedPersonnelSummary {
  rows_total: number;
  people_total: number;
  competent: number;
  authorized: number;
  authorized_not_competent: number;
  without_evaluation_date: number;
  expired: number;
  expiring_soon: number;
  report_release_level: number;
}

export const summarizeAuthorizedPersonnel = (
  rows: Array<AuthorizedPersonnelRowState & { employee_id: number }>,
): AuthorizedPersonnelSummary => ({
  rows_total: rows.length,
  people_total: new Set(rows.map((row) => row.employee_id)).size,
  competent: rows.filter((row) => row.competent === true).length,
  authorized: rows.filter((row) => row.authorized === true).length,
  authorized_not_competent: rows.filter((row) => row.authorized === true && row.competent !== true).length,
  without_evaluation_date: rows.filter((row) => !row.last_evaluation_date).length,
  expired: rows.filter((row) => row.alert === 'VENCIDA').length,
  expiring_soon: rows.filter((row) => row.alert === 'POR_VENCER').length,
  report_release_level: rows.filter((row) => row.authorized === true && row.authorization_level_no === REPORT_RELEASE_LEVEL_NO).length,
});
