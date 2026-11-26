import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import { REPORT_RELEASE_LEVEL_NO } from './rh-authorized-personnel.rules';
import type { AuthorizedPersonnelListing, AuthorizedPersonnelRow } from './rh-authorized-personnel.service';

/**
 * PDF del Listado de personal autorizado REH-REG-026 con el diseno del formato
 * controlado en Excel: carta horizontal, encabezado (logo, titulo y cuadro
 * codigo / vigencia / revision), fecha de corte, leyendas de niveles, tabla de
 * 14 columnas con los colores de alerta, TABLERO y FIRMAS.
 */

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = MARGIN + 14;

const NAVY = rgb(0.043, 0.31, 0.541);
const INK = rgb(0.1, 0.1, 0.1);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.949, 0.949, 0.949);
const GRAY_HEAD = rgb(0.85, 0.85, 0.85);
const BLUE_SOFT = rgb(0.863, 0.902, 0.945);
const BLUE_ROLE = rgb(0.773, 0.851, 0.945);
const YELLOW = rgb(1, 0.922, 0.612);
const AMBER_TEXT = rgb(0.612, 0.396, 0);
const RED = rgb(1, 0.78, 0.808);
const RED_TEXT = rgb(0.612, 0, 0.024);
const GREEN = rgb(0.776, 0.937, 0.808);
const MUTED = rgb(0.45, 0.45, 0.45);

/** Datos de control del formato (encabezado del documento controlado) y firmantes. */
export const AUTHORIZED_PERSONNEL_FORM = {
  code: 'REH-REG-026',
  title: 'LISTADO DE PERSONAL AUTORIZADO',
  valid_from: '14/07/2026',
  revision_label: '1 (Uno)',
  statement:
    '"El nivel de autorización aplica únicamente dentro del alcance del puesto, la competencia demostrada y las actividades autorizadas conforme a la documentación vigente del Sistema de Gestión de la Calidad."',
  signers: [
    { heading: 'ELABORÓ', name: 'T.L.C. Ursula G. Mendez Cuevas', role: 'Coordinador de Recursos Humanos' },
    { heading: 'REVISÓ', name: 'Q.F.B. Guillermo Priego Hernández', role: 'Director General' },
    { heading: 'AUTORIZÓ', name: 'Q.F.B. Guillermo Priego Hernández', role: 'Director General' },
  ],
} as const;

// Anchos de las 14 columnas en las proporciones del Excel (suman 945); se escalan a CONTENT_W.
const COLUMN_UNITS = [20, 69, 113, 125, 63, 37, 54, 46, 54, 54, 72, 46, 79, 113];
const UNIT = CONTENT_W / COLUMN_UNITS.reduce((sum, value) => sum + value, 0);
const COL_W = COLUMN_UNITS.map((value) => value * UNIT);
const COL_X = COL_W.map((_, index) => MARGIN + COL_W.slice(0, index).reduce((sum, value) => sum + value, 0));
/** Ancho del tramo de columnas [from, to] (indices 0-13, inclusivo). */
const span = (from: number, to: number): number => COL_W.slice(from, to + 1).reduce((sum, value) => sum + value, 0);

const HEADERS = [
  'No.', 'SEDE', 'NOMBRE', 'PUESTO', 'ÁREA', 'NIVEL\nORG.', 'ESTATUS', 'COMPETENTE',
  'FECHA\nÚLTIMA\nEVALUACIÓN', 'VIGENCIA\nHASTA', 'DÍAS', 'AUTORIZADO', 'NIVEL\nAUT.', 'ALERTA',
];

const ROW_H = 17;
const HEADER_ROW_H = 19;

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

const formatDate = (value: string | null): string => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const yesNo = (value: boolean | null): string => (value === null ? '' : value ? 'Sí' : 'No');

const titleCase = (value: string | null): string =>
  value ? value.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()) : '';

export interface AuthorizedPersonnelPdfOptions {
  /** Aviso impreso bajo la fecha de corte cuando el PDF no trae el listado completo. */
  filterNote?: string;
}

export const buildAuthorizedPersonnelPdf = async (
  listing: AuthorizedPersonnelListing,
  generatedAt: Date,
  options: AuthorizedPersonnelPdfOptions = {},
): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  doc.setTitle(`${AUTHORIZED_PERSONNEL_FORM.code} ${AUTHORIZED_PERSONNEL_FORM.title} - corte ${formatDate(listing.cutoff_date)}`);
  doc.setAuthor('UNILABOR · SafeDoc');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = resolveLogo();
  const logo: PDFImage | null = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const safe = (value: string): string => winAnsiSafe(value);
  const widthOf = (value: string, font: PDFFont, size: number): number => font.widthOfTextAtSize(safe(value), size);
  const box = (x: number, top: number, w: number, h: number, fill?: Rgb) => {
    page.drawRectangle({ x, y: top - h, width: w, height: h, ...(fill ? { color: fill } : {}), borderColor: INK, borderWidth: 0.5 });
  };
  const wrap = (value: string, font: PDFFont, size: number, maxWidth: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of value.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || widthOf(candidate, font, size) <= maxWidth) current = candidate;
        else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  };
  /** Texto dentro de una celda: centrado vertical, hasta `maxLines` lineas (la ultima se recorta con puntos). */
  const cell = (
    value: string,
    x: number,
    top: number,
    w: number,
    h: number,
    options: { font?: PDFFont; size?: number; color?: Rgb; align?: 'left' | 'center'; maxLines?: number } = {},
  ) => {
    if (!value) return;
    const font = options.font ?? regular;
    const size = options.size ?? 6.5;
    const pad = 2.5;
    let lines = wrap(value, font, size, w - pad * 2);
    const maxLines = options.maxLines ?? 2;
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1]!;
      while (last.length > 1 && widthOf(`${last}…`, font, size) > w - pad * 2) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    const lineH = size + 1.2;
    let baseline = top - (h - lines.length * lineH) / 2 - size + 0.6;
    for (const line of lines) {
      const tx = options.align === 'left' ? x + pad : x + (w - widthOf(line, font, size)) / 2;
      page.drawText(safe(line), { x: tx, y: baseline, size, font, color: options.color ?? INK });
      baseline -= lineH;
    }
  };
  const band = (label: string, x: number, top: number, w: number, h: number, size = 7) => {
    box(x, top, w, h, NAVY);
    cell(label, x, top, w, h, { font: bold, size, color: WHITE });
  };

  // --- Encabezado del formato ----------------------------------------------
  const drawFormHeader = () => {
    const h = 42;
    const logoW = span(0, 2);
    const metaLabelW = COL_W[12]!;
    const metaValueW = COL_W[13]!;
    const titleW = CONTENT_W - logoW - metaLabelW - metaValueW;
    box(MARGIN, y, logoW, h);
    if (logo) {
      const scale = Math.min((logoW - 24) / logo.width, (h - 10) / logo.height);
      page.drawImage(logo, {
        x: MARGIN + (logoW - logo.width * scale) / 2,
        y: y - h + (h - logo.height * scale) / 2,
        width: logo.width * scale,
        height: logo.height * scale,
      });
    }
    band(`${AUTHORIZED_PERSONNEL_FORM.code}  ${AUTHORIZED_PERSONNEL_FORM.title}`, MARGIN + logoW, y, titleW, h, 9);
    const metaX = MARGIN + logoW + titleW;
    const metaRows: Array<[string, string]> = [
      ['Código:', AUTHORIZED_PERSONNEL_FORM.code],
      ['Vigente a partir de:', AUTHORIZED_PERSONNEL_FORM.valid_from],
      ['No. de revisión:', AUTHORIZED_PERSONNEL_FORM.revision_label],
    ];
    metaRows.forEach(([label, value], index) => {
      const top = y - (h / 3) * index;
      box(metaX, top, metaLabelW, h / 3);
      box(metaX + metaLabelW, top, metaValueW, h / 3);
      cell(label, metaX, top, metaLabelW, h / 3, { font: bold, size: 6 });
      cell(value, metaX + metaLabelW, top, metaValueW, h / 3, { font: bold, size: 6 });
    });
    y -= h + 8;
  };

  const drawCutoff = () => {
    const h = 20;
    const labelW = span(0, 1);
    const dateW = COL_W[2]!;
    band('FECHA DE CORTE', MARGIN, y, labelW, h);
    box(MARGIN + labelW, y, dateW, h, BLUE_SOFT);
    cell(formatDate(listing.cutoff_date), MARGIN + labelW, y, dateW, h, { font: bold, size: 8 });
    box(MARGIN + labelW + dateW, y, CONTENT_W - labelW - dateW, h);
    cell(AUTHORIZED_PERSONNEL_FORM.statement, MARGIN + labelW + dateW, y, CONTENT_W - labelW - dateW, h, { font: italic, size: 6.5 });
    y -= h;
    if (options.filterNote) {
      // Extracto del listado: se declara para que nadie lo tome por el censo completo.
      const noteH = 12;
      box(MARGIN, y, CONTENT_W, noteH, YELLOW);
      cell(options.filterNote, MARGIN, y, CONTENT_W, noteH, { font: bold, size: 6.5, align: 'left', maxLines: 1 });
      y -= noteH;
    }
    y -= 8;
  };

  const drawLegends = () => {
    const rowH = 12;
    const headH = 12;
    const leftW = span(0, 5);
    const rightX = COL_X[7]!;
    const rightW = span(7, 13);
    const authLevels = listing.authorization_levels.filter((level) => level.is_active);
    const orgLevels = listing.organizational_levels.filter((level) => level.is_active);
    band('NIVEL DE AUTORIZACIÓN', MARGIN, y, leftW, headH);
    band('NIVELES ORGANIZACIONALES', rightX, y, rightW, headH);
    authLevels.forEach((level, index) => {
      const top = y - headH - rowH * index;
      box(MARGIN, top, COL_W[0]!, rowH);
      cell(String(level.level_no), MARGIN, top, COL_W[0]!, rowH, { size: 6.5 });
      box(MARGIN + COL_W[0]!, top, leftW - COL_W[0]!, rowH);
      const name = safe(level.name);
      const textX = MARGIN + COL_W[0]! + 3;
      page.drawText(name, { x: textX, y: top - rowH + 3.6, size: 6.5, font: bold, color: INK });
      if (level.description) {
        let description = ` - ${level.description}`;
        const room = leftW - COL_W[0]! - 6 - widthOf(name, bold, 6.5);
        while (description.length > 4 && widthOf(description, regular, 6.5) > room) description = `${description.slice(0, -2)}…`;
        page.drawText(safe(description), { x: textX + widthOf(name, bold, 6.5), y: top - rowH + 3.6, size: 6.5, font: regular, color: INK });
      }
    });
    const nameW = span(7, 8);
    orgLevels.forEach((level, index) => {
      const top = y - headH - rowH * index;
      box(rightX, top, nameW, rowH);
      cell(level.name, rightX, top, nameW, rowH, { font: bold, size: 6.5, maxLines: 1 });
      box(rightX + nameW, top, rightW - nameW, rowH);
      cell(level.description ?? '', rightX + nameW, top, rightW - nameW, rowH, { size: 5.3, maxLines: 2 });
    });
    y -= headH + rowH * Math.max(authLevels.length, orgLevels.length) + 8;
  };

  const drawTableHeader = () => {
    HEADERS.forEach((label, index) => {
      box(COL_X[index]!, y, COL_W[index]!, HEADER_ROW_H, NAVY);
      cell(label, COL_X[index]!, y, COL_W[index]!, HEADER_ROW_H, { font: bold, size: 4.8, color: WHITE, maxLines: 3 });
    });
    y -= HEADER_ROW_H;
  };

  const newPage = (withTableHeader: boolean) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    if (withTableHeader) drawTableHeader();
  };

  const alertStyle = (row: AuthorizedPersonnelRow): { fill?: Rgb; color: Rgb } =>
    row.alert_tone === 'red' ? { fill: RED, color: RED_TEXT } : row.alert_tone === 'amber' ? { fill: YELLOW, color: AMBER_TEXT } : { color: INK };

  const drawRow = (row: AuthorizedPersonnelRow) => {
    const style = alertStyle(row);
    const daysColor = row.days_remaining !== null && row.days_remaining < 0 ? RED_TEXT : INK;
    const cells: Array<{ value: string; fill?: Rgb; font?: PDFFont; color?: Rgb; align?: 'left' | 'center'; size?: number }> = [
      { value: String(row.row_no), size: 5.5 },
      { value: row.branch_name ?? '', fill: GRAY },
      { value: row.full_name, font: bold, align: 'left' },
      { value: row.position_name ?? '' },
      { value: titleCase(row.area_name) },
      { value: row.organizational_level_code ?? '' },
      { value: row.status_label, fill: GRAY },
      { value: yesNo(row.competent), font: bold },
      // Como en el formato: la fecha vacia se resalta en amarillo.
      { value: formatDate(row.last_evaluation_date), ...(row.last_evaluation_date ? {} : { fill: YELLOW }) },
      { value: formatDate(row.valid_until), fill: GRAY },
      { value: row.days_remaining === null ? '' : String(row.days_remaining), fill: GRAY, font: bold, color: daysColor },
      { value: yesNo(row.authorized), font: bold },
      { value: row.authorization_level_no === null ? '' : String(row.authorization_level_no), font: bold },
      { value: row.alert_text, font: bold, align: 'left', size: 5.5, ...style },
    ];
    cells.forEach((entry, index) => {
      box(COL_X[index]!, y, COL_W[index]!, ROW_H, entry.fill);
      cell(entry.value, COL_X[index]!, y, COL_W[index]!, ROW_H, {
        font: entry.font ?? regular,
        size: entry.size ?? 6.2,
        ...(entry.color ? { color: entry.color } : {}),
        ...(entry.align ? { align: entry.align } : {}),
      });
    });
    y -= ROW_H;
  };

  const drawDashboard = () => {
    const rowH = 13;
    const { summary } = listing;
    const entries: Array<{ label: string; value: number; fill: Rgb; strong?: boolean }> = [
      { label: 'Personal en el listado', value: summary.rows_total, fill: GRAY },
      { label: 'Competentes', value: summary.competent, fill: GREEN },
      { label: 'Autorizados', value: summary.authorized, fill: GREEN },
      { label: 'AUTORIZADOS SIN SER COMPETENTES', value: summary.authorized_not_competent, fill: RED, strong: true },
      { label: 'Sin fecha de última evaluación', value: summary.without_evaluation_date, fill: RED, strong: true },
      { label: 'Con la competencia VENCIDA', value: summary.expired, fill: RED, strong: true },
      { label: `Por vencer en ${listing.warning_days} días o menos`, value: summary.expiring_soon, fill: YELLOW },
      { label: `Nivel ${REPORT_RELEASE_LEVEL_NO} - liberan y firman informes`, value: summary.report_release_level, fill: GRAY },
    ];
    const needed = 12 + rowH * entries.length;
    if (y - needed < BOTTOM) newPage(false);
    band('TABLERO', MARGIN, y, CONTENT_W, 12);
    y -= 12;
    const labelW = span(0, 5);
    const valueW = span(6, 7);
    for (const entry of entries) {
      box(MARGIN, y, labelW, rowH, entry.fill);
      cell(entry.label, MARGIN, y, labelW, rowH, { font: bold, size: 6.5, align: 'left', ...(entry.strong ? { color: RED_TEXT } : {}), maxLines: 1 });
      box(MARGIN + labelW, y, valueW, rowH, entry.fill);
      cell(String(entry.value), MARGIN + labelW, y, valueW, rowH, { font: bold, size: 8 });
      box(MARGIN + labelW + valueW, y, CONTENT_W - labelW - valueW, rowH);
      if (entry === entries[0]) {
        // Una fila por puesto: se aclara cuantas personas distintas hay detras del total.
        cell(`${summary.people_total} colaboradores · una fila por colaborador y puesto`, MARGIN + labelW + valueW, y, CONTENT_W - labelW - valueW, rowH, { size: 6, align: 'left', color: MUTED, maxLines: 1 });
      }
      y -= rowH;
    }
    y -= 12;
  };

  const drawSignatures = () => {
    const headH = 12;
    const titleH = 10;
    const signH = 34;
    const roleH = 11;
    if (y - (headH + titleH + signH + roleH) < BOTTOM) newPage(false);
    band('FIRMAS', MARGIN, y, CONTENT_W, headH);
    y -= headH;
    const widths = [span(0, 3), span(4, 8), span(9, 13)];
    let x = MARGIN;
    AUTHORIZED_PERSONNEL_FORM.signers.forEach((signer, index) => {
      const w = widths[index]!;
      box(x, y, w, titleH, GRAY_HEAD);
      cell(signer.heading, x, y, w, titleH, { font: bold, size: 5.5 });
      box(x, y - titleH, w, signH);
      cell(signer.name, x, y - titleH - signH + 10, w, 10, { size: 6 });
      box(x, y - titleH - signH, w, roleH, BLUE_ROLE);
      cell(signer.role, x, y - titleH - signH, w, roleH, { font: bold, size: 6.5 });
      x += w;
    });
    y -= titleH + signH + roleH;
  };

  drawFormHeader();
  drawCutoff();
  drawLegends();
  drawTableHeader();
  for (const row of listing.rows) {
    if (y - ROW_H < BOTTOM) newPage(true);
    drawRow(row);
  }
  y -= 12;
  drawDashboard();
  drawSignatures();

  // Pie: paginacion y sello de generacion, fuera del cuerpo del formato.
  const pages = doc.getPages();
  const stamp = generatedAt.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
  });
  pages.forEach((current, index) => {
    const footer = safe(`${AUTHORIZED_PERSONNEL_FORM.code} · Generado por SafeDoc el ${stamp} · Página ${index + 1} de ${pages.length}`);
    current.drawText(footer, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(footer, 5.5), y: MARGIN - 4, size: 5.5, font: regular, color: MUTED });
  });

  return Buffer.from(await doc.save());
};
