import fs from 'fs';
import pool from '../config/db';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { getEmployeeInductionMasterRecord } from './rh-induction-master-record.service';
import { buildInductionMasterRecordPdf } from './rh-induction-master-record.pdf';

/**
 * Cierre formal del Formato de Induccion (REH-REG-005, CR-01): convierte el
 * master record en la evidencia documental final del proceso. Genera el PDF
 * definitivo con las 3 firmas digitales y lo archiva en el expediente
 * (FORMA_INDUCC, seccion PROG_IND). Un cierre nunca se borra: una correccion
 * (supersede) genera un cierre nuevo y el anterior queda is_current = FALSE.
 *
 * Gate server-side (decision del usuario, "cierre por etapas etiquetado"):
 *  - Positivo: solo con verdict COMPLETA_1_A_4 del master record, dictamen
 *    APROBADA_INSTITUCIONAL. Cuando el Bloque REH-REG-003 traiga las Fases
 *    5-7, aqui se resolvera APROBADA_COMPLETA.
 *  - NO_APROBADA: procede en cualquier momento, con motivo obligatorio.
 */

export type RhInductionClosureVerdict = 'APROBADA_INSTITUCIONAL' | 'APROBADA_COMPLETA' | 'NO_APROBADA';

export const CLOSURE_VERDICT_LABELS: Record<RhInductionClosureVerdict, string> = {
  APROBADA_INSTITUCIONAL: 'INDUCCIÓN INSTITUCIONAL (FASES 1-4) APROBADA',
  APROBADA_COMPLETA: 'INDUCCIÓN COMPLETA (7 FASES) APROBADA',
  NO_APROBADA: 'INDUCCIÓN NO SUPERADA',
};

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface RhInductionClosureRecord {
  id: number;
  employee_id: number;
  verdict: RhInductionClosureVerdict;
  verdict_label: string;
  closing_notes: string | null;
  rh_signatory_name: string;
  area_signatory_name: string;
  document_id: number | null;
  created_at: string;
}

const mapClosureRow = (row: any): RhInductionClosureRecord => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  verdict: String(row.verdict) as RhInductionClosureVerdict,
  verdict_label: CLOSURE_VERDICT_LABELS[String(row.verdict) as RhInductionClosureVerdict] ?? String(row.verdict),
  closing_notes: row.closing_notes ? String(row.closing_notes) : null,
  rh_signatory_name: String(row.rh_signatory_name),
  area_signatory_name: String(row.area_signatory_name),
  document_id: row.document_id ? Number(row.document_id) : null,
  created_at: String(row.created_at),
});

/** Cierre vigente del colaborador, o null si el registro sigue abierto. */
export const getCurrentInductionClosure = async (employeeId: number): Promise<RhInductionClosureRecord | null> => {
  const result = await pool.query(
    `SELECT id, employee_id, verdict, closing_notes, rh_signatory_name, area_signatory_name, document_id, created_at
       FROM public.rh_induction_record_closures
      WHERE employee_id = $1 AND is_current = TRUE
      LIMIT 1;`,
    [employeeId],
  );
  return result.rows.length > 0 ? mapClosureRow(result.rows[0]) : null;
};

/**
 * Cierre vigente + buffers de firma leidos de disco, para re-renderizar el PDF
 * cerrado en el export del panel. Si algun PNG ya no existe (storage movido),
 * devuelve null y el export cae al reporte de avance — el PDF archivado en el
 * expediente sigue siendo la evidencia.
 */
export const getCurrentInductionClosureForPdf = async (
  employeeId: number,
): Promise<{ closure: RhInductionClosureRecord; signatures: { collaborator: Buffer; rh: Buffer; area: Buffer } } | null> => {
  const result = await pool.query(
    `SELECT id, employee_id, verdict, closing_notes, rh_signatory_name, area_signatory_name, document_id, created_at,
            collaborator_signature_path, rh_signature_path, area_signature_path
       FROM public.rh_induction_record_closures
      WHERE employee_id = $1 AND is_current = TRUE
      LIMIT 1;`,
    [employeeId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  try {
    return {
      closure: mapClosureRow(row),
      signatures: {
        collaborator: fs.readFileSync(String(row.collaborator_signature_path)),
        rh: fs.readFileSync(String(row.rh_signature_path)),
        area: fs.readFileSync(String(row.area_signature_path)),
      },
    };
  } catch {
    return null;
  }
};

export interface CloseInductionRecordInput {
  employeeId: number;
  verdict: 'APROBADA' | 'NO_APROBADA';
  closingNotes?: string | null;
  collaboratorSignature: string;
  rhSignature: string;
  areaSignature: string;
  rhSignatoryName: string;
  areaSignatoryName: string;
  /** true = re-cierre correctivo: supersede el cierre vigente. */
  supersede?: boolean;
  closedByUserId: string | null;
}

export const closeInductionRecord = async (input: CloseInductionRecordInput): Promise<RhInductionClosureRecord> => {
  const record = await getEmployeeInductionMasterRecord(input.employeeId);

  const existing = await getCurrentInductionClosure(input.employeeId);
  if (existing && !input.supersede) {
    throwCoded('RH_INDUCTION_ALREADY_CLOSED', 'El Formato de Induccion de este colaborador ya esta cerrado.');
  }

  // Gate del dictamen (server-side, nunca se confia en el cliente): con las 7
  // fases aprobadas el cierre es COMPLETO; con solo las institucionales (1-4),
  // cierre por etapas etiquetado APROBADA_INSTITUCIONAL.
  let verdict: RhInductionClosureVerdict;
  if (input.verdict === 'APROBADA') {
    if (record.summary.verdict === 'COMPLETA_7_FASES') {
      verdict = 'APROBADA_COMPLETA';
    } else if (record.summary.verdict === 'COMPLETA_1_A_4') {
      verdict = 'APROBADA_INSTITUCIONAL';
    } else {
      return throwCoded(
        'RH_INDUCTION_CLOSE_NOT_READY',
        'Para cerrar como aprobada, las fases institucionales (1-4) deben estar todas aprobadas.',
      );
    }
  } else {
    const notes = input.closingNotes?.trim();
    if (!notes) {
      throwCoded('RH_INDUCTION_CLOSE_NOTES_REQUIRED', 'El cierre como no aprobada requiere el motivo.');
    }
    verdict = 'NO_APROBADA';
  }
  const closingNotes = input.closingNotes?.trim() || null;

  // Las 3 firmas son obligatorias.
  const collaboratorPng = decodeSignaturePng(input.collaboratorSignature);
  const rhPng = decodeSignaturePng(input.rhSignature);
  const areaPng = decodeSignaturePng(input.areaSignature);
  if (!collaboratorPng || !rhPng || !areaPng) {
    throwCoded('RH_INDUCTION_INVALID_SIGNATURE', 'Las tres firmas son obligatorias y no pueden estar vacias.');
  }

  const closedAt = new Date();
  const verdictLabel = CLOSURE_VERDICT_LABELS[verdict];

  const pdf = await buildInductionMasterRecordPdf(record, {
    verdictLabel,
    closedAt,
    closingNotes,
    collaboratorName: record.employee.full_name,
    rhSignatoryName: input.rhSignatoryName.trim(),
    areaSignatoryName: input.areaSignatoryName.trim(),
    collaboratorSignaturePng: collaboratorPng!,
    rhSignaturePng: rhPng!,
    areaSignaturePng: areaPng!,
  });

  const uploadedByUserId: string =
    input.closedByUserId ?? (await resolveFallbackUserId()) ?? throwCoded('RH_INDUCTION_CLOSE_USER_NOT_FOUND');

  // El archivo del PDF versiona por si mismo (superseded) en su propia
  // transaccion; despues se registra el cierre. Si el INSERT del cierre
  // fallara, el documento archivado queda como version huerfana inocua (el
  // siguiente cierre la supersede) — preferible a evidencia firmada sin PDF.
  const documentId = await archiveGeneratedPdfToExpedient({
    employeeId: input.employeeId,
    documentTypeCode: 'FORMA_INDUCC',
    referenceKey: `induction_record:${input.employeeId}`,
    title: `REH-REG-005 Formato de Inducción - ${verdictLabel}`,
    description: `Registro cerrado el ${closedAt.toLocaleDateString('es-MX')}${closingNotes ? `. Motivo: ${closingNotes}` : ''}`,
    pdf,
    uploadedByUserId,
  });

  const signaturePaths = {
    collaborator: writeSignaturePng(collaboratorPng!, 'IND-CLOSE'),
    rh: writeSignaturePng(rhPng!, 'IND-CLOSE'),
    area: writeSignaturePng(areaPng!, 'IND-CLOSE'),
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (existing) {
      await client.query(
        `UPDATE public.rh_induction_record_closures SET is_current = FALSE WHERE employee_id = $1 AND is_current = TRUE;`,
        [input.employeeId],
      );
    }
    const inserted = await client.query(
      `INSERT INTO public.rh_induction_record_closures
         (employee_id, verdict, closing_notes, collaborator_signature_path, rh_signature_path, area_signature_path,
          rh_signatory_name, area_signatory_name, closed_by_user_id, document_id, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       RETURNING id, employee_id, verdict, closing_notes, rh_signatory_name, area_signatory_name, document_id, created_at;`,
      [
        input.employeeId,
        verdict,
        closingNotes,
        signaturePaths.collaborator,
        signaturePaths.rh,
        signaturePaths.area,
        input.rhSignatoryName.trim(),
        input.areaSignatoryName.trim(),
        input.closedByUserId,
        documentId,
      ],
    );
    await client.query('COMMIT');
    return mapClosureRow(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    for (const filePath of Object.values(signaturePaths)) {
      try {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
      } catch {
        /* limpieza best-effort */
      }
    }
    throw error;
  } finally {
    client.release();
  }
};

const resolveFallbackUserId = async (): Promise<string | null> => {
  const admin = await pool.query(
    `SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].id) : null;
};
