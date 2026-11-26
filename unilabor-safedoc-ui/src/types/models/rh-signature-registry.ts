// Registro de firmas autorizadas (REH-REG-027), derivado del REH-REG-026.
import type { RhAuthorizationLevel } from './rh-authorized-personnel';

export interface RhDiscipline {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export type SignatureRegistryStatus = 'DADA_DE_BAJA' | 'INCOMPLETA' | 'SIN_EVALUACION' | 'VENCIDA' | 'POR_VENCER' | 'VIGENTE';

export type SignatureRegistryTone = 'green' | 'amber' | 'red' | 'gray';

export type SignatureSpecimenKind = 'FIRMA' | 'RUBRICA';

export type SignatureSpecimenSource = 'UPLOAD' | 'CLIPBOARD' | 'DOCUMENT_SIGNATURE';

export interface SignatureSpecimen {
  id: number;
  employee_id: number;
  kind: SignatureSpecimenKind;
  source: SignatureSpecimenSource;
  source_note: string | null;
  sha256: string;
  registered_at: string;
  registered_by_name: string | null;
}

export interface SignatureSpecimenHistoryItem extends SignatureSpecimen {
  retired_at: string | null;
}

/** Una fila = un colaborador autorizado en un puesto (o que lo estuvo: fila histórica). */
export interface SignatureRegistryRow {
  row_no: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  branch_name: string | null;
  position_id: number;
  position_code: string;
  position_name: string;
  area_name: string | null;
  employee_active: boolean;
  position_active: boolean;
  /** Histórica: colaborador de baja o puesto terminado. */
  retired: boolean;
  discipline_id: number | null;
  discipline_name: string | null;
  is_discipline_responsible: boolean;
  signing_scope_text: string | null;
  notes: string | null;
  /** Nivel de autorización del REH-REG-026. */
  authorization_level_id: number | null;
  authorization_level_no: number | null;
  authorization_level_name: string | null;
  letter_id: number | null;
  letter_folio: string | null;
  /** Fecha de alta = carta REH-REG-008 cerrada del puesto. */
  start_date: string | null;
  evaluation_id: number | null;
  last_evaluation_date: string | null;
  valid_until: string | null;
  end_or_change_date: string | null;
  end_or_change_kind: 'BAJA' | 'CAMBIO_ALCANCE' | null;
  signature_specimen: SignatureSpecimen | null;
  initials_specimen: SignatureSpecimen | null;
  status: SignatureRegistryStatus;
  status_label: string;
  status_tone: SignatureRegistryTone;
  expires_on: string | null;
  days_remaining: number | null;
  /** Qué falta cuando la fila está INCOMPLETA. */
  missing: string[];
}

export interface SignatureRegistrySummary {
  rows_total: number;
  people_total: number;
  active_rows: number;
  retired_rows: number;
  by_status: Record<SignatureRegistryStatus, number>;
}

export interface SignatureRegistryListing {
  cutoff_date: string;
  warning_days: number;
  rows: SignatureRegistryRow[];
  summary: SignatureRegistrySummary;
  disciplines: RhDiscipline[];
  /** Catálogo de niveles de autorización (activos e inactivos), para el filtro. */
  authorization_levels: RhAuthorizationLevel[];
}

export interface SignatureAuthorizationPayload {
  discipline_id: number | null;
  is_discipline_responsible: boolean;
  signing_scope_text: string | null;
  notes: string | null;
}

export interface SigningScopeProposal {
  text: string | null;
  letter_id: number | null;
  letter_folio: string | null;
  letter_status: 'CLOSED' | 'DRAFT' | null;
}
