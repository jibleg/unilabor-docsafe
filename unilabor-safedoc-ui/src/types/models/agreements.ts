// --- Modulo Proveedores: gestion documental de contratos/convenios ---------

// Mismo catalogo que ya alimenta el combo "Proveedor" de Activos
// (helpdesk_suppliers); Proveedores tiene su propia alta/edicion.
export interface ProviderSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  contact: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  is_active: boolean;
  classification_id: number | null;
}

export interface ProviderContact {
  id: number;
  provider_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ProviderDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type ProviderDocumentStatus = 'active' | 'inactive' | 'superseded';

export interface ProviderDocument {
  id: number;
  provider_id: number;
  provider_name: string | null;
  category_id: number;
  category_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  status: ProviderDocumentStatus;
  replaces_document_id: number | null;
  replaced_by_document_id: number | null;
  /** Borrado lógico (solo documentos con histórico): oculto de la ficha, PDF y cadena intactos. */
  deleted_at?: string | null;
  deleted_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderNotificationRecipient {
  id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

// --- Clasificacion: catalogo compartido entre Proveedores y Clientes -------
export type ClassificationType = 'PROVIDER' | 'CLIENT';

export interface Classification {
  id: number;
  type: ClassificationType;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// --- Modulo Clientes: mirror de Proveedores (mismo patron de vigencia) -----
export interface ClientSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  contact: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  is_active: boolean;
  classification_id: number | null;
}

export interface ClientContact {
  id: number;
  client_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ClientDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type ClientDocumentStatus = 'active' | 'inactive' | 'superseded';

export interface ClientDocument {
  id: number;
  client_id: number;
  client_name: string | null;
  category_id: number;
  category_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  status: ClientDocumentStatus;
  replaces_document_id: number | null;
  replaced_by_document_id: number | null;
  /** Borrado lógico (solo documentos con histórico): oculto de la ficha, PDF y cadena intactos. */
  deleted_at?: string | null;
  deleted_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientNotificationRecipient {
  id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

// --- Panorama ejecutivo de Acuerdos (contratos con proveedores y clientes) ---
export type AgreementPartyType = 'provider' | 'client';
export type AgreementBucket = 'expired' | 'critical' | 'warning' | 'upcoming' | 'ok' | 'no_expiry';

export interface AgreementItem {
  id: number;
  party_type: AgreementPartyType;
  party_id: number;
  party_name: string;
  party_rfc: string | null;
  classification: string | null;
  category_code: string | null;
  category_name: string | null;
  title: string;
  description: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  days_to_expiry: number | null;
  bucket: AgreementBucket;
  version_chain: number;
  uploaded_by_name: string | null;
  created_at: string;
  detail_path: string;
}

export interface AgreementPartySummary {
  party_type: AgreementPartyType;
  party_id: number;
  party_name: string;
  classification: string | null;
  agreements: number;
  worst_bucket: AgreementBucket;
  next_expiry_date: string | null;
}

export interface AgreementDashboard {
  generated_at: string;
  today: string;
  includes: { providers: boolean; clients: boolean };
  kpis: {
    agreements: number;
    providers_with_agreements: number;
    clients_with_agreements: number;
    providers_active: number;
    clients_active: number;
    expired: number;
    critical_30: number;
    warning_60: number;
    upcoming_90: number;
    ok: number;
    no_expiry: number;
    expiring_this_year: number;
    next_expiry: AgreementItem | null;
  };
  by_bucket: Record<AgreementBucket, number>;
  by_category: Array<{ category: string; providers: number; clients: number }>;
  by_month: Array<{ month: string; providers: number; clients: number; expired: number }>;
  by_party: AgreementPartySummary[];
  alert_recipients: { providers: number; clients: number };
  items: AgreementItem[];
}
