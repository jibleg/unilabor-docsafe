import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildReadingAnnexPdf, winAnsiSafe } from './reading-annex.pdf';
import { buildSignedAcknowledgementPdf } from '../rh-acknowledgement-pdf.service';

// PNG 1x1 valido; alcanza para ejercitar el embebido de la firma.
const SIGNATURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const buildSourcePdf = async (pages: number): Promise<Buffer> => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    pdf.addPage([595.28, 841.89]);
  }
  return Buffer.from(await pdf.save());
};

const baseInput = {
  signaturePng: SIGNATURE_PNG,
  documentTitle: 'Procedimiento de control de documentos',
  identifierLabel: 'DOCUMENTO SGC',
  identifierValue: 'PRO-CAL-01 v3',
  signerLabel: 'LECTOR',
  signerName: 'María Ñuñez Pérez',
  signerCode: 'EMP-014',
  sourceSha256: 'a'.repeat(64),
  pagesTotal: 3,
  pagesSeenCount: 3,
  activeSeconds: 95,
  minSecondsPerPage: 7,
  startedAt: new Date('2026-07-22T10:00:00Z'),
  readCompletedAt: new Date('2026-07-22T10:05:00Z'),
  signedAt: new Date('2026-07-22T10:06:00Z'),
  ipAddress: '10.0.0.5',
  userAgent: 'Mozilla/5.0',
};

describe('buildReadingAnnexPdf', () => {
  it('conserva las paginas del original y agrega exactamente una hoja', async () => {
    const sourcePdf = await buildSourcePdf(3);

    const signed = await PDFDocument.load(
      await buildReadingAnnexPdf({ ...baseInput, sourcePdf }),
    );

    expect(signed.getPageCount()).toBe(4);
  });

  it('funciona sin codigo de firmante y con declaracion propia del modulo', async () => {
    const sourcePdf = await buildSourcePdf(1);

    const signed = await PDFDocument.load(
      await buildReadingAnnexPdf({
        ...baseInput,
        sourcePdf,
        signerCode: null,
        declaration: 'Declaro haber leido el documento del SGC que antecede.',
      }),
    );

    expect(signed.getPageCount()).toBe(2);
  });
});

describe('buildSignedAcknowledgementPdf (adaptador de RH)', () => {
  it('sigue generando la hoja anexa a traves del motor compartido', async () => {
    const sourcePdf = await buildSourcePdf(2);

    const signed = await PDFDocument.load(
      await buildSignedAcknowledgementPdf({
        sourcePdf,
        signaturePng: SIGNATURE_PNG,
        documentTitle: 'Reglamento interior de trabajo',
        documentId: 12,
        sourceSha256: 'b'.repeat(64),
        employeeName: 'José Ramírez',
        employeeCode: 'EMP-001',
        pagesTotal: 2,
        pagesSeenCount: 2,
        activeSeconds: 40,
        minSecondsPerPage: 7,
        startedAt: null,
        readCompletedAt: null,
        signedAt: new Date('2026-07-22T10:06:00Z'),
        ipAddress: null,
        userAgent: null,
      }),
    );

    expect(signed.getPageCount()).toBe(3);
  });
});

describe('winAnsiSafe', () => {
  it('conserva acentos y enie, que si caen en Latin-1', () => {
    expect(winAnsiSafe('Ñoño áéíóú')).toBe('Ñoño áéíóú');
  });

  it('sustituye lo que la fuente estandar no puede codificar', () => {
    // Sin esto, un nombre con caracteres exoticos hace fallar el render entero.
    expect(winAnsiSafe('Zhang 张')).toBe('Zhang ?');
  });

  it('normaliza saltos de linea y descarta caracteres de control', () => {
    expect(winAnsiSafe('linea1\nlinea2')).toBe('linea1 linea2');
    expect(winAnsiSafe('concampana')).toBe('concampana');
  });
});
