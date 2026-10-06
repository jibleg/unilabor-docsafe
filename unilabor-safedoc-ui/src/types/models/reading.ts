export type AcknowledgementStatus =
  | 'pending'
  | 'in_progress'
  | 'read'
  | 'signed'
  | 'expired'
  | 'cancelled';

export interface InstitutionalDocument {
  id: number;
  title: string;
  description: string | null;
  file_size: number;
  mime_type: string;
  sha256: string;
  pages_total: number;
  target_document_type_id: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  target_document_type_name?: string;
  uploaded_by_name?: string | null;
  acknowledgement_count?: number;
  signed_count?: number;
}

export interface DocumentAcknowledgement {
  id: number;
  institutional_document_id: number;
  employee_id: number;
  status: AcknowledgementStatus;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  /** Solo paginas que ya cumplieron la permanencia minima. */
  pages_seen: number[];
  pages_seen_count: number;
  active_seconds: number;
  min_seconds_per_page: number;
  current_page: number | null;
  current_page_seconds: number;
  signed_document_id: number | null;
  source_sha256: string | null;
  signed_sha256: string | null;
  created_at: string | null;
  document_title?: string;
  employee_name?: string;
  employee_code?: string | null;
}

/**
 * Fila del tablero "Seguimiento de acuses" de RH. Une dos fuentes: los acuses
 * de documentos institucionales (RH-ACK, cancelables por RH) y las lecturas de
 * la Sala de Lectura de Calidad, incluidas las del Programa de Induccion
 * (solo lectura para RH: su ciclo de vida lo gobierna Calidad/Induccion).
 */
export type AcknowledgementSource = 'institutional' | 'reading_room';

export interface AcknowledgementBoardItem {
  id: number;
  source: AcknowledgementSource;
  /** Texto corto listo para mostrar: "Documento institucional", "Sala de Lectura" o "Inducción · Fase N". */
  source_label: string;
  /** Solo para lecturas de Induccion: numero y nombre de la fase que origino la lectura. */
  induction_phase_number: number | null;
  induction_phase: string | null;
  institutional_document_id: number | null;
  publication_id: number | null;
  employee_id: number | null;
  status: AcknowledgementStatus;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen_count: number;
  active_seconds: number;
  min_seconds_per_page: number;
  current_page: number | null;
  document_title: string;
  employee_name: string;
  employee_code: string | null;
  /** TRUE cuando ya existe el PDF firmado (evidencia presentable en auditoria). */
  signed_copy_available: boolean;
}

// --- Sala de Lectura (Calidad) ----------------------------------------------
// El documento fuente es SIEMPRE un documento vigente del SGC; la publicacion
// sella su huella y numero de paginas al abrirse.

export type ReadingPublicationStatus = 'open' | 'closed';

export interface ReadingPublication {
  id: number;
  document_id: string;
  document_title: string;
  title_snapshot: string;
  source_sha256: string;
  pages_total: number;
  min_seconds_per_page: number;
  default_deadline_hours: number;
  instructions: string | null;
  status: ReadingPublicationStatus;
  published_by_user_id: string | null;
  published_by_name: string | null;
  published_at: string | null;
  closed_at: string | null;
  readers_total: number;
  readers_signed: number;
  readers_read: number;
  readers_in_progress: number;
  readers_expired: number;
}

export interface ReadingAssignment {
  id: number;
  publication_id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  employee_id: number | null;
  employee_area: string | null;
  status: AcknowledgementStatus;
  assigned_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen_count: number;
  min_seconds_per_page: number;
  active_seconds: number;
}

export interface AssignableArea {
  area: string;
  total: number;
}

/** Una lectura del SGC asignada a mí, tal como la ve el lector. */
export interface MyReading {
  id: number;
  publication_id: number;
  document_id: string;
  document_title: string;
  instructions: string | null;
  status: AcknowledgementStatus;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen: number[];
  pages_seen_count: number;
  min_seconds_per_page: number;
  active_seconds: number;
  current_page: number | null;
  has_signed_copy: boolean;
  /** Acuse de una fase de Inducción ya aprobada: firma pendiente reabierta por RH. */
  induction_phase_concluded?: boolean;
}

/** Publicación cuyo documento del SGC ya tiene una versión nueva vigente. */
export interface RepublishCandidate {
  publication_id: number;
  previous_document_id: string;
  previous_title: string;
  new_document_id: string;
  new_title: string;
  signed_readers: number;
  assigned_readers: number;
  closed_at: string | null;
}
