import pool from '../config/db';
import { loadReaderConstancia, resolveMyReadingSource } from './quality-reading-self.service';

// -----------------------------------------------------------------------------
// Induccion: RH consulta, desde el Tablero (drawer del colaborador), el
// documento que leyo un inscrito y su hoja de firma.
//
// Regla de visibilidad (2026-09-10): ningun modulo expone documentos completos.
//   - El documento del SGC se sirve SOLO para el visor protegido (inline, sin
//     descarga ni impresion en la UI), igual que al lector en Mis lecturas.
//   - La evidencia de firma se entrega como la hoja de acuse (una pagina, con
//     titulo, SHA-256 y firma autografa); la copia firmada completa no sale del
//     disco.
// Solo aplica a acuses ligados a una inscripcion de Induccion: no abre la Sala
// de Lectura de Calidad a RH.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = publicMessage;
  throw error;
};

export interface InductionAcknowledgementOwner {
  acknowledgement_id: number;
  user_id: string;
  employee_id: number;
  status: string;
}

const loadInductionAcknowledgement = async (acknowledgementId: number): Promise<InductionAcknowledgementOwner> => {
  const result = await pool.query(
    `SELECT a.id, a.user_id, a.status, e.employee_id
       FROM public.quality_reading_acknowledgements a
       INNER JOIN public.rh_induction_reading_items ri ON ri.acknowledgement_id = a.id
       INNER JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
      WHERE a.id = $1
      LIMIT 1;`,
    [acknowledgementId],
  );
  if (result.rows.length === 0) {
    return throwCoded('RH_INDUCTION_ACK_NOT_FOUND', 'La lectura no pertenece a una fase de induccion.');
  }
  const row = result.rows[0];
  return {
    acknowledgement_id: Number(row.id),
    user_id: String(row.user_id),
    employee_id: Number(row.employee_id),
    status: String(row.status),
  };
};

/** Documento leido, para el visor protegido. */
export const resolveInductionReadingDocument = async (
  acknowledgementId: number,
): Promise<{ absolutePath: string; title: string; owner: InductionAcknowledgementOwner }> => {
  const owner = await loadInductionAcknowledgement(acknowledgementId);
  // La autorizacion de RH ya la dio el permiso de la ruta; se resuelve como
  // dueno del acuse para reutilizar exactamente el mismo archivo que leyo.
  const source = await resolveMyReadingSource(acknowledgementId, owner.user_id);
  return { ...source, owner };
};

/** Hoja de firma (solo la pagina de acuse) de un documento ya firmado. */
export const loadInductionSignatureSheet = async (
  acknowledgementId: number,
): Promise<{ content: Buffer; fileName: string; owner: InductionAcknowledgementOwner }> => {
  const owner = await loadInductionAcknowledgement(acknowledgementId);
  if (owner.status !== 'signed') {
    return throwCoded('RH_INDUCTION_ACK_NOT_SIGNED', 'El colaborador aun no firma este documento.');
  }
  const sheet = await loadReaderConstancia(acknowledgementId, owner.user_id);
  return { ...sheet, fileName: sheet.fileName.replace(' - Constancia de lectura.pdf', ' - Hoja de firma.pdf'), owner };
};
