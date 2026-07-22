import pool from '../config/db';

// Sala de Lectura (modulo Calidad). SL-01 solo aporta la guarda de integridad
// que protege a los documentos publicados; la operacion completa llega en SL-03.

export interface DocumentReadingUsage {
  publications: number;
  signed: number;
}

// Las tablas pueden no existir todavia en un entorno sin la migracion
// 20260722_01 aplicada. En ese caso no hay nada que proteger y la guarda no
// debe romper el flujo documental de Calidad, que es anterior e independiente.
const tablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.quality_reading_publications') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

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
  const partes = [
    `${usage.publications} publicacion(es) de sala de lectura`,
  ];

  if (usage.signed > 0) {
    partes.push(`${usage.signed} firma(s) ya recabada(s)`);
  }

  return `No se puede eliminar: el documento tiene ${partes.join(' y ')}. La evidencia de lectura depende de este archivo.`;
};
