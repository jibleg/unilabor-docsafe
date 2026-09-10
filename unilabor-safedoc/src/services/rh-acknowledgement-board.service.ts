import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { resolveEmployeeDocumentPath } from './employee-document.service';
import fs from 'fs';
import { extractReadingAnnexPage } from './reading/reading-annex.pdf';
import { resolveSignedCopy } from './quality-reading-self.service';
import type { AcknowledgementStatus } from './rh-document-acknowledgement.service';

// -----------------------------------------------------------------------------
// Tablero de seguimiento de acuses (lado RH).
//
// Une las DOS fuentes de lectura + firma que existen en la plataforma, que
// viven en tablas distintas y se administran desde modulos distintos:
//
//   * institutional -> rh_document_acknowledgements. Documentos institucionales
//     que RH carga y asigna (RH-ACK). RH puede cancelarlos desde el tablero.
//   * reading_room  -> quality_reading_acknowledgements. Documentos vigentes del
//     SGC publicados en la Sala de Lectura de Calidad. Aqui caen tambien las
//     lecturas del Programa de Induccion, que se inscriben a traves de la Sala.
//     Son SOLO LECTURA para RH: su ciclo de vida lo gobierna Calidad/Induccion.
//
// Ambas tablas comparten el mismo motor de lectura (estados, paginas vistas,
// gate por pagina), asi que se proyectan a una sola forma de fila.
// -----------------------------------------------------------------------------

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

export interface AcknowledgementBoardFilters {
  status?: AcknowledgementStatus | undefined;
  source?: AcknowledgementSource | undefined;
  employee_id?: number | undefined;
  institutional_document_id?: number | undefined;
}

const SOURCE_LABEL: Record<AcknowledgementSource, string> = {
  institutional: 'Documento institucional',
  reading_room: 'Sala de Lectura',
};

// Proyeccion comun. Cada fuente debe emitir exactamente estas columnas, en este
// orden y con estos tipos, para que el UNION ALL sea valido.
const INSTITUTIONAL_SELECT = `
  SELECT 'institutional'::text AS source,
         a.id,
         a.institutional_document_id,
         NULL::bigint AS publication_id,
         a.employee_id,
         a.status,
         a.available_at,
         a.deadline_at,
         a.started_at,
         a.read_completed_at,
         a.signed_at,
         a.pages_total,
         COALESCE(array_length(a.pages_seen, 1), 0) AS pages_seen_count,
         a.active_seconds,
         a.min_seconds_per_page,
         a.current_page,
         d.title AS document_title,
         e.full_name AS employee_name,
         e.employee_code,
         NULL::integer AS induction_phase_number,
         NULL::text AS induction_phase,
         (a.signed_document_id IS NOT NULL) AS signed_copy_available
    FROM public.rh_document_acknowledgements a
    INNER JOIN public.rh_institutional_documents d ON d.id = a.institutional_document_id
    INNER JOIN public.employees e ON e.id = a.employee_id
`;

// El lector de la Sala es un USUARIO; el empleado es una foto opcional. Si no
// hay expediente ligado, el nombre sale de la cuenta para que la fila no quede
// anonima. La fase de Induccion se resuelve por el item de lectura que apunta
// a este acuse (a lo sumo uno por acuse).
const READING_ROOM_SELECT = `
  SELECT 'reading_room'::text AS source,
         a.id,
         NULL::bigint AS institutional_document_id,
         a.publication_id,
         a.employee_id,
         a.status,
         a.assigned_at AS available_at,
         a.deadline_at,
         a.started_at,
         a.read_completed_at,
         a.signed_at,
         a.pages_total,
         COALESCE(array_length(a.pages_seen, 1), 0) AS pages_seen_count,
         a.active_seconds,
         a.min_seconds_per_page,
         a.current_page,
         p.title_snapshot AS document_title,
         COALESCE(e.full_name, u.full_name) AS employee_name,
         e.employee_code,
         ind.phase_number AS induction_phase_number,
         ind.phase_name AS induction_phase,
         (a.signed_file_path IS NOT NULL) AS signed_copy_available
    FROM public.quality_reading_acknowledgements a
    INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
    INNER JOIN public.users u ON u.id = a.user_id
    LEFT JOIN public.employees e ON e.id = a.employee_id
    LEFT JOIN LATERAL (
      SELECT ph.phase_number, ph.name AS phase_name
        FROM public.rh_induction_reading_items ri
        INNER JOIN public.rh_induction_enrollments en ON en.id = ri.enrollment_id
        INNER JOIN public.rh_induction_phases ph ON ph.id = en.phase_id
       WHERE ri.acknowledgement_id = a.id
       ORDER BY ri.id ASC
       LIMIT 1
    ) ind ON TRUE
`;

const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toNullableStamp = (value: unknown): string | null =>
  value ? toIsoDateTime(value as string) : null;

const mapRow = (row: any): AcknowledgementBoardItem => {
  const source = String(row.source) as AcknowledgementSource;
  const inductionPhase = row.induction_phase ? String(row.induction_phase) : null;
  const inductionPhaseNumber = toNullableNumber(row.induction_phase_number);
  return {
    id: Number(row.id),
    source,
    source_label: inductionPhase
      ? `Inducción · Fase ${inductionPhaseNumber ?? '?'}`
      : SOURCE_LABEL[source],
    induction_phase_number: inductionPhaseNumber,
    induction_phase: inductionPhase,
    institutional_document_id: toNullableNumber(row.institutional_document_id),
    publication_id: toNullableNumber(row.publication_id),
    employee_id: toNullableNumber(row.employee_id),
    status: String(row.status) as AcknowledgementStatus,
    available_at: toNullableStamp(row.available_at),
    deadline_at: toNullableStamp(row.deadline_at),
    started_at: toNullableStamp(row.started_at),
    read_completed_at: toNullableStamp(row.read_completed_at),
    signed_at: toNullableStamp(row.signed_at),
    pages_total: Number(row.pages_total),
    pages_seen_count: Number(row.pages_seen_count),
    active_seconds: Number(row.active_seconds),
    min_seconds_per_page: Number(row.min_seconds_per_page),
    current_page: toNullableNumber(row.current_page),
    document_title: String(row.document_title ?? ''),
    employee_name: String(row.employee_name ?? ''),
    employee_code: row.employee_code ?? null,
    signed_copy_available: Boolean(row.signed_copy_available),
  };
};

// Filtros por fuente. El de documento institucional solo tiene sentido en la
// fuente institucional: si viene, la Sala de Lectura queda fuera del tablero.
const resolveSources = (filters: AcknowledgementBoardFilters): AcknowledgementSource[] => {
  if (filters.source) {
    return filters.institutional_document_id && filters.source !== 'institutional'
      ? []
      : [filters.source];
  }
  return filters.institutional_document_id ? ['institutional'] : ['institutional', 'reading_room'];
};

const buildSourceQuery = (
  source: AcknowledgementSource,
  filters: AcknowledgementBoardFilters,
  params: unknown[],
): string => {
  const conditions: string[] = [];
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (filters.employee_id) {
    params.push(filters.employee_id);
    conditions.push(`a.employee_id = $${params.length}`);
  }
  if (source === 'institutional' && filters.institutional_document_id) {
    params.push(filters.institutional_document_id);
    conditions.push(`a.institutional_document_id = $${params.length}`);
  }
  const base = source === 'institutional' ? INSTITUTIONAL_SELECT : READING_ROOM_SELECT;
  return conditions.length > 0 ? `${base} WHERE ${conditions.join(' AND ')}` : base;
};

/** Tablero unificado de RH: acuses institucionales + lecturas de la Sala (incluida Induccion). */
export const listAcknowledgementBoard = async (
  filters: AcknowledgementBoardFilters = {},
): Promise<AcknowledgementBoardItem[]> => {
  const sources = resolveSources(filters);
  if (sources.length === 0) {
    return [];
  }

  const params: unknown[] = [];
  const union = sources
    .map((source) => `(${buildSourceQuery(source, filters, params)})`)
    .join(' UNION ALL ');

  const result = await pool.query(
    `SELECT * FROM (${union}) board ORDER BY deadline_at ASC, id DESC;`,
    params,
  );
  return result.rows.map(mapRow);
};

const failBoard = (code: string, message: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = message;
  throw error;
};

/**
 * Hoja de acuse firmada de una fila del tablero, para que RH la presente en
 * auditoria. Cada fuente guarda su PDF firmado (documento + hoja anexa al
 * final) en un lugar distinto:
 *   * institutional -> copia firmada archivada en el expediente del firmante.
 *   * reading_room  -> archivo firmado que custodia Calidad. El permiso de RH
 *     sobre el tablero ya autoriza verlo, por eso no se exige ser el dueno.
 *
 * REGLA: los documentos controlados nunca se exponen fuera del visor protegido.
 * Por eso aqui se entrega UNICAMENTE la hoja de acuse (ultima pagina), que ya
 * identifica el documento por titulo, identificador y SHA-256; nunca el PDF
 * completo, que permitiria descargarlo o imprimirlo.
 */
export const loadBoardAcknowledgementSheet = async (
  source: AcknowledgementSource,
  acknowledgementId: number,
): Promise<{ content: Buffer; fileName: string }> => {
  const { absolutePath, fileName } = await resolveBoardSignedCopyPath(source, acknowledgementId);
  const content = await extractReadingAnnexPage(fs.readFileSync(absolutePath));
  return {
    content,
    fileName: fileName.replace(/ \(firmado\)\.pdf$/, ' - Hoja de acuse.pdf'),
  };
};

/**
 * Ruta del PDF firmado completo. Uso interno: NO servirlo por HTTP, la hoja
 * de acuse se obtiene con `loadBoardAcknowledgementSheet`.
 */
const resolveBoardSignedCopyPath = async (
  source: AcknowledgementSource,
  acknowledgementId: number,
): Promise<{ absolutePath: string; fileName: string }> => {
  if (source === 'reading_room') {
    return resolveSignedCopy(acknowledgementId, '', { allowAnyOwner: true });
  }

  const result = await pool.query(
    `SELECT a.signed_document_id, d.title
       FROM public.rh_document_acknowledgements a
       INNER JOIN public.rh_institutional_documents d ON d.id = a.institutional_document_id
      WHERE a.id = $1 LIMIT 1;`,
    [acknowledgementId],
  );
  if (result.rows.length === 0) {
    return failBoard('RH_ACK_NOT_FOUND', 'El acuse no existe.');
  }
  const signedDocumentId = toNullableNumber(result.rows[0].signed_document_id);
  if (!signedDocumentId) {
    return failBoard('RH_ACK_NOT_SIGNED', 'Este acuse todavia no tiene copia firmada.');
  }

  const { absolutePath } = await resolveEmployeeDocumentPath(signedDocumentId);
  return {
    absolutePath,
    fileName: `${String(result.rows[0].title)} (firmado).pdf`,
  };
};
