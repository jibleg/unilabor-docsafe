import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import type { AssignmentLetterRecord } from './rh-assignment-letter.service';
import { DIRECTOR_GENERAL_TITLE } from './rh-competency-signers.service';

/**
 * PDF de la Carta de asignacion de puesto REH-REG-008 (rev. 1) con el diseno
 * del formato controlado: encabezado con logo y cuadro codigo / vigencia /
 * revision, datos del colaborador en tabla azul, textos de compromiso, tabla de
 * 82 autorizaciones (No. | Autorizaciones | Si | No), firmas del colaborador,
 * la Coordinacion del area y el Director General, y la condicion de
 * autorizacion. Carta vertical.
 */

const LETTER: [number, number] = [612, 792];
const PAGE_W = LETTER[0];
const PAGE_H = LETTER[1];
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = MARGIN + 26;

const NAVY = rgb(0.098, 0.208, 0.373); // azul del formato
const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.478, 0.525);
const RULE = rgb(0.2, 0.2, 0.2);
const WHITE = rgb(1, 1, 1);
const NOTE_FILL = rgb(1, 0.937, 0.773);
const NOTE_BORDER = rgb(0.85, 0.65, 0.2);

const FORM_META: Record<number, { valid_from: string; revision_label: string }> = {
  1: { valid_from: '24/07/2026', revision_label: '1 (Uno)' },
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const COMMITMENTS = [
  'Desempeñar las funciones y responsabilidades de su puesto conforme a los procedimientos vigentes, al Sistema de Gestión de la Calidad y a las disposiciones institucionales aplicables.',
  'Actuar con ética, imparcialidad, confidencialidad y respeto a la seguridad del paciente.',
  'Consultar y utilizar únicamente la información necesaria para el cumplimiento de sus funciones.',
  'No divulgar, reproducir, modificar, extraer, destruir o compartir información institucional o de pacientes sin autorización.',
  'Mantener bajo resguardo sus claves de acceso y evitar que sean utilizadas por otras personas.',
  'Informar de manera inmediata cualquier pérdida, divulgación, alteración o acceso no autorizado a la información.',
  'Devolver los documentos, registros, equipos y demás información que se encuentren bajo su resguardo cuando cambie de puesto o concluya su relación laboral.',
  'Mantener la confidencialidad de la información aun después de finalizar su relación laboral con la organización.',
];

const PARAGRAPHS = [
  'Las funciones, responsabilidades y autoridades correspondientes al puesto que se encuentran establecidas en la Descripción de Puesto vigente, incluida en el Manual de Organización REH-MAN-001. Mediante la firma de esta carta, el colaborador confirma que recibió, leyó y comprendió dicho documento, y se compromete a cumplir sus disposiciones.',
  'De acuerdo con las necesidades del puesto, UNILABOR® podrá otorgarles acceso a equipos, analizadores, materiales, computadoras, sistemas informáticos, Sistema de Información del Laboratorio (LIS), aplicaciones y documentación. Estos recursos deberán utilizarse exclusivamente para fines laborales, dentro de las funciones asignadas y conforme a los permisos y autorizaciones vigentes.',
  'Durante el desempeño de sus actividades, el colaborador podrá tener acceso a datos personales, información de pacientes, procedimientos, resultados de análisis, documentos, registros, estrategias institucionales y demás información propiedad de UNILABOR® Unidad de Laboratorio Clínico y Biología Molecular y Sucursales. Esta información deberá protegerse, independientemente de que se encuentre en medios impresos, electrónicos o verbales.',
];

const NONCOMPLIANCE =
  'El incumplimiento de estas disposiciones será atendido conforme al Reglamento Interno de Trabajo, las políticas institucionales y las disposiciones legales aplicables.';

const CONDITION =
  'la presente asignación no autoriza automáticamente la ejecución independiente de todas las actividades relacionadas con el puesto. El colaborador únicamente podrá realizar aquellas actividades para las que haya recibido inducción, capacitación, evaluación de competencia y autorización documentada, cuando corresponda. Las actividades para las cuales todavía no se haya demostrado la competencia o emitido la autorización correspondiente deberán realizarse bajo supervisión directa.';

export interface AssignmentLetterPdfInput {
  letter: AssignmentLetterRecord;
  draft: boolean;
  /** Borrador enviado al Buzon de firmas: lleva las firmas ya recabadas. */
  inSignature?: boolean;
  signatures: { collaborator: Buffer | null; area: Buffer | null; director: Buffer | null };
}

type Rgb = ReturnType<typeof rgb>;

const resolveLogo = (): Buffer | null => {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'unilabor-logo.png'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? fs.readFileSync(found) : null;
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
};

const longDate = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${Number(match[3])} de ${MONTHS[Number(match[2]) - 1]} de ${match[1]}`;
};
const shortDate = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return match ? `${match[3]} / ${match[2]} / ${match[1]}` : isoDate;
};

export const buildAssignmentLetterPdf = async (input: AssignmentLetterPdfInput): Promise<Buffer> => {
  const { letter } = input;
  const meta = FORM_META[letter.form_revision] ?? FORM_META[1]!;
  const doc = await PDFDocument.create();
  doc.setTitle(`REH-REG-008 ${letter.folio} - ${letter.employee_name}`);
  doc.setAuthor('UNILABOR · SafeDoc');
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const logoBytes = resolveLogo();
  const logo: PDFImage | null = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;
  const embed = async (buffer: Buffer | null) => (buffer ? doc.embedPng(buffer).catch(() => null) : null);
  const images = {
    collaborator: await embed(input.signatures.collaborator),
    area: await embed(input.signatures.area),
    director: await embed(input.signatures.director),
  };

  const safe = (value: string): string => winAnsiSafe(value);
  const width = (value: string, font: PDFFont, size: number): number => font.widthOfTextAtSize(safe(value), size);
  let page: PDFPage = doc.addPage(LETTER);
  let y = PAGE_H - MARGIN;
  const text = (value: string, x: number, yy: number, size: number, font: PDFFont, color: Rgb = INK) =>
    page.drawText(safe(value), { x, y: yy, size, font, color });
  const centered = (value: string, cx: number, yy: number, size: number, font: PDFFont, color: Rgb = INK) =>
    text(value, cx - width(value, font, size) / 2, yy, size, font, color);
  const rect = (x: number, yy: number, w: number, h: number, options: { fill?: Rgb; border?: Rgb; borderWidth?: number } = {}) =>
    page.drawRectangle({
      x,
      y: yy,
      width: w,
      height: h,
      ...(options.fill ? { color: options.fill } : {}),
      ...(options.border ? { borderColor: options.border, borderWidth: options.borderWidth ?? 0.6 } : {}),
    });
  const vline = (x: number, top: number, h: number) => page.drawLine({ start: { x, y: top }, end: { x, y: top - h }, thickness: 0.6, color: RULE });
  /** Parrafo justificado a la izquierda; devuelve el alto usado. */
  const paragraph = (value: string, x: number, maxW: number, size = 10, lead = 13.2) => {
    const lines = wrapText(safe(value), regular, size, maxW);
    ensure(lines.length * lead + 4);
    lines.forEach((line, index) => text(line, x, y - index * lead, size, regular));
    y -= lines.length * lead + 6;
  };

  const drawHeader = () => {
    const top = PAGE_H - MARGIN;
    const h = 52;
    const logoW = 130;
    const rightW = 200;
    const labelW = 112;
    rect(MARGIN, top - h, CONTENT_W, h, { border: RULE, borderWidth: 0.7 });
    vline(MARGIN + logoW, top, h);
    vline(PAGE_W - MARGIN - rightW, top, h);
    if (logo) {
      const scaled = logo.scaleToFit(logoW - 18, h - 14);
      page.drawImage(logo, { x: MARGIN + (logoW - scaled.width) / 2, y: top - h + (h - scaled.height) / 2, width: scaled.width, height: scaled.height });
    } else centered('UNILABOR', MARGIN + logoW / 2, top - h / 2 - 4, 12, bold, NAVY);
    const titleCx = MARGIN + logoW + (CONTENT_W - logoW - rightW) / 2;
    centered('CARTA DE ASIGNACIÓN DE', titleCx, top - 22, 12, bold);
    centered('PUESTO', titleCx, top - 38, 12, bold);
    const rows: Array<[string, string]> = [
      ['Código:', letter.form_code],
      ['Vigente a partir de:', meta.valid_from],
      ['No. de revisión:', meta.revision_label],
    ];
    const rowH = h / 3;
    rows.forEach(([label, value], index) => {
      const ry = top - rowH * (index + 1);
      if (index > 0) page.drawLine({ start: { x: PAGE_W - MARGIN - rightW, y: ry + rowH }, end: { x: PAGE_W - MARGIN, y: ry + rowH }, thickness: 0.6, color: RULE });
      vline(PAGE_W - MARGIN - rightW + labelW, ry + rowH, rowH);
      centered(label, PAGE_W - MARGIN - rightW + labelW / 2, ry + 5.5, 7.5, regular);
      centered(value, PAGE_W - MARGIN - rightW + labelW + (rightW - labelW) / 2, ry + 5.5, 7.5, regular);
    });
    y = top - h - 16;
  };
  const newPage = () => {
    page = doc.addPage(LETTER);
    drawHeader();
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };

  drawHeader();

  // Lugar y fecha, titulo y datos.
  const place = `Villahermosa, Tabasco a ${longDate(letter.letter_date)}.`;
  text(place, PAGE_W - MARGIN - width(place, regular, 10.5), y, 10.5, regular);
  y -= 18;
  centered('CARTA DE ASIGNACIÓN DE PUESTO', PAGE_W / 2, y, 11, bold);
  y -= 30;
  text('Por medio de la presente, se formaliza la asignación de:', MARGIN, y, 10.5, regular);
  y -= 10;
  const dataRows: Array<[string, string]> = [
    ['Nombre del colaborador:', letter.employee_name],
    ['Área:', letter.area_name ?? ''],
    ['Puesto:', `${letter.position_code} · ${letter.position_name}`],
    ['Nombre de la descripción de Puesto:', letter.position_description_name ?? letter.position_name],
  ];
  const labelColW = 210;
  for (const [label, value] of dataRows) {
    const h = 20;
    rect(MARGIN, y - h, labelColW, h, { fill: NAVY, border: RULE });
    rect(MARGIN + labelColW, y - h, CONTENT_W - labelColW, h, { border: RULE });
    text(label, MARGIN + 5, y - 13.5, 9, regular, WHITE);
    text(wrapText(safe(value), regular, 9.5, CONTENT_W - labelColW - 10)[0] ?? '', MARGIN + labelColW + 6, y - 13.5, 9.5, regular);
    y -= h;
  }
  y -= 16;
  for (const value of PARAGRAPHS) paragraph(value, MARGIN, CONTENT_W);
  paragraph('El colaborador se compromete a:', MARGIN, CONTENT_W);
  for (const commitment of COMMITMENTS) {
    const lines = wrapText(safe(commitment), regular, 10, CONTENT_W - 66);
    ensure(lines.length * 13.2 + 4);
    page.drawCircle({ x: MARGIN + 46, y: y + 3, size: 1.8, color: INK });
    lines.forEach((line, index) => text(line, MARGIN + 56, y - index * 13.2, 10, regular));
    y -= lines.length * 13.2 + 5;
  }
  paragraph(NONCOMPLIANCE, MARGIN, CONTENT_W);

  // Tabla de autorizaciones.
  const tableX = MARGIN + 20;
  const tableW = CONTENT_W - 40;
  const colNo = 26;
  const colYes = 40;
  const colNoMark = 40;
  const colText = tableW - colNo - colYes - colNoMark;
  const drawTableHead = () => {
    const h = 16;
    rect(tableX, y - h, tableW, h, { fill: NAVY, border: RULE });
    centered('No.', tableX + colNo / 2, y - 11.5, 9.5, bold, WHITE);
    centered('Autorizaciones', tableX + colNo + colText / 2, y - 11.5, 9.5, bold, WHITE);
    centered('Sí', tableX + colNo + colText + colYes / 2, y - 11.5, 9.5, bold, WHITE);
    centered('No', tableX + colNo + colText + colYes + colNoMark / 2, y - 11.5, 9.5, bold, WHITE);
    y -= h;
  };
  ensure(16 + 15 * 3);
  drawTableHead();
  for (const item of letter.items) {
    const label = item.item_no === 82 && letter.other_authorizations ? `Otras: ${letter.other_authorizations}` : item.item_text;
    const lines = wrapText(safe(label), regular, 9.5, colText - 8);
    const h = Math.max(14.5, lines.length * 11 + 4);
    if (y - h < BOTTOM) {
      newPage();
      drawTableHead();
    }
    rect(tableX, y - h, tableW, h, { border: RULE });
    vline(tableX + colNo, y, h);
    vline(tableX + colNo + colText, y, h);
    vline(tableX + colNo + colText + colYes, y, h);
    centered(String(item.item_no), tableX + colNo / 2, y - 10.5, 9, regular);
    lines.forEach((line, index) => text(line, tableX + colNo + 4, y - 10.5 - index * 11, 9.5, regular));
    // La nota "a todos" del formato es solo una guia de llenado: no se imprime en el registro.
    const markX = item.authorized ? tableX + colNo + colText + colYes / 2 : tableX + colNo + colText + colYes + colNoMark / 2;
    centered('X', markX, y - 10.5, 9.5, bold, NAVY);
    y -= h;
  }
  y -= 24;

  // Firmas.
  const signH = 110;
  ensure(signH + 70);
  const colW = CONTENT_W / 3;
  const director = letter.director_signatory_name ? `${DIRECTOR_GENERAL_TITLE} ${letter.director_signatory_name}` : '';
  const columns: Array<{ role: string; name: string; image: PDFImage | null }> = [
    { role: 'COLABORADOR', name: letter.employee_name, image: images.collaborator },
    { role: 'COORDINACIÓN DEL ÁREA', name: letter.area_signatory_name, image: images.area },
    { role: 'DIRECTOR GENERAL', name: director, image: images.director },
  ];
  const signedDate = letter.closed_at ? shortDate(letter.closed_at.slice(0, 10)) : '____ / ____ / ______';
  rect(MARGIN, y - 16, CONTENT_W, 16, { fill: NAVY, border: RULE });
  columns.forEach((column, index) => centered(column.role, MARGIN + colW * index + colW / 2, y - 11, 7.5, bold, WHITE));
  y -= 16;
  rect(MARGIN, y - signH + 22, CONTENT_W, signH - 22, { border: RULE });
  rect(MARGIN, y - signH, CONTENT_W, 22, { border: RULE });
  columns.forEach((column, index) => {
    const x = MARGIN + colW * index;
    if (index > 0) vline(x, y, signH);
    if (column.image) {
      const scaled = column.image.scaleToFit(colW - 40, 40);
      page.drawImage(column.image, { x: x + (colW - scaled.width) / 2, y: y - 50, width: scaled.width, height: scaled.height });
    }
    const nameLine = wrapText(safe(column.name || ''), regular, 8.5, colW - 12)[0] ?? '';
    if (nameLine) centered(nameLine, x + colW / 2, y - 62, 8.5, bold);
    centered('Nombre y firma', x + colW / 2, y - 76, 8.5, regular);
    centered(`Fecha: ${signedDate}`, x + colW / 2, y - signH + 8, 8.5, regular);
  });
  y -= signH + 16;

  // Condicion de autorizacion.
  const conditionLines = wrapText(safe(`Condición de autorización:  ${CONDITION}`), regular, 7.5, CONTENT_W - 10);
  const conditionH = conditionLines.length * 9 + 8;
  ensure(conditionH + 4);
  rect(MARGIN, y - conditionH, CONTENT_W, conditionH, { fill: NOTE_FILL, border: NOTE_BORDER });
  conditionLines.forEach((line, index) => {
    if (index === 0) {
      const head = 'Condición de autorización:';
      text(head, MARGIN + 5, y - 10 - index * 9, 7.5, bold, NAVY);
      text(line.slice(head.length), MARGIN + 5 + width(head, bold, 7.5), y - 10, 7.5, regular);
    } else text(line, MARGIN + 5, y - 10 - index * 9, 7.5, regular);
  });
  y -= conditionH;

  // Pie: pagina y folio SafeDoc (fuera del cuerpo controlado).
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    const label = `P á g i n a  ${index + 1} | ${pages.length}`;
    p.drawText(safe(label), { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(safe(label), 8.5), y: MARGIN - 6, size: 8.5, font: regular, color: INK });
    const draftNote = input.inSignature ? ' · EN FIRMA (vista previa, sin validez hasta reunir las firmas)' : ' · BORRADOR (sin firmas)';
    p.drawText(safe(`SafeDoc · ${letter.folio}${input.draft ? draftNote : ''}`), { x: MARGIN, y: MARGIN - 6, size: 6.5, font: sans, color: MUTED });
    if (input.draft) p.drawText(input.inSignature ? 'EN FIRMA' : 'BORRADOR', { x: 150, y: 260, size: 90, font: bold, color: rgb(0.75, 0.75, 0.75), opacity: 0.18, rotate: degrees(35) });
  });
  return Buffer.from(await doc.save());
};
