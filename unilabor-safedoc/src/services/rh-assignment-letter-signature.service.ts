import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { buildAssignmentLetterPdf } from './rh-assignment-letter.pdf';
import { assertLetterEditable, getAssignmentLetter, type AssignmentLetterRecord } from './rh-assignment-letter.service';
import { documentSignerIssues, pendingDocumentRoles, type DocumentSignerRole } from './rh-document-signature.rules';
import {
  loadActiveDocumentSignatures,
  loadDocumentSigners,
  lockSignedDocument,
  markSignatureRequested,
} from './rh-document-signature.service';

// -----------------------------------------------------------------------------
// REH-REG-008 en el Buzon de firmas. RH envia la carta a firma (queda bloqueada)
// y firman el colaborador, la Coordinacion del area y el Director General desde
// su sesion. Con la tercera firma se cierra sola: PDF oficial con las tres firmas
// archivado en el expediente.
// -----------------------------------------------------------------------------

const KIND = 'ASSIGNMENT_LETTER' as const;

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

const readPng = (storedPath: string | null): Buffer | null => {
  if (!storedPath) return null;
  const absolute = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  try {
    return fs.existsSync(absolute) ? fs.readFileSync(absolute) : null;
  } catch {
    return null;
  }
};

const assignmentOf = (letter: AssignmentLetterRecord) => ({
  EMPLOYEE: letter.employee_id,
  AREA: letter.area_signatory_employee_id,
  DIRECTOR: letter.director_signatory_employee_id,
});

/**
 * Bloquea la carta y la deja esperando las tres firmas. No se envia si algun
 * firmante no existe, esta de baja o no tiene usuario.
 */
export const sendLetterToSignature = async (id: number, userId: string): Promise<AssignmentLetterRecord> => {
  const letter = await getAssignmentLetter(id);
  assertLetterEditable(letter);
  const issues = documentSignerIssues(KIND, await loadDocumentSigners(KIND, id, assignmentOf(letter)));
  if (issues.length > 0) {
    throwCoded('RH_ASSIGNMENT_SIGNERS_NOT_READY', `No se envio a firma. ${issues.join(' ')}`);
  }
  await withTransaction(async (client) => {
    const locked = await lockSignedDocument(client, KIND, id);
    if (locked.status !== 'DRAFT') throwCoded('RH_ASSIGNMENT_LETTER_CLOSED', 'La carta ya esta firmada.');
    if (locked.in_signature) throwCoded('RH_ASSIGNMENT_LETTER_IN_SIGNATURE', 'La carta ya esta en firma.');
    await markSignatureRequested(client, KIND, id, userId);
  });
  return getAssignmentLetter(id);
};

/**
 * Cierra la carta con sus tres firmas. Devuelve null cuando no procede. El
 * candado de la fila serializa firmas simultaneas (nunca se cierra dos veces).
 */
export const closeFullySignedLetter = async (id: number, triggeredByUserId: string): Promise<AssignmentLetterRecord | null> => {
  const letter = await getAssignmentLetter(id);
  if (!letter.in_signature) return null;
  const closed = await withTransaction(async (client) => {
    const locked = await lockSignedDocument(client, KIND, id);
    if (!locked.in_signature) return false;
    const signatures = await loadActiveDocumentSignatures(client, KIND, id);
    if (pendingDocumentRoles(KIND, signatures.map((signature) => signature.role)).length > 0) return false;
    const byRole = new Map(signatures.map((signature) => [signature.role, signature]));
    const png = (role: DocumentSignerRole): Buffer => {
      const buffer = readPng(byRole.get(role)!.signature_path);
      if (!buffer) {
        throwCoded(
          'RH_ASSIGNMENT_SIGNATURE_FILE_MISSING',
          `No se encontro la imagen de la firma de ${byRole.get(role)!.signer_name}; cancela el envio a firma y vuelve a recabarla.`,
        );
      }
      return buffer!;
    };
    const actorUserId = locked.signature_requested_by_user_id ?? triggeredByUserId;
    const closedAt = new Date();
    // Los nombres que quedan en la carta son los de quienes firmaron.
    const sealed: AssignmentLetterRecord = {
      ...letter,
      status: 'CLOSED',
      in_signature: false,
      closed_at: closedAt.toISOString(),
      area_signatory_name: byRole.get('AREA')!.signer_name || letter.area_signatory_name,
      director_signatory_name: byRole.get('DIRECTOR')!.signer_name || letter.director_signatory_name,
    };
    const pdf = await buildAssignmentLetterPdf({
      letter: sealed,
      draft: false,
      signatures: { collaborator: png('EMPLOYEE'), area: png('AREA'), director: png('DIRECTOR') },
    });
    const documentId = await archiveGeneratedPdfToExpedient({
      employeeId: letter.employee_id,
      documentTypeCode: 'POSITION_ASSIGNMENT',
      referenceKey: `assignment_letter:${letter.id}`,
      title: `REH-REG-008 Carta de asignación de puesto · ${letter.position_code} ${letter.position_name}`,
      description: `${letter.folio} · ${letter.items.filter((item) => item.authorized).length} autorizaciones · Coordinacion del area: ${sealed.area_signatory_name}`,
      pdf,
      uploadedByUserId: actorUserId,
    });
    await client.query(
      `UPDATE public.rh_assignment_letters
          SET status = 'CLOSED', collaborator_signature_path = $2, area_signature_path = $3, director_signature_path = $4,
              area_signatory_name = $5, director_signatory_name = $6,
              document_id = $7, closed_at = $8, closed_by_user_id = $9, updated_at = NOW()
        WHERE id = $1 AND status = 'DRAFT';`,
      [
        letter.id,
        byRole.get('EMPLOYEE')!.signature_path,
        byRole.get('AREA')!.signature_path,
        byRole.get('DIRECTOR')!.signature_path,
        sealed.area_signatory_name,
        sealed.director_signatory_name,
        documentId,
        closedAt,
        actorUserId,
      ],
    );
    return true;
  });
  return closed ? getAssignmentLetter(id) : null;
};

/** PDF de consulta: firmada con sus firmas; en firma con las ya recabadas; borrador con marca de agua. */
export const renderAssignmentLetterPdf = async (id: number): Promise<{ letter: AssignmentLetterRecord; pdf: Buffer }> => {
  const letter = await getAssignmentLetter(id);
  let signatures = { collaborator: null as Buffer | null, area: null as Buffer | null, director: null as Buffer | null };
  if (letter.status === 'CLOSED') {
    const row = (
      await pool.query(
        `SELECT collaborator_signature_path, area_signature_path, director_signature_path FROM public.rh_assignment_letters WHERE id = $1;`,
        [id],
      )
    ).rows[0] ?? {};
    signatures = {
      collaborator: readPng(row.collaborator_signature_path ?? null),
      area: readPng(row.area_signature_path ?? null),
      director: readPng(row.director_signature_path ?? null),
    };
  } else if (letter.in_signature) {
    const byRole = new Map((await loadActiveDocumentSignatures(pool, KIND, id)).map((signature) => [signature.role, signature.signature_path]));
    signatures = {
      collaborator: readPng(byRole.get('EMPLOYEE') ?? null),
      area: readPng(byRole.get('AREA') ?? null),
      director: readPng(byRole.get('DIRECTOR') ?? null),
    };
  }
  const pdf = await buildAssignmentLetterPdf({ letter, draft: letter.status !== 'CLOSED', inSignature: letter.in_signature, signatures });
  return { letter, pdf };
};
