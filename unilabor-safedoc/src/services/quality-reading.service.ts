import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { sha256Buffer } from '../utils/file-storage';
import { withTransaction, type Queryable } from '../utils/transaction';
import { resolveStoredDocumentPath } from './document.service';

// Sala de Lectura (modulo Calidad). La fuente es SIEMPRE un documento vigente
// del SGC: aqui no se sube ni se copia nada, solo se publica a lectura lo que
// el repositorio documental ya controla.

const DEFAULT_DEADLINE_HOURS = 72;
const DEFAULT_MIN_SECONDS_PER_PAGE = 7;

export type PublicationStatus = 'open' | 'closed';
export type ReadingStatus =
  | 'pending'
  | 'in_progress'
  | 'read'
  | 'signed'
  | 'expired'
  | 'cancelled';

export interface PublicationRecord {
  id: number;
  document_id: string;
  document_title: string;
  title_snapshot: string;
  source_sha256: string;
  pages_total: number;
  min_seconds_per_page: number;
  default_deadline_hours: number;
  instructions: string | null;
  status: PublicationStatus;
  published_by_user_id: string | null;
  published_by_name: string | null;
  published_at: string | null;
  closed_at: string | null;
  /** Resumen de avance, calculado en el servidor. */
  readers_total: number;
  readers_signed: number;
  readers_read: number;
  readers_in_progress: number;
  readers_expired: number;
}

export interface ReadingRecord {
  id: number;
  publication_id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  employee_id: number | null;
  employee_area: string | null;
  status: ReadingStatus;
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

export interface PublishReadingPayload {
  document_id: string;
  deadline_hours?: number;
  min_seconds_per_page?: number;
  instructions?: string | null;
}

/** Las tres formas de elegir lectores acordadas con el negocio. */
export type AssignReadersPayload =
  | { mode: 'users'; user_ids: string[]; deadline_hours?: number }
  | { mode: 'area'; area: string; deadline_hours?: number }
  | { mode: 'all'; deadline_hours?: number };

export interface DocumentReadingUsage {
  publications: number;
  signed: number;
}

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

// Las tablas pueden no existir todavia en un entorno sin la migracion
// 20260722_01 aplicada.
const tablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.quality_reading_publications') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertTables = async (): Promise<void> => {
  if (!(await tablesExist())) {
    fail('QUALITY_READING_NOT_AVAILABLE', 'La sala de lectura no esta disponible.');
  }
};

// ---------------------------------------------------------------------------
// Guarda para el borrado de documentos del SGC (SL-01)
// ---------------------------------------------------------------------------

/**
 * Cuenta cuanto uso tiene un documento del SGC dentro de la sala de lectura:
 * publicaciones que lo usan como fuente y firmas ya recabadas.
 */
export const getDocumentReadingUsage = async (
  documentId: string,
): Promise<DocumentReadingUsage> => {
  if (!(await tablesExist())) {
    return { publications: 0, signed: 0 };
  }

  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT p.id)::int AS publications,
       COUNT(a.id) FILTER (WHERE a.status = 'signed')::int AS signed
     FROM public.quality_reading_publications p
     LEFT JOIN public.quality_reading_acknowledgements a ON a.publication_id = p.id
     WHERE p.document_id = $1;`,
    [documentId],
  );

  const row = result.rows[0];
  return {
    publications: Number(row?.publications ?? 0),
    signed: Number(row?.signed ?? 0),
  };
};

/**
 * Mensaje para el 409 que impide eliminar un documento publicado a lectura.
 * El borrado de Calidad ademas hace `unlink` del PDF fisico, asi que dejarlo
 * pasar romperia las lecturas en curso y volveria imposible re-verificar el
 * sha256 de origen de las firmas ya recabadas.
 */
export const buildDocumentInUseMessage = (usage: DocumentReadingUsage): string => {
  const partes = [`${usage.publications} publicacion(es) de sala de lectura`];

  if (usage.signed > 0) {
    partes.push(`${usage.signed} firma(s) ya recabada(s)`);
  }

  return `No se puede eliminar: el documento tiene ${partes.join(' y ')}. La evidencia de lectura depende de este archivo.`;
};

// ---------------------------------------------------------------------------
// Publicaciones
// ---------------------------------------------------------------------------

const PUBLICATION_SELECT = `
  SELECT
    p.*,
    d.title AS document_title,
    u.full_name AS published_by_name,
    COUNT(a.id)::int AS readers_total,
    COUNT(a.id) FILTER (WHERE a.status = 'signed')::int AS readers_signed,
    COUNT(a.id) FILTER (WHERE a.status = 'read')::int AS readers_read,
    COUNT(a.id) FILTER (WHERE a.status IN ('pending', 'in_progress'))::int AS readers_in_progress,
    COUNT(a.id) FILTER (WHERE a.status = 'expired')::int AS readers_expired
  FROM public.quality_reading_publications p
  INNER JOIN public.documents d ON d.id = p.document_id
  LEFT JOIN public.users u ON u.id = p.published_by_user_id
  LEFT JOIN public.quality_reading_acknowledgements a
         ON a.publication_id = p.id AND a.status <> 'cancelled'
`;

const mapPublication = (row: any): PublicationRecord => ({
  id: Number(row.id),
  document_id: String(row.document_id),
  document_title: String(row.document_title ?? row.title_snapshot),
  title_snapshot: String(row.title_snapshot),
  source_sha256: String(row.source_sha256),
  pages_total: Number(row.pages_total),
  min_seconds_per_page: Number(row.min_seconds_per_page),
  default_deadline_hours: Number(row.default_deadline_hours),
  instructions: row.instructions ? String(row.instructions) : null,
  status: String(row.status) as PublicationStatus,
  published_by_user_id: row.published_by_user_id ? String(row.published_by_user_id) : null,
  published_by_name: row.published_by_name ? String(row.published_by_name) : null,
  published_at: row.published_at ? toIsoDateTime(row.published_at) : null,
  closed_at: row.closed_at ? toIsoDateTime(row.closed_at) : null,
  readers_total: Number(row.readers_total ?? 0),
  readers_signed: Number(row.readers_signed ?? 0),
  readers_read: Number(row.readers_read ?? 0),
  readers_in_progress: Number(row.readers_in_progress ?? 0),
  readers_expired: Number(row.readers_expired ?? 0),
});

/**
 * Lee el PDF del documento del SGC y devuelve su huella y numero de paginas.
 * Se sellan en la publicacion: la evidencia queda anclada a este archivo exacto.
 */
const inspectSourceDocument = async (
  documentId: string,
): Promise<{ pagesTotal: number; sha256: string; title: string }> => {
  const result = await pool.query(
    `SELECT id, title, file_path, status FROM public.documents WHERE id = $1 LIMIT 1;`,
    [documentId],
  );

  const row = result.rows[0];
  if (!row) {
    return fail('QUALITY_DOCUMENT_NOT_FOUND', 'El documento del SGC no existe.');
  }

  // Solo se pone a leer lo vigente: firmar un documento derogado no tiene
  // sentido y ensuciaria la evidencia.
  if (String(row.status) !== 'active') {
    return fail(
      'QUALITY_DOCUMENT_NOT_ACTIVE',
      'Solo se pueden publicar a lectura documentos vigentes.',
    );
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStoredDocumentPath(String(row.file_path));
  } catch {
    return fail(
      'QUALITY_DOCUMENT_FILE_MISSING',
      'No se encontro el archivo del documento en el servidor.',
    );
  }

  const buffer = await fs.promises.readFile(absolutePath);

  let pagesTotal: number;
  try {
    pagesTotal = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
  } catch {
    return fail('QUALITY_DOCUMENT_NOT_PDF', 'El documento no es un PDF legible.');
  }

  return { pagesTotal, sha256: sha256Buffer(buffer), title: String(row.title) };
};

/**
 * Publica un documento vigente del SGC a lectura. Idempotente por documento: si
 * ya tiene una publicacion abierta se devuelve esa, en vez de duplicarla (el
 * indice unico parcial lo impide de todos modos).
 */
export const publishReading = async (
  payload: PublishReadingPayload,
  publishedByUserId: string,
): Promise<PublicationRecord> => {
  await assertTables();

  const existing = await pool.query(
    `SELECT id FROM public.quality_reading_publications
      WHERE document_id = $1 AND status = 'open' LIMIT 1;`,
    [payload.document_id],
  );
  if (existing.rows.length > 0) {
    return fail(
      'QUALITY_READING_ALREADY_OPEN',
      'Este documento ya tiene una publicacion abierta en la sala de lectura.',
    );
  }

  const { pagesTotal, sha256, title } = await inspectSourceDocument(payload.document_id);

  const inserted = await pool.query(
    `INSERT INTO public.quality_reading_publications
       (document_id, title_snapshot, source_sha256, pages_total,
        min_seconds_per_page, default_deadline_hours, instructions, published_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id;`,
    [
      payload.document_id,
      title,
      sha256,
      pagesTotal,
      payload.min_seconds_per_page ?? DEFAULT_MIN_SECONDS_PER_PAGE,
      payload.deadline_hours ?? DEFAULT_DEADLINE_HOURS,
      payload.instructions ?? null,
      publishedByUserId,
    ],
  );

  return (await getPublicationById(Number(inserted.rows[0].id)))!;
};

export const listPublications = async (
  filters: { status?: PublicationStatus } = {},
): Promise<PublicationRecord[]> => {
  await assertTables();

  const values: unknown[] = [];
  let where = '';
  if (filters.status) {
    values.push(filters.status);
    where = `WHERE p.status = $1`;
  }

  const result = await pool.query(
    `${PUBLICATION_SELECT} ${where}
     GROUP BY p.id, d.title, u.full_name
     ORDER BY p.published_at DESC;`,
    values,
  );

  return result.rows.map(mapPublication);
};

export const getPublicationById = async (
  publicationId: number,
): Promise<PublicationRecord | null> => {
  await assertTables();

  const result = await pool.query(
    `${PUBLICATION_SELECT} WHERE p.id = $1
     GROUP BY p.id, d.title, u.full_name LIMIT 1;`,
    [publicationId],
  );

  return result.rows.length > 0 ? mapPublication(result.rows[0]) : null;
};

/**
 * Cierra una publicacion. No borra nada: las lecturas firmadas siguen siendo
 * evidencia y las pendientes quedan como estan, historicas.
 */
export const closePublication = async (publicationId: number): Promise<PublicationRecord> => {
  await assertTables();

  const result = await pool.query(
    `UPDATE public.quality_reading_publications
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'open'
      RETURNING id;`,
    [publicationId],
  );

  if (result.rows.length === 0) {
    return fail('QUALITY_READING_NOT_FOUND', 'La publicacion no existe o ya estaba cerrada.');
  }

  return (await getPublicationById(publicationId))!;
};

// ---------------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------------

const READING_SELECT = `
  SELECT
    a.*,
    u.full_name AS user_name,
    u.email AS user_email,
    e.area AS employee_area,
    COALESCE(array_length(a.pages_seen, 1), 0) AS pages_seen_count
  FROM public.quality_reading_acknowledgements a
  INNER JOIN public.users u ON u.id = a.user_id
  LEFT JOIN public.employees e ON e.id = a.employee_id
`;

const mapReading = (row: any): ReadingRecord => ({
  id: Number(row.id),
  publication_id: Number(row.publication_id),
  user_id: String(row.user_id),
  user_name: String(row.user_name ?? ''),
  user_email: String(row.user_email ?? ''),
  employee_id: row.employee_id === null ? null : Number(row.employee_id),
  employee_area: row.employee_area ? String(row.employee_area) : null,
  status: String(row.status) as ReadingStatus,
  assigned_at: row.assigned_at ? toIsoDateTime(row.assigned_at) : null,
  deadline_at: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
  started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
  read_completed_at: row.read_completed_at ? toIsoDateTime(row.read_completed_at) : null,
  signed_at: row.signed_at ? toIsoDateTime(row.signed_at) : null,
  pages_total: Number(row.pages_total),
  pages_seen_count: Number(row.pages_seen_count ?? 0),
  min_seconds_per_page: Number(row.min_seconds_per_page),
  active_seconds: Number(row.active_seconds ?? 0),
});

export const listReaders = async (publicationId: number): Promise<ReadingRecord[]> => {
  await assertTables();

  const result = await pool.query(
    `${READING_SELECT}
      WHERE a.publication_id = $1
      ORDER BY u.full_name ASC;`,
    [publicationId],
  );

  return result.rows.map(mapReading);
};

/**
 * Resuelve a quienes hay que asignarles la lectura. El lector es un USUARIO
 * (quien inicia sesion y firma); el empleado se guarda solo como referencia
 * para reportar por area, y puede no existir.
 */
const resolveTargetUsers = async (
  payload: AssignReadersPayload,
): Promise<Array<{ user_id: string; employee_id: number | null }>> => {
  if (payload.mode === 'users') {
    const userIds = [...new Set(payload.user_ids)];
    if (userIds.length === 0) {
      return fail('QUALITY_READING_NO_READERS', 'Debes seleccionar al menos un lector.');
    }

    const result = await pool.query(
      `SELECT u.id AS user_id, e.id AS employee_id
         FROM public.users u
         LEFT JOIN public.employees e ON e.user_id = u.id AND e.is_active = TRUE
        WHERE u.id = ANY($1::uuid[]) AND u.is_active = TRUE;`,
      [userIds],
    );
    return result.rows.map((row) => ({
      user_id: String(row.user_id),
      employee_id: row.employee_id === null ? null : Number(row.employee_id),
    }));
  }

  // Por area y "todos" salen del padron de colaboradores, que es donde vive el
  // area; sin usuario ligado no hay quien lea ni firme, asi que se excluyen.
  const values: unknown[] = [];
  let areaFilter = '';
  if (payload.mode === 'area') {
    values.push(payload.area);
    areaFilter = 'AND e.area = $1';
  }

  const result = await pool.query(
    `SELECT e.user_id, e.id AS employee_id
       FROM public.employees e
       INNER JOIN public.users u ON u.id = e.user_id AND u.is_active = TRUE
      WHERE e.is_active = TRUE AND e.user_id IS NOT NULL ${areaFilter};`,
    values,
  );

  return result.rows.map((row) => ({
    user_id: String(row.user_id),
    employee_id: row.employee_id === null ? null : Number(row.employee_id),
  }));
};

const hasActiveReading = async (
  client: Queryable,
  publicationId: number,
  userId: string,
): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1 FROM public.quality_reading_acknowledgements
      WHERE publication_id = $1 AND user_id = $2
        AND status IN ('pending', 'in_progress', 'read', 'signed')
      LIMIT 1;`,
    [publicationId, userId],
  );
  return result.rows.length > 0;
};

/**
 * Asigna lectores a una publicacion abierta. Idempotente: quien ya tiene una
 * lectura vigente (o ya firmo) se omite en lugar de fallar el lote, para que
 * "asignar a todos" se pueda repetir sin duplicar ni pisar evidencia.
 */
export const assignReaders = async (
  publicationId: number,
  payload: AssignReadersPayload,
  assignedByUserId: string,
): Promise<{ created: ReadingRecord[]; skipped_user_ids: string[] }> => {
  await assertTables();

  const publication = await getPublicationById(publicationId);
  if (!publication) {
    return fail('QUALITY_READING_NOT_FOUND', 'La publicacion no existe.');
  }
  if (publication.status !== 'open') {
    return fail(
      'QUALITY_READING_CLOSED',
      'La publicacion esta cerrada: no admite lectores nuevos.',
    );
  }

  const targets = await resolveTargetUsers(payload);
  if (targets.length === 0) {
    return fail(
      'QUALITY_READING_NO_READERS',
      'No se encontraron colaboradores con usuario activo para esa seleccion.',
    );
  }

  const deadlineHours = payload.deadline_hours ?? publication.default_deadline_hours;

  return withTransaction(async (client) => {
    const created: ReadingRecord[] = [];
    const skipped: string[] = [];

    for (const target of targets) {
      if (await hasActiveReading(client, publicationId, target.user_id)) {
        skipped.push(target.user_id);
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO public.quality_reading_acknowledgements
           (publication_id, user_id, employee_id, deadline_at, pages_total,
            min_seconds_per_page, source_sha256, assigned_by_user_id)
         VALUES ($1, $2, $3, NOW() + make_interval(hours => $4), $5, $6, $7, $8)
         RETURNING id;`,
        [
          publicationId,
          target.user_id,
          target.employee_id,
          deadlineHours,
          publication.pages_total,
          publication.min_seconds_per_page,
          publication.source_sha256,
          assignedByUserId,
        ],
      );

      const detail = await client.query(`${READING_SELECT} WHERE a.id = $1;`, [
        Number(inserted.rows[0].id),
      ]);
      created.push(mapReading(detail.rows[0]));
    }

    return { created, skipped_user_ids: skipped };
  });
};

/**
 * Cancela una lectura aun no firmada. Una firmada es evidencia: no se cancela
 * ni se borra nunca.
 */
export const cancelReading = async (readingId: number): Promise<boolean> => {
  await assertTables();

  const result = await pool.query(
    `UPDATE public.quality_reading_acknowledgements
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'in_progress', 'read', 'expired')
      RETURNING id;`,
    [readingId],
  );

  if (result.rows.length > 0) {
    return true;
  }

  const existing = await pool.query(
    `SELECT status FROM public.quality_reading_acknowledgements WHERE id = $1;`,
    [readingId],
  );
  if (existing.rows.length === 0) {
    return fail('QUALITY_READING_NOT_FOUND', 'La lectura no existe.');
  }

  return fail(
    'QUALITY_READING_ALREADY_SIGNED',
    'Esta lectura ya fue firmada: es evidencia y no se puede cancelar.',
  );
};

/** Areas con colaboradores activos, para el selector de asignacion. */
export const listAssignableAreas = async (): Promise<Array<{ area: string; total: number }>> => {
  const result = await pool.query(
    `SELECT e.area, COUNT(*)::int AS total
       FROM public.employees e
       INNER JOIN public.users u ON u.id = e.user_id AND u.is_active = TRUE
      WHERE e.is_active = TRUE AND e.area IS NOT NULL AND e.area <> ''
      GROUP BY e.area
      ORDER BY e.area ASC;`,
  );

  return result.rows.map((row) => ({ area: String(row.area), total: Number(row.total) }));
};

/**
 * Marca como vencidas las lecturas cuyo plazo ya paso. Idempotente: solo toca
 * las que siguen en curso, nunca una firmada (que es evidencia).
 */
export const expireOverdueReadings = async (): Promise<number> => {
  if (!(await tablesExist())) {
    return 0;
  }

  const result = await pool.query(
    `UPDATE public.quality_reading_acknowledgements
        SET status = 'expired', updated_at = NOW()
      WHERE status IN ('pending', 'in_progress', 'read')
        AND deadline_at < NOW()
      RETURNING id;`,
  );
  return result.rowCount ?? 0;
};
