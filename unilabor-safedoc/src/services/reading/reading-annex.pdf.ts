import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

// -----------------------------------------------------------------------------
// Hoja de acuse anexa, compartida por los acuses de RH y la sala de lectura de
// Calidad.
//
// Se copian las paginas del documento original SIN tocarlas y se agrega una hoja
// final con la firma autografa y la bitacora de lectura. No se estampa sobre el
// contenido: eso preservaria menos la integridad del documento controlado y
// obligaria a conocer las coordenadas de cada PDF.
// -----------------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.04, 0.13, 0.21);
const MUTED = rgb(0.42, 0.48, 0.54);
const RULE = rgb(0.87, 0.9, 0.93);

/** Texto que sostiene el peso probatorio del acuse. */
export const DEFAULT_READING_DECLARATION =
  'Declaro que recibí, consulté en su totalidad y comprendí el documento que antecede, ' +
  'y que manifiesto mi conformidad con su contenido. Firmo de manera autógrafa para constancia.';

export interface ReadingAnnexInput {
  sourcePdf: Buffer;
  signaturePng: Buffer;
  documentTitle: string;
  /** Como se identifica el documento en la constancia (varia por modulo). */
  identifierLabel: string;
  identifierValue: string;
  /** Como se nombra a quien firma (colaborador, lector...). */
  signerLabel: string;
  signerName: string;
  signerCode: string | null;
  declaration?: string;
  sourceSha256: string;
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
 * Las fuentes estandar de PDF usan WinAnsi, que no codifica nada fuera de
 * Latin-1: un nombre con caracteres exoticos haria fallar el render completo.
 * Los acentos y la enie caen dentro del rango y se conservan; la puntuacion
 * tipografica comun (rayas, comillas, elipsis) se transcribe a su ASCII en
 * vez de degradar a '?'.
 */
const TYPOGRAPHIC_FALLBACKS: Record<number, string> = {
  0x2013: '-', // en dash
  0x2014: '-', // em dash
  0x2018: "'",
  0x2019: "'",
  0x201c: '"',
  0x201d: '"',
  0x2022: '·',
  0x2026: '...',
};

export const winAnsiSafe = (value: string): string =>
  Array.from(value)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 9 || code === 10 || code === 13) {
        return ' ';
      }
      if (code < 32) {
        return '';
      }
      if (code <= 255) {
        return char;
      }
      return TYPOGRAPHIC_FALLBACKS[code] ?? '?';
    })
    .join('');

const formatStamp = (value: Date | null): string =>
  value
    ? value.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : 'No registrado';

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
};

/** Parte el texto en lineas que caben en `maxWidth`. */
const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
};

interface Cursor {
  y: number;
}

const drawLabelValue = (
  page: PDFPage,
  cursor: Cursor,
  label: string,
  value: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): void => {
  const contentWidth = A4[0] - MARGIN * 2;
  page.drawText(winAnsiSafe(label), {
    x: MARGIN,
    y: cursor.y,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  const lines = wrapText(winAnsiSafe(value), fonts.regular, 10, contentWidth);
  let y = cursor.y - 12;
  for (const line of lines) {
    page.drawText(line, { x: MARGIN, y, size: 10, font: fonts.regular, color: INK });
    y -= 13;
  }
  cursor.y = y - 6;
};

/**
 * Devuelve el PDF original con una hoja de acuse anexa al final.
 */
export const buildReadingAnnexPdf = async (input: ReadingAnnexInput): Promise<Buffer> => {
  const source = await PDFDocument.load(input.sourcePdf, { ignoreEncryption: true });
  const output = await PDFDocument.create();

  // Las paginas originales se copian intactas.
  const copied = await output.copyPages(source, source.getPageIndices());
  copied.forEach((page) => output.addPage(page));

  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const page = output.addPage(A4);
  const contentWidth = A4[0] - MARGIN * 2;
  const cursor: Cursor = { y: A4[1] - MARGIN };

  page.drawText('CONSTANCIA DE LECTURA Y CONFORMIDAD', {
    x: MARGIN,
    y: cursor.y,
    size: 14,
    font: bold,
    color: INK,
  });
  cursor.y -= 18;
  page.drawText('Hoja anexa. El documento que antecede se conserva sin modificación.', {
    x: MARGIN,
    y: cursor.y,
    size: 8.5,
    font: regular,
    color: MUTED,
  });
  cursor.y -= 16;
  page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + contentWidth, y: cursor.y },
    thickness: 1,
    color: RULE,
  });
  cursor.y -= 22;

  drawLabelValue(page, cursor, 'DOCUMENTO', input.documentTitle, fonts);
  drawLabelValue(page, cursor, input.identifierLabel, input.identifierValue, fonts);
  drawLabelValue(page, cursor, 'HUELLA SHA-256 DEL DOCUMENTO LEÍDO', input.sourceSha256, fonts);
  drawLabelValue(
    page,
    cursor,
    input.signerLabel,
    input.signerCode ? `${input.signerName} (${input.signerCode})` : input.signerName,
    fonts,
  );

  cursor.y -= 4;
  const declaration = input.declaration ?? DEFAULT_READING_DECLARATION;
  page.drawText('DECLARACIÓN', { x: MARGIN, y: cursor.y, size: 8, font: bold, color: MUTED });
  cursor.y -= 13;
  for (const line of wrapText(winAnsiSafe(declaration), regular, 9.5, contentWidth)) {
    page.drawText(line, { x: MARGIN, y: cursor.y, size: 9.5, font: regular, color: INK });
    cursor.y -= 12.5;
  }

  // Firma autografa.
  cursor.y -= 18;
  const signature = await output.embedPng(input.signaturePng);
  const signatureBox = { width: 210, height: 62 };
  const scaled = signature.scaleToFit(signatureBox.width, signatureBox.height);
  page.drawImage(signature, {
    x: MARGIN + (signatureBox.width - scaled.width) / 2,
    y: cursor.y - scaled.height,
    width: scaled.width,
    height: scaled.height,
  });
  cursor.y -= signatureBox.height + 6;
  page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + signatureBox.width, y: cursor.y },
    thickness: 1,
    color: INK,
  });
  cursor.y -= 13;
  page.drawText(winAnsiSafe(input.signerName), {
    x: MARGIN,
    y: cursor.y,
    size: 9,
    font: bold,
    color: INK,
  });
  cursor.y -= 12;
  page.drawText(`Firmado el ${formatStamp(input.signedAt)}`, {
    x: MARGIN,
    y: cursor.y,
    size: 8,
    font: regular,
    color: MUTED,
  });

  // Bitacora de lectura: es la evidencia que sostiene la declaracion.
  cursor.y -= 28;
  page.drawText('BITÁCORA DE LECTURA', { x: MARGIN, y: cursor.y, size: 8, font: bold, color: MUTED });
  cursor.y -= 6;
  page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + contentWidth, y: cursor.y },
    thickness: 0.5,
    color: RULE,
  });
  cursor.y -= 14;

  const log: Array<[string, string]> = [
    ['Páginas recorridas', `${input.pagesSeenCount} de ${input.pagesTotal}`],
    ['Permanencia mínima exigida por página', `${input.minSecondsPerPage} s`],
    ['Tiempo activo acumulado', formatDuration(input.activeSeconds)],
    ['Inicio de lectura', formatStamp(input.startedAt)],
    ['Lectura completada', formatStamp(input.readCompletedAt)],
    ['Dirección IP', input.ipAddress ?? 'No registrada'],
    ['Navegador', input.userAgent ?? 'No registrado'],
  ];

  for (const [label, value] of log) {
    page.drawText(winAnsiSafe(label), { x: MARGIN, y: cursor.y, size: 8.5, font: regular, color: MUTED });
    const lines = wrapText(winAnsiSafe(value), regular, 8.5, contentWidth - 210);
    let y = cursor.y;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 210, y, size: 8.5, font: regular, color: INK });
      y -= 11;
    }
    cursor.y = Math.min(cursor.y - 14, y - 3);
  }

  page.drawText(
    'El tiempo de lectura fue medido por el servidor mientras la ventana estuvo activa.',
    { x: MARGIN, y: MARGIN - 12, size: 7, font: regular, color: MUTED },
  );

  return Buffer.from(await output.save());
};

/**
 * Extrae SOLO la hoja de constancia (la ultima pagina) de una copia firmada
 * generada por `buildReadingAnnexPdf`.
 *
 * La copia firmada completa (documento + hoja anexa) es evidencia del modulo
 * que la custodia (Calidad/RH). Al lector solo se le entrega esta hoja: el
 * documento es controlado y no debe salir del visor protegido en ningun formato
 * descargable. La hoja ya identifica al documento por titulo, identificador y
 * huella SHA-256, asi que conserva su valor probatorio sin exponer contenido.
 */
export const extractReadingAnnexPage = async (signedPdf: Buffer): Promise<Buffer> => {
  const source = await PDFDocument.load(signedPdf, { ignoreEncryption: true });
  const lastIndex = source.getPageCount() - 1;
  if (lastIndex < 0) {
    throw new Error('La copia firmada no tiene paginas.');
  }

  const output = await PDFDocument.create();
  const [annex] = await output.copyPages(source, [lastIndex]);
  output.addPage(annex);
  return Buffer.from(await output.save());
};
