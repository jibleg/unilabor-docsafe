// Listado de personal autorizado (REH-REG-026) y sus catálogos.

export interface RhOrganizationalLevel {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface RhAuthorizationLevel {
  id: number;
  level_no: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

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

/** Una fila = un colaborador en un puesto; la llena su último REH-REG-003 cerrado. */
export interface AuthorizedPersonnelRow {
  row_no: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  branch_name: string | null;
  position_id: number | null;
  position_code: string | null;
  position_name: string | null;
  area_name: string | null;
  organizational_level_code: string | null;
  organizational_level_name: string | null;
  status_label: string;
  evaluation_id: number | null;
  competent: boolean | null;
  last_evaluation_date: string | null;
  /** Fecha en que se autorizó (null si no está autorizado). */
  authorized_at: string | null;
  valid_until: string | null;
  /** Cuenta regresiva de la vigencia (negativo = vencida). */
  days_remaining: number | null;
  authorized: boolean | null;
  authorization_level_id: number | null;
  authorization_level_no: number | null;
  authorization_level_name: string | null;
  alert: AuthorizedPersonnelAlert;
  alert_text: string;
  alert_tone: 'red' | 'amber' | 'none';
}

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

export interface AuthorizedPersonnelListing {
  cutoff_date: string;
  warning_days: number;
  rows: AuthorizedPersonnelRow[];
  summary: AuthorizedPersonnelSummary;
  authorization_levels: RhAuthorizationLevel[];
  organizational_levels: RhOrganizationalLevel[];
}

/** Puesto de firma del pie del formato. */
export type FormSignerSlot = 'ELABORO' | 'REVISO' | 'AUTORIZO';

/** Firmante vigente (nombre, cargo y firma) que imprime el PDF del formato. */
export interface RhFormSigner {
  id: number;
  form_code: string;
  slot: FormSignerSlot;
  signer_name: string;
  signer_title: string;
  has_signature: boolean;
  sha256: string | null;
  registered_at: string;
  registered_by_name: string | null;
}

export type RhFormSignersBySlot = Record<FormSignerSlot, RhFormSigner | null>;
