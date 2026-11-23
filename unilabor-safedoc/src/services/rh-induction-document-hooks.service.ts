import type { Queryable } from '../utils/transaction';

// Enganche de Induccion hacia el flujo documental de Calidad. Igual que
// `quality-reading-hooks.service`, no importa nada del dominio documental para
// que la dependencia vaya en un solo sentido (document.service -> aqui).

export interface InductionRelinkResult {
  /** Ligas puesto-documento (lectura de la Fase 5) pasadas a la version nueva. */
  positions: number;
  /** Ligas fase-documento (Fases 1 a 4) pasadas a la version nueva. */
  phases: number;
}

const tableExists = async (client: Queryable, table: string): Promise<boolean> => {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists;`, [`public.${table}`]);
  return Boolean(result.rows[0]?.exists);
};

/**
 * Pasa a la version nueva las ligas de Induccion de un documento que acaba de
 * ser reemplazado: los documentos obligatorios de cada puesto y los de las
 * fases institucionales.
 *
 * Sin esto la liga se queda en la version reemplazada: los puestos (que solo
 * toman documentos vigentes) pierden el documento en silencio, y las fases
 * institucionales intentan publicar a lectura una version que ya no es vigente.
 *
 * Solo cambia configuracion, y por lo tanto solo afecta a inscripciones
 * FUTURAS: las lecturas ya asignadas y las firmadas (rh_induction_reading_items)
 * no se tocan. Corre dentro de la transaccion del reemplazo. Si ya existiera
 * una liga a la version nueva (indice unico por puesto / fase y documento) la
 * anterior se deja como esta.
 */
export const relinkInductionDocumentsForReplacedDocument = async (
  client: Queryable,
  previousDocumentId: string,
  newDocumentId: string,
): Promise<InductionRelinkResult> => {
  const outcome: InductionRelinkResult = { positions: 0, phases: 0 };

  if (await tableExists(client, 'rh_position_documents')) {
    const result = await client.query(
      `UPDATE public.rh_position_documents pd
          SET document_id = $2
        WHERE pd.document_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM public.rh_position_documents other
             WHERE other.position_id = pd.position_id AND other.document_id = $2
          );`,
      [previousDocumentId, newDocumentId],
    );
    outcome.positions = result.rowCount ?? 0;
  }

  if (await tableExists(client, 'rh_induction_phase_documents')) {
    const result = await client.query(
      `UPDATE public.rh_induction_phase_documents pd
          SET document_id = $2
        WHERE pd.document_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM public.rh_induction_phase_documents other
             WHERE other.phase_id = pd.phase_id AND other.document_id = $2
          );`,
      [previousDocumentId, newDocumentId],
    );
    outcome.phases = result.rowCount ?? 0;
  }

  return outcome;
};
