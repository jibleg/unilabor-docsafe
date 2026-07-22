import { buildReadingAnnexPdf } from './reading/reading-annex.pdf';

// -----------------------------------------------------------------------------
// Hoja de acuse anexa de RH (RH-ACK-03).
//
// La construccion de la hoja vive en `reading/reading-annex.pdf`, compartida con
// la sala de lectura de Calidad. Aqui solo queda la redaccion propia de RH: el
// documento se identifica por su expediente y quien firma es el colaborador.
// -----------------------------------------------------------------------------

export interface SignedAcknowledgementInput {
  sourcePdf: Buffer;
  signaturePng: Buffer;
  documentTitle: string;
  documentId: number;
  sourceSha256: string;
  employeeName: string;
  employeeCode: string | null;
  pagesTotal: number;
  pagesSeenCount: number;
  activeSeconds: number;
  minSecondsPerPage: number;
  startedAt: Date | null;
  readCompletedAt: Date | null;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Devuelve el PDF original con la hoja de acuse anexa al final.
 */
export const buildSignedAcknowledgementPdf = async (
  input: SignedAcknowledgementInput,
): Promise<Buffer> =>
  buildReadingAnnexPdf({
    sourcePdf: input.sourcePdf,
    signaturePng: input.signaturePng,
    documentTitle: input.documentTitle,
    identifierLabel: 'IDENTIFICADOR',
    identifierValue: `Expediente #${input.documentId}`,
    signerLabel: 'COLABORADOR',
    signerName: input.employeeName,
    signerCode: input.employeeCode,
    sourceSha256: input.sourceSha256,
    pagesTotal: input.pagesTotal,
    pagesSeenCount: input.pagesSeenCount,
    activeSeconds: input.activeSeconds,
    minSecondsPerPage: input.minSecondsPerPage,
    startedAt: input.startedAt,
    readCompletedAt: input.readCompletedAt,
    signedAt: input.signedAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
