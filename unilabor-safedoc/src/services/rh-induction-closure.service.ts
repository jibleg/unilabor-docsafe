import fs from 'fs';
import pool from '../config/db';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import {
  getEmployeeInductionMasterRecord,
  scopeMasterRecordToPosition,
  type RhInductionMasterRecord,
} from './rh-induction-master-record.service';
import { buildInductionMasterRecordPdf } from './rh-induction-master-record.pdf';
import { holderOf } from './rh-competency-signers.service';
import { resolveAreaResponsibleFor } from './rh-supervision-area-responsible.service';

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
 *
 * Cierre POR PUESTO (position_id con valor): cerrada la Carta de asignacion
 * de puesto REH-REG-008 de un puesto, se cierra el formato de ese puesto
 * (Fases 1-4 + 5-7 del puesto) como APROBADA_COMPLETA. La carta cerrada y
 * vigente es el candado; cada puesto lleva su propio cierre y su propio PDF
 * en el expediente. El cierre general (position_id NULL) no cambia.
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
  /** Puesto del cierre; null = cierre general del colaborador. */
  position_id: number | null;
  assignment_letter_id: number | null;
}

const CLOSURE_COLUMNS = `id, employee_id, verdict, closing_notes, rh_signatory_name, area_signatory_name, document_id,
            created_at, position_id, assignment_letter_id`;

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
  position_id: row.position_id ? Number(row.position_id) : null,
  assignment_letter_id: row.assignment_letter_id ? Number(row.assignment_letter_id) : null,
});

/** Cierre vigente (general, o del puesto indicado), o null si el registro sigue abierto. */
export const getCurrentInductionClosure = async (
  employeeId: number,
  positionId: number | null = null,
): Promise<RhInductionClosureRecord | null> => {
  const result = await pool.query(
    `SELECT ${CLOSURE_COLUMNS}
       FROM public.rh_induction_record_closures
      WHERE employee_id = $1 AND is_current = TRUE AND position_id IS NOT DISTINCT FROM $2::bigint
      LIMIT 1;`,
    [employeeId, positionId],
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
  positionId: number | null = null,
): Promise<{ closure: RhInductionClosureRecord; signatures: { collaborator: Buffer; rh: Buffer; area: Buffer } } | null> => {
  const result = await pool.query(
    `SELECT ${CLOSURE_COLUMNS},
            collaborator_signature_path, rh_signature_path, area_signature_path
       FROM public.rh_induction_record_closures
      WHERE employee_id = $1 AND is_current = TRUE AND position_id IS NOT DISTINCT FROM $2::bigint
      LIMIT 1;`,
    [employeeId, positionId],
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

/** Carta REH-REG-008 cerrada y vigente (no sustituida) de un puesto: habilita el cierre de ese puesto. */
export interface ClosedAssignmentLetterRef {
  letter_id: number;
  letter_folio: string | null;
  letter_closed_at: string;
  position_id: number;
  position_name: string;
  /** Coordinador del area asignado en la carta (o, en su defecto, en el REH-REG-003 del puesto). */
  area_signatory_name: string;
  /** Coordinador de RH asignado en el REH-REG-003 del puesto; vacio si no hay. */
  rh_signatory_name: string;
}

const listClosedAssignmentLetters = async (
  employeeId: number,
  positionId: number | null = null,
): Promise<ClosedAssignmentLetterRef[]> => {
  const result = await pool.query(
    `SELECT DISTINCT ON (l.position_id)
            l.id, l.folio, l.closed_at, l.position_id, rp.name AS position_name,
            COALESCE(NULLIF(BTRIM(l.area_signatory_name), ''), ce.area_signatory_name) AS area_signatory_name,
            ce.rh_signatory_name
       FROM public.rh_assignment_letters l
       JOIN public.rh_positions rp ON rp.id = l.position_id
       LEFT JOIN public.rh_competency_evaluations ce ON ce.id = l.competency_evaluation_id
      WHERE l.employee_id = $1
        AND l.status = 'CLOSED'
        AND l.superseded_by_letter_id IS NULL
        AND ($2::bigint IS NULL OR l.position_id = $2::bigint)
      ORDER BY l.position_id, l.closed_at DESC NULLS LAST, l.id DESC;`,
    [employeeId, positionId],
  );
  return result.rows.map((row) => ({
    letter_id: Number(row.id),
    letter_folio: row.folio ? String(row.folio) : null,
    letter_closed_at: new Date(row.closed_at).toISOString(),
    position_id: Number(row.position_id),
    position_name: String(row.position_name),
    area_signatory_name: String(row.area_signatory_name ?? '').trim(),
    rh_signatory_name: String(row.rh_signatory_name ?? '').trim(),
  }));
};

export interface RhInductionPositionClosureRow extends ClosedAssignmentLetterRef {
  /** Fases del puesto que el sistema no tiene como aprobadas (aviso al cerrar; no bloquea). */
  pending_phases: string[];
  closure: RhInductionClosureRecord | null;
}

/**
 * Puestos del colaborador con carta REH-REG-008 cerrada: cada uno puede cerrar
 * su Formato de Induccion. Recibe el master record completo ya consultado.
 */
export const listPositionClosures = async (record: RhInductionMasterRecord): Promise<RhInductionPositionClosureRow[]> => {
  const letters = await listClosedAssignmentLetters(record.employee.id);
  if (letters.length === 0) {
    return [];
  }
  const closures = await pool.query(
    `SELECT ${CLOSURE_COLUMNS}
       FROM public.rh_induction_record_closures
      WHERE employee_id = $1 AND is_current = TRUE AND position_id IS NOT NULL;`,
    [record.employee.id],
  );
  const closureByPosition = new Map<number, RhInductionClosureRecord>(
    closures.rows.map((row) => [Number(row.position_id), mapClosureRow(row)]),
  );
  // Firmantes asignados al colaborador en el puesto: los de la carta y su
  // REH-REG-003; si faltan, los que resuelve la configuracion vigente.
  const rhHolder = letters.some((letter) => !letter.rh_signatory_name) ? await holderOf('CRH', record.employee.id) : null;
  const areaFallback = new Map<number, string>();
  for (const letter of letters.filter((item) => !item.area_signatory_name)) {
    const responsible = await resolveAreaResponsibleFor(letter.position_id, record.employee.id);
    areaFallback.set(letter.position_id, responsible?.candidate.name ?? '');
  }
  return letters
    .sort((a, b) => a.letter_closed_at.localeCompare(b.letter_closed_at))
    .map((letter) => {
      const scoped = scopeMasterRecordToPosition(record, { id: letter.position_id, name: letter.position_name });
      return {
        ...letter,
        area_signatory_name: letter.area_signatory_name || areaFallback.get(letter.position_id) || '',
        rh_signatory_name: letter.rh_signatory_name || rhHolder?.name || '',
        pending_phases: scoped.phases
          .filter((phase) => phase.status !== 'APROBADA')
          .map((phase) => `Fase ${phase.phase_number}`),
        closure: closureByPosition.get(letter.position_id) ?? null,
      };
    });
};

export interface CloseInductionRecordInput {
  employeeId: number;
  /** Con valor, cierra el formato de ese puesto (requiere su carta REH-REG-008 cerrada). */
  positionId?: number | null;
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
  const positionId = input.positionId ?? null;
  const fullRecord = await getEmployeeInductionMasterRecord(input.employeeId);

  // Cierre por puesto: el candado es la carta REH-REG-008 cerrada y vigente.
  let letter: ClosedAssignmentLetterRef | null = null;
  if (positionId !== null) {
    letter = (await listClosedAssignmentLetters(input.employeeId, positionId))[0] ?? null;
    if (!letter) {
      return throwCoded(
        'RH_INDUCTION_CLOSE_LETTER_NOT_CLOSED',
        'Para cerrar el Formato de Induccion de este puesto, primero debe estar cerrada su Carta de asignacion de puesto (REH-REG-008).',
      );
    }
  }
  const record = letter
    ? scopeMasterRecordToPosition(fullRecord, { id: letter.position_id, name: letter.position_name })
    : fullRecord;

  const existing = await getCurrentInductionClosure(input.employeeId, positionId);
  if (existing && !input.supersede) {
    throwCoded(
      'RH_INDUCTION_ALREADY_CLOSED',
      letter
        ? 'El Formato de Induccion de este puesto ya esta cerrado.'
        : 'El Formato de Induccion de este colaborador ya esta cerrado.',
    );
  }

  // Gate del dictamen (server-side, nunca se confia en el cliente): con las 7
  // fases aprobadas el cierre es COMPLETO; con solo las institucionales (1-4),
  // cierre por etapas etiquetado APROBADA_INSTITUCIONAL. Por puesto, la carta
  // cerrada es la autorizacion formal: el cierre es siempre COMPLETO.
  let verdict: RhInductionClosureVerdict;
  if (letter) {
    if (input.verdict !== 'APROBADA') {
      return throwCoded(
        'RH_INDUCTION_CLOSE_POSITION_VERDICT',
        'El cierre por puesto procede solo como aprobado: la Carta de asignacion de puesto ya esta cerrada.',
      );
    }
    verdict = 'APROBADA_COMPLETA';
  } else if (input.verdict === 'APROBADA') {
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
    assignmentLetter: letter ? { folio: letter.letter_folio, closedAt: new Date(letter.letter_closed_at) } : null,
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
    // Cada puesto lleva su propia cadena de versiones; la general conserva la suya.
    referenceKey: letter
      ? `induction_record:${input.employeeId}:position:${letter.position_id}`
      : `induction_record:${input.employeeId}`,
    title: letter
      ? `REH-REG-005 Formato de Inducción - ${letter.position_name} - ${verdictLabel}`
      : `REH-REG-005 Formato de Inducción - ${verdictLabel}`,
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
        `UPDATE public.rh_induction_record_closures SET is_current = FALSE
          WHERE employee_id = $1 AND is_current = TRUE AND position_id IS NOT DISTINCT FROM $2::bigint;`,
        [input.employeeId, positionId],
      );
    }
    const inserted = await client.query(
      `INSERT INTO public.rh_induction_record_closures
         (employee_id, verdict, closing_notes, collaborator_signature_path, rh_signature_path, area_signature_path,
          rh_signatory_name, area_signatory_name, closed_by_user_id, document_id, is_current,
          position_id, assignment_letter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12)
       RETURNING ${CLOSURE_COLUMNS};`,
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
        positionId,
        letter?.letter_id ?? null,
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

/**
 * Firmantes sugeridos para el cierre general (sin puesto): quien ocupa la
 * Coordinacion de RH y el Responsable del Area del puesto activo mas antiguo
 * del colaborador. Vacio = sin dato; RH lo captura.
 */
export const getGeneralClosureSuggestedSigners = async (
  employeeId: number,
): Promise<{ rh_signatory_name: string; area_signatory_name: string }> => {
  const position = await pool.query(
    `SELECT ep.position_id FROM public.rh_employee_positions ep
      WHERE ep.employee_id = $1 AND ep.is_active = TRUE
      ORDER BY ep.assigned_at ASC LIMIT 1;`,
    [employeeId],
  );
  const positionId = position.rows[0]?.position_id ? Number(position.rows[0].position_id) : null;
  const [rh, area] = await Promise.all([
    holderOf('CRH', employeeId),
    positionId ? resolveAreaResponsibleFor(positionId, employeeId) : Promise.resolve(null),
  ]);
  return { rh_signatory_name: rh?.name ?? '', area_signatory_name: area?.candidate.name ?? '' };
};

/** Usuario de respaldo para acciones automaticas sin sesion: el administrador activo mas antiguo. */
export const resolveFallbackUserId = async (): Promise<string | null> => {
  const admin = await pool.query(
    `SELECT id FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].id) : null;
};
