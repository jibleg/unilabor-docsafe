import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import { SUPERVISION_CONCLUSION_LABELS } from './rh-supervision-checklist.rules';
import type { SupervisionChecklistRecord, SupervisionChecklistSection } from './rh-supervision-checklist.service';

/**
 * PDF de la Lista de verificacion de Supervision ANA-REG-060 con el diseno del
 * formato controlado (encabezado con logo, titulo y cuadro codigo / vigencia /
 * revision; bandas azules por seccion; tabla Aspecto | SI | NO | N/A |
 * Observaciones; resultado; conclusion; pregunta SGC; comentarios y firmas),
 * mas una banda de identificacion de SafeDoc FUERA del cuerpo controlado
 * (colaborador, puesto, sucursal, folio e inscripcion de la Fase 6). Carta.
 */

const LETTER: [number, number] = [612, 792];
const PAGE_W = LETTER[0];
const PAGE_H = LETTER[1];
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 26;
const BOTTOM = MARGIN + FOOTER_H;

const NAVY = rgb(0, 0.255, 0.416); // #00416A
const BRAND_500 = rgb(0, 0.412, 0.651);
const BRAND_100 = rgb(0.859, 0.91, 0.949);
const BRAND_50 = rgb(0.933, 0.961, 0.98);
const INK = rgb(0.09, 0.188, 0.278);
const MUTED = rgb(0.42, 0.478, 0.525);
const RULE = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const GRAY_SOFT = rgb(0.96, 0.96, 0.96);

/** Datos de control del formato por revision (encabezado del documento controlado). */
const FORM_META: Record<number, { valid_from: string; revision_label: string }> = {
  1: { valid_from: '06/06/2026', revision_label: '1 (Uno)' },
};

// Columnas de la tabla de items (suman CONTENT_W = 532).
const COL_ASPECT = 262;
const COL_YES = 48;
const COL_NO = 48;
const COL_NA = 40;
const COL_OBS = CONTENT_W - COL_ASPECT - COL_YES - COL_NO - COL_NA;

export interface SupervisionChecklistPdfInput {
  record: SupervisionChecklistRecord;
  /** Borrador: sin firmas y con marca de agua. */
  draft: boolean;
  generatedAt: Date;
  signatures: { supervisor: Buffer | null; areaResponsible: Buffer | null; employee: Buffer | null };
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
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
};

const formatDateOnly = (value: string | null): string => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const formatStamp = (date: Date): string =>
  date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

export const buildSupervisionChecklistPdf = async (input: SupervisionChecklistPdfInput): Promise<Buffer> => {
  const { record } = input;
  const meta = FORM_META[record.form_revision] ?? FORM_META[1]!;
  const doc = await PDFDocument.create();
  doc.setTitle(`${record.form_code} ${record.folio} - ${record.employee_name}`);
  doc.setAuthor('UNILABOR · SafeDoc');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = resolveLogo();
  const logo: PDFImage | null = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;
  const embedSignature = async (buffer: Buffer | null): Promise<PDFImage | null> =>
    buffer ? doc.embedPng(buffer).catch(() => null) : null;
  const signatureImages = {
    supervisor: await embedSignature(input.signatures.supervisor),
    areaResponsible: await embedSignature(input.signatures.areaResponsible),
    employee: await embedSignature(input.signatures.employee),
  };

  const safe = (value: string): string => winAnsiSafe(value);
  const width = (value: string, font: PDFFont, size: number): number => font.widthOfTextAtSize(safe(value), size);

  let page: PDFPage = doc.addPage(LETTER);
  let y = PAGE_H - MARGIN;

  const text = (value: string, x: number, yy: number, size: number, font: PDFFont, color: Rgb = INK) => {
    page.drawText(safe(value), { x, y: yy, size, font, color });
  };
  const centered = (value: string, cx: number, yy: number, size: number, font: PDFFont, color: Rgb = INK) => {
    text(value, cx - width(value, font, size) / 2, yy, size, font, color);
  };
  const rect = (x: number, yy: number, w: number, h: number, options: { fill?: Rgb; border?: Rgb; borderWidth?: number } = {}) => {
    page.drawRectangle({
      x,
      y: yy,
      width: w,
      height: h,
      ...(options.fill ? { color: options.fill } : {}),
      ...(options.border ? { borderColor: options.border, borderWidth: options.borderWidth ?? 0.6 } : {}),
    });
  };
  const checkbox = (cx: number, cy: number, checked: boolean) => {
    const s = 8;
    rect(cx - s / 2, cy - s / 2, s, s, { border: INK, borderWidth: 0.7 });
    if (checked) {
      page.drawLine({ start: { x: cx - 3, y: cy - 3 }, end: { x: cx + 3, y: cy + 3 }, thickness: 1.3, color: NAVY });
      page.drawLine({ start: { x: cx - 3, y: cy + 3 }, end: { x: cx + 3, y: cy - 3 }, thickness: 1.3, color: NAVY });
    }
  };

  // ------------------------------------------------------------ encabezado
  const drawHeader = () => {
    const top = PAGE_H - MARGIN;
    const h = 56;
    const logoW = 122;
    const rightW = 158;
    const labelW = 86;
    rect(MARGIN, top - h, CONTENT_W, h, { border: RULE, borderWidth: 0.8 });
    page.drawLine({ start: { x: MARGIN + logoW, y: top }, end: { x: MARGIN + logoW, y: top - h }, thickness: 0.8, color: RULE });
    page.drawLine({ start: { x: PAGE_W - MARGIN - rightW, y: top }, end: { x: PAGE_W - MARGIN - rightW, y: top - h }, thickness: 0.8, color: RULE });
    if (logo) {
      const scaled = logo.scaleToFit(logoW - 16, h - 14);
      page.drawImage(logo, { x: MARGIN + (logoW - scaled.width) / 2, y: top - h + (h - scaled.height) / 2, width: scaled.width, height: scaled.height });
    } else {
      centered('UNILABOR', MARGIN + logoW / 2, top - h / 2 - 4, 12, bold, NAVY);
    }
    const titleCx = MARGIN + logoW + (CONTENT_W - logoW - rightW) / 2;
    centered('LISTA DE VERIFICACIÓN', titleCx, top - 24, 11.5, bold);
    centered('PARA SUPERVISIÓN', titleCx, top - 40, 11.5, bold);
    const rows: Array<[string, string]> = [
      ['Código:', record.form_code],
      ['Vigente a partir de:', meta.valid_from],
      ['No. de revisión:', meta.revision_label],
    ];
    const rowH = h / 3;
    rows.forEach(([label, value], index) => {
      const ry = top - rowH * (index + 1);
      if (index > 0) {
        page.drawLine({ start: { x: PAGE_W - MARGIN - rightW, y: ry + rowH }, end: { x: PAGE_W - MARGIN, y: ry + rowH }, thickness: 0.6, color: RULE });
      }
      page.drawLine({ start: { x: PAGE_W - MARGIN - rightW + labelW, y: ry }, end: { x: PAGE_W - MARGIN - rightW + labelW, y: ry + rowH }, thickness: 0.6, color: RULE });
      text(label, PAGE_W - MARGIN - rightW + 4, ry + 6, 6.5, regular);
      centered(value, PAGE_W - MARGIN - rightW + labelW + (rightW - labelW) / 2, ry + 6, 6.5, regular);
    });
    y = top - h - 10;
  };

  const drawFooters = () => {
    const pages = doc.getPages();
    pages.forEach((p, index) => {
      const footerLeft = `${record.form_code} · Rev. ${record.form_revision} · Folio ${record.folio}${input.draft ? ' · BORRADOR (sin firmas)' : ''}`;
      p.drawText(safe(footerLeft), { x: MARGIN, y: MARGIN - 4, size: 6.5, font: regular, color: MUTED });
      const label = `Página ${index + 1} de ${pages.length}`;
      p.drawText(safe(label), { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(safe(label), 7), y: MARGIN - 4, size: 7, font: regular, color: INK });
      if (input.draft) {
        p.drawText('BORRADOR', { x: 150, y: 260, size: 90, font: bold, color: rgb(0.75, 0.75, 0.75), opacity: 0.18, rotate: degrees(35) });
      }
    });
  };

  const newPage = () => {
    page = doc.addPage(LETTER);
    drawHeader();
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) {
      newPage();
    }
  };

  drawHeader();

  // ------------------------------------------- banda de identificacion SafeDoc
  {
    const h = 30;
    rect(MARGIN, y - h, CONTENT_W, h, { fill: BRAND_50, border: BRAND_100, borderWidth: 0.6 });
    rect(MARGIN, y - h, 4, h, { fill: BRAND_500 });
    const context = record.enrollment_id
      ? `Programa de Inducción · Fase 6 (capacitación práctica supervisada) · inscripción #${record.enrollment_id}`
      : 'Supervisión de área (ANA-PRC-005)';
    text(`REGISTRO ELECTRÓNICO SAFEDOC · Folio ${record.folio} · ${context}`, MARGIN + 10, y - 11, 7, bold, NAVY);
    const line2 =
      `Colaborador: ${record.employee_name} (${record.employee_code}) · Puesto: ${record.position_code} – ${record.position_name}` +
      `${record.branch_name ? ` · Sucursal: ${record.branch_name}` : ''} · Generado: ${formatStamp(input.generatedAt)}`;
    const l2 = wrapText(safe(line2), regular, 6.8, CONTENT_W - 16)[0] ?? '';
    text(l2, MARGIN + 10, y - 22, 6.8, regular, INK);
    y -= h + 10;
  }

  // ------------------------------------------------------- campos de cabecera
  const field = (label: string, value: string, x: number, w: number, yy: number) => {
    text(label, x, yy, 8, bold);
    const lx = x + width(label, bold, 8) + 6;
    page.drawLine({ start: { x: lx, y: yy - 2.5 }, end: { x: x + w, y: yy - 2.5 }, thickness: 0.6, color: INK });
    const fitted = wrapText(safe(value), regular, 8, x + w - lx - 4)[0] ?? '';
    text(fitted, lx + 2, yy, 8, regular);
  };
  field('Fecha:', formatDateOnly(record.supervision_date), MARGIN, 230, y);
  field('Supervisor / Auditor:', record.supervisor_name, MARGIN + 262, CONTENT_W - 262, y);
  y -= 18;
  field('Área Evaluada:', record.area_name ?? '', MARGIN, CONTENT_W, y);
  y -= 18;
  text('Tipo de Supervisión:', MARGIN, y, 8, regular);
  checkbox(MARGIN + 126, y + 3, record.supervision_type === 'PROGRAMADA');
  text('Programada', MARGIN + 136, y, 8, regular);
  checkbox(MARGIN + 226, y + 3, record.supervision_type === 'NO_PROGRAMADA');
  text('No programada', MARGIN + 236, y, 8, regular);
  y -= 20;

  // ------------------------------------------------------------- secciones
  const drawBand = (title: string) => {
    rect(MARGIN, y - 14, CONTENT_W, 14, { fill: NAVY });
    centered(title, MARGIN + CONTENT_W / 2, y - 10, 7.5, bold, WHITE);
    y -= 18;
  };
  const drawTableHead = () => {
    const h = 30;
    rect(MARGIN, y - h, CONTENT_W, h, { border: RULE });
    let x = MARGIN;
    const cell = (w: number, lines: string[]) => {
      if (x > MARGIN) page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.6, color: RULE });
      const startY = y - h / 2 + (lines.length - 1) * 4.5 - 2.5;
      lines.forEach((line, index) => centered(line, x + w / 2, startY - index * 9, 7.2, bold));
      x += w;
    };
    cell(COL_ASPECT, ['Aspecto a Evaluar']);
    cell(COL_YES, ['Cumple', '(SÍ)']);
    cell(COL_NO, ['No Cumple', '(NO)']);
    cell(COL_NA, ['N/A']);
    cell(COL_OBS, ['Observaciones /', 'Acción Correctiva']);
    y -= h;
  };
  const drawSection = (section: SupervisionChecklistSection) => {
    const bandAndHead = 18 + 30;
    ensure(bandAndHead + 26);
    drawBand(section.section_title);
    drawTableHead();
    for (const item of section.items) {
      const aspectLines = wrapText(safe(`${item.item_no}. ${item.item_text}`), regular, 7.2, COL_ASPECT - 8);
      const obsLines = item.observations ? wrapText(safe(item.observations), regular, 6.6, COL_OBS - 6) : [];
      const h = Math.max(22, aspectLines.length * 8.6 + 8, obsLines.length * 8 + 8);
      if (y - h < BOTTOM) {
        newPage();
        drawBand(`${section.section_title} (continúa)`);
        drawTableHead();
      }
      rect(MARGIN, y - h, CONTENT_W, h, { border: RULE });
      let x = MARGIN;
      const sep = () => page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.6, color: RULE });
      aspectLines.forEach((line, index) => text(line, MARGIN + 4, y - 10 - index * 8.6, 7.2, regular));
      x += COL_ASPECT;
      sep();
      const cy = y - h / 2;
      checkbox(x + COL_YES / 2, cy, item.result === 'SI');
      x += COL_YES;
      sep();
      checkbox(x + COL_NO / 2, cy, item.result === 'NO');
      x += COL_NO;
      sep();
      checkbox(x + COL_NA / 2, cy, item.result === 'NA');
      x += COL_NA;
      sep();
      obsLines.forEach((line, index) => text(line, x + 3, y - 10 - index * 8, 6.6, regular));
      y -= h;
    }
    y -= 10;
  };
  for (const section of record.sections) {
    drawSection(section);
  }

  // -------------------------------------------------------------- resultado
  const summary = record.summary;
  ensure(18 + 4 * 16 + 30);
  drawBand('RESULTADO DE LA SUPERVISIÓN');
  const resultRows: Array<[string, string]> = [
    ['Total de ítems evaluados (excluyendo N/A):', String(summary.evaluated)],
    ['Total de ítems conformes:', String(summary.compliant)],
    ['Total de ítems no conformes:', String(summary.non_compliant)],
    ['Porcentaje de cumplimiento:', summary.compliance_pct === null ? '—' : `${summary.compliance_pct.toFixed(2)} %`],
  ];
  for (const [label, value] of resultRows) {
    const h = 16;
    rect(MARGIN, y - h, CONTENT_W, h, { border: RULE });
    page.drawLine({ start: { x: MARGIN + 300, y }, end: { x: MARGIN + 300, y: y - h }, thickness: 0.6, color: RULE });
    text(label, MARGIN + 4, y - 11, 7.5, bold);
    text(value, MARGIN + 306, y - 11, 7.5, regular);
    y -= h;
  }
  y -= 6;
  ensure(40);
  rect(MARGIN, y - 30, CONTENT_W, 30, { fill: GRAY_SOFT, border: RULE });
  centered('CONCLUSIÓN DE LA SUPERVISIÓN', MARGIN + CONTENT_W / 2, y - 11, 7.5, bold);
  const conclusions: Array<[keyof typeof SUPERVISION_CONCLUSION_LABELS, number]> = [
    ['CONFORME', MARGIN + 60],
    ['CONFORME_CON_OBSERVACIONES', MARGIN + 200],
    ['REQUIERE_SEGUIMIENTO', MARGIN + 390],
  ];
  for (const [key, x] of conclusions) {
    checkbox(x, y - 22, summary.conclusion === key);
    text(SUPERVISION_CONCLUSION_LABELS[key], x + 8, y - 25, 7.5, regular);
  }
  y -= 40;

  // ------------------------------------------------------------- pregunta SGC
  const question =
    '¿Se identificó alguna situación que requiera la gestión de Trabajo No Conforme, No Conformidad, Acción Correctiva o seguimiento adicional conforme al Sistema de Gestión de la Calidad?';
  const qLines = wrapText(safe(question), regular, 7.5, CONTENT_W);
  ensure(qLines.length * 9 + 60);
  qLines.forEach((line, index) => text(line, MARGIN, y - index * 9, 7.5, regular));
  y -= qLines.length * 9 + 2;
  checkbox(MARGIN + 160, y + 3, record.sgc_follow_up_required);
  text('Sí', MARGIN + 170, y, 8, regular);
  checkbox(MARGIN + 220, y + 3, !record.sgc_follow_up_required);
  text('No', MARGIN + 230, y, 8, regular);
  y -= 16;
  text('En caso afirmativo, indicar referencia o descripción:', MARGIN, y, 7.5, regular);
  y -= 6;
  const refLines = record.sgc_reference ? wrapText(safe(record.sgc_reference), regular, 7.5, CONTENT_W - 8) : [];
  const refH = Math.max(34, refLines.length * 9 + 10);
  ensure(refH + 4);
  rect(MARGIN, y - refH, CONTENT_W, refH, { border: RULE });
  refLines.forEach((line, index) => text(line, MARGIN + 4, y - 11 - index * 9, 7.5, regular));
  y -= refH + 10;

  ensure(70);
  text('Comentarios del supervisor:', MARGIN, y, 7.5, regular);
  y -= 6;
  const commentLines = record.supervisor_comments ? wrapText(safe(record.supervisor_comments), regular, 7.5, CONTENT_W - 8) : [];
  const commentH = Math.max(48, commentLines.length * 9 + 10);
  ensure(commentH + 4);
  rect(MARGIN, y - commentH, CONTENT_W, commentH, { border: RULE });
  commentLines.forEach((line, index) => text(line, MARGIN + 4, y - 11 - index * 9, 7.5, regular));
  y -= commentH + 14;

  // ------------------------------------------------------------------ firmas
  const columns: Array<{ role: string; name: string; image: PDFImage | null }> = [
    { role: 'Supervisor / Auditor', name: record.supervisor_name, image: signatureImages.supervisor },
    { role: 'Responsable del Área', name: record.area_responsible_name, image: signatureImages.areaResponsible },
  ];
  if (signatureImages.employee) {
    columns.push({ role: 'Colaborador supervisado', name: record.employee_name, image: signatureImages.employee });
  }
  const sigH = 86;
  ensure(sigH + 16);
  const gap = 18;
  const colW = (CONTENT_W - gap * (columns.length - 1)) / columns.length;
  columns.forEach((column, index) => {
    const x = MARGIN + index * (colW + gap);
    centered(column.role, x + colW / 2, y - 10, 7.5, bold);
    if (column.image) {
      const scaled = column.image.scaleToFit(colW - 24, 40);
      page.drawImage(column.image, { x: x + (colW - scaled.width) / 2, y: y - 58, width: scaled.width, height: scaled.height });
    }
    page.drawLine({ start: { x: x + 8, y: y - 62 }, end: { x: x + colW - 8, y: y - 62 }, thickness: 0.7, color: INK });
    text('Nombre:', x + 8, y - 72, 7, bold);
    const nameLine = wrapText(safe(column.name || '—'), regular, 7, colW - 50)[0] ?? '';
    text(nameLine, x + 42, y - 72, 7, regular);
    text('Firma:', x + 8, y - 82, 7, bold);
    text(column.image ? 'firma digital registrada en SafeDoc' : input.draft ? 'pendiente' : '—', x + 36, y - 82, 7, regular, MUTED);
  });
  y -= sigH;

  if (!input.draft && record.closed_at) {
    ensure(14);
    text(
      `Cerrada y firmada electrónicamente el ${formatStamp(new Date(record.closed_at))}. Conservar conforme al procedimiento de gestión de registros.`,
      MARGIN,
      y - 4,
      6.5,
      regular,
      MUTED,
    );
  }

  drawFooters();
  return Buffer.from(await doc.save());
};
