import type { Queryable } from '../utils/transaction';

// Enganches de la sala de lectura hacia el flujo documental de Calidad.
//
// Vive aparte de `quality-reading.service` a proposito: ese modulo importa
// `document.service` (para resolver rutas de archivo), y que document.service
// lo importara de vuelta crearia un ciclo. Aqui no se importa nada del dominio
// documental, asi que la dependencia va en un solo sentido.

/**
 * Cierra las publicaciones abiertas de un documento que acaba de ser
 * reemplazado por una version nueva.
 *
 * Es correctitud, no cosmetica: si la publicacion siguiera abierta, la gente
 * continuaria leyendo y firmando una version que el SGC ya declaro obsoleta.
 * Las lecturas ya firmadas no se tocan: son evidencia de que esa version se
 * leyo cuando estaba vigente.
 *
 * Corre dentro de la transaccion del reemplazo. Si la tabla no existe todavia
 * (entorno sin la migracion 20260722_01) no hace nada, para no romper un flujo
 * documental que es anterior e independiente.
 */
export const closePublicationsForReplacedDocument = async (
  client: Queryable,
  documentId: string,
): Promise<number> => {
  const exists = await client.query(
    `SELECT to_regclass('public.quality_reading_publications') IS NOT NULL AS exists;`,
  );
  if (!exists.rows[0]?.exists) {
    return 0;
  }

  const result = await client.query(
    `UPDATE public.quality_reading_publications
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
      WHERE document_id = $1 AND status = 'open'
      RETURNING id;`,
    [documentId],
  );

  return result.rowCount ?? 0;
};
