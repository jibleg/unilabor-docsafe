import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';

/**
 * Kit de dibujo para los formatos controlados de RH en carta horizontal
 * (REH-REG-027 y los que sigan): pagina, colores del Excel, logo, cajas,
 * celdas con texto ajustado y franjas de titulo. El REH-REG-026 conserva su
 * propia implementacion (anterior a este kit) sin cambios.
 */

export const FORM_PAGE_W = 792;
export const FORM_PAGE_H = 612;
export const FORM_MARGIN = 36;
export const FORM_CONTENT_W = FORM_PAGE_W - FORM_MARGIN * 2;
export const FORM_BOTTOM = FORM_MARGIN + 14;

export type Rgb = ReturnType<typeof rgb>;

/** Paleta del formato (los mismos colores que usa el Excel). */
export const FORM_COLORS = {
  NAVY: rgb(0.043, 0.31, 0.541),
  INK: rgb(0.1, 0.1, 0.1),
  WHITE: rgb(1, 1, 1),
  GRAY: rgb(0.851, 0.851, 0.851),
  GRAY_SOFT: rgb(0.949, 0.949, 0.949),
  GRAY_TEXT: rgb(0.35, 0.35, 0.35),
  BLUE_SOFT: rgb(0.863, 0.902, 0.945),
  BLUE_ROLE: rgb(0.773, 0.851, 0.945),
  YELLOW: rgb(1, 0.922, 0.612),
  AMBER_TEXT: rgb(0.612, 0.396, 0),
  RED: rgb(1, 0.78, 0.808),
  RED_TEXT: rgb(0.612, 0, 0.024),
  GREEN: rgb(0.776, 0.937, 0.808),
  GREEN_TEXT: rgb(0, 0.38, 0.0),
  MUTED: rgb(0.45, 0.45, 0.45),
} as const;

export const resolveFormLogo = (): Buffer | null => {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'unilabor-logo.png'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? fs.readFileSync(found) : null;
};

/** "2026-11-26" -> "26/11/2026" (vacio si no hay fecha). */
export const formatFormDate = (value: string | null): string => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

export const formatFormStamp = (date: Date): string =>
  date.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
  });

/** Anchos de columna a partir de proporciones (p. ej. las del Excel), escalados al ancho util. */
export const columnLayout = (units: number[]): { widths: number[]; xs: number[]; span: (from: number, to: number) => number } => {
  const unit = FORM_CONTENT_W / units.reduce((sum, value) => sum + value, 0);
  const widths = units.map((value) => value * unit);
  const xs = widths.map((_, index) => FORM_MARGIN + widths.slice(0, index).reduce((sum, value) => sum + value, 0));
  return { widths, xs, span: (from, to) => widths.slice(from, to + 1).reduce((sum, value) => sum + value, 0) };
};

export interface CellOptions {
  font?: PDFFont;
  size?: number;
  color?: Rgb;
  align?: 'left' | 'center';
  maxLines?: number;
}

export interface FormPdfKit {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  logo: PDFImage | null;
  /** Pagina actual (cambia con newPage). */
  page: () => PDFPage;
  /** Cursor vertical (desde arriba; disminuye al dibujar). */
  y: () => number;
  setY: (value: number) => void;
  advance: (delta: number) => void;
  newPage: () => void;
  safe: (value: string) => string;
  widthOf: (value: string, font: PDFFont, size: number) => number;
  box: (x: number, top: number, w: number, h: number, fill?: Rgb) => void;
  wrap: (value: string, font: PDFFont, size: number, maxWidth: number) => string[];
  /** Texto dentro de una celda: centrado vertical, hasta `maxLines` lineas (la ultima se recorta con puntos). */
  cell: (value: string, x: number, top: number, w: number, h: number, options?: CellOptions) => void;
  /** Franja azul con texto blanco. */
  band: (label: string, x: number, top: number, w: number, h: number, size?: number) => void;
  /** Imagen PNG ajustada y centrada dentro de la caja. */
  image: (png: PDFImage, x: number, top: number, w: number, h: number, pad?: number) => void;
  /** Pie de pagina en todas las paginas: codigo, sello de generacion y paginacion. */
  footer: (formCode: string, generatedAt: Date) => void;
}

export const createFormPdfKit = async (title: string): Promise<FormPdfKit> => {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('UNILABOR · SafeDoc');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = resolveFormLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  let page: PDFPage = doc.addPage([FORM_PAGE_W, FORM_PAGE_H]);
  let y = FORM_PAGE_H - FORM_MARGIN;

  const safe = (value: string): string => winAnsiSafe(value);
  const widthOf = (value: string, font: PDFFont, size: number): number => font.widthOfTextAtSize(safe(value), size);
  const box = (x: number, top: number, w: number, h: number, fill?: Rgb) => {
    page.drawRectangle({ x, y: top - h, width: w, height: h, ...(fill ? { color: fill } : {}), borderColor: FORM_COLORS.INK, borderWidth: 0.5 });
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
  const cell = (value: string, x: number, top: number, w: number, h: number, options: CellOptions = {}) => {
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
      page.drawText(safe(line), { x: tx, y: baseline, size, font, color: options.color ?? FORM_COLORS.INK });
      baseline -= lineH;
    }
  };
  const band = (label: string, x: number, top: number, w: number, h: number, size = 7) => {
    box(x, top, w, h, FORM_COLORS.NAVY);
    cell(label, x, top, w, h, { font: bold, size, color: FORM_COLORS.WHITE });
  };
  const image = (png: PDFImage, x: number, top: number, w: number, h: number, pad = 2) => {
    const scale = Math.min((w - pad * 2) / png.width, (h - pad * 2) / png.height);
    const drawW = png.width * scale;
    const drawH = png.height * scale;
    page.drawImage(png, { x: x + (w - drawW) / 2, y: top - h + (h - drawH) / 2, width: drawW, height: drawH });
  };
  const footer = (formCode: string, generatedAt: Date) => {
    const pages = doc.getPages();
    const stamp = formatFormStamp(generatedAt);
    pages.forEach((current, index) => {
      const text = safe(`${formCode} · Generado por SafeDoc el ${stamp} · Página ${index + 1} de ${pages.length}`);
      current.drawText(text, { x: FORM_PAGE_W - FORM_MARGIN - regular.widthOfTextAtSize(text, 5.5), y: FORM_MARGIN - 4, size: 5.5, font: regular, color: FORM_COLORS.MUTED });
    });
  };

  return {
    doc,
    regular,
    bold,
    italic,
    logo,
    page: () => page,
    y: () => y,
    setY: (value) => {
      y = value;
    },
    advance: (delta) => {
      y -= delta;
    },
    newPage: () => {
      page = doc.addPage([FORM_PAGE_W, FORM_PAGE_H]);
      y = FORM_PAGE_H - FORM_MARGIN;
    },
    safe,
    widthOf,
    box,
    wrap,
    cell,
    band,
    image,
    footer,
  };
};

export interface FormHeaderSpec {
  code: string;
  title: string;
  valid_from: string;
  revision_label: string;
}

/**
 * Encabezado del documento controlado: logo | titulo | cuadro codigo / vigencia /
 * revision. `logoW`, `metaLabelW` y `metaValueW` vienen del trazado de columnas.
 */
export const drawFormHeader = (kit: FormPdfKit, spec: FormHeaderSpec, logoW: number, metaLabelW: number, metaValueW: number): void => {
  const h = 42;
  const y = kit.y();
  const titleW = FORM_CONTENT_W - logoW - metaLabelW - metaValueW;
  kit.box(FORM_MARGIN, y, logoW, h);
  if (kit.logo) kit.image(kit.logo, FORM_MARGIN, y, logoW, h, 6);
  kit.band(`${spec.code}  ${spec.title}`, FORM_MARGIN + logoW, y, titleW, h, 9);
  const metaX = FORM_MARGIN + logoW + titleW;
  const metaRows: Array<[string, string]> = [
    ['Código:', spec.code],
    ['Vigente a partir de:', spec.valid_from],
    ['No. de revisión:', spec.revision_label],
  ];
  metaRows.forEach(([label, value], index) => {
    const top = y - (h / 3) * index;
    kit.box(metaX, top, metaLabelW, h / 3);
    kit.box(metaX + metaLabelW, top, metaValueW, h / 3);
    kit.cell(label, metaX, top, metaLabelW, h / 3, { font: kit.bold, size: 6 });
    kit.cell(value, metaX + metaLabelW, top, metaValueW, h / 3, { font: kit.bold, size: 6 });
  });
  kit.advance(h + 8);
};

export interface FormSigner {
  heading: string;
  name: string;
  role: string;
}

/** Firmante capturado en SafeDoc (rh_form_signers) ya con su imagen embebida. */
export interface CapturedFormSigner {
  name: string;
  role: string;
  image: PDFImage | null;
  /** Fecha ISO en que se registro la firma (se imprime en pequenio). */
  signedAt: string | null;
}

/**
 * Bloque FIRMAS al pie: una columna por firmante con sus anchos. Donde hay
 * firmante capturado se imprimen su nombre, cargo y firma; si no, el fijo del formato.
 */
export const drawFormSignatures = (
  kit: FormPdfKit,
  signers: readonly FormSigner[],
  widths: number[],
  captured: Array<CapturedFormSigner | null> = [],
): void => {
  const headH = 12;
  const titleH = 10;
  const signH = captured.some((item) => item?.image) ? 48 : 34;
  const roleH = 11;
  if (kit.y() - (headH + titleH + signH + roleH) < FORM_BOTTOM) kit.newPage();
  const y = kit.y();
  kit.band('FIRMAS', FORM_MARGIN, y, FORM_CONTENT_W, headH);
  let x = FORM_MARGIN;
  signers.forEach((fixed, index) => {
    const w = widths[index]!;
    const top = y - headH;
    const current = captured[index] ?? null;
    kit.box(x, top, w, titleH, FORM_COLORS.GRAY);
    kit.cell(fixed.heading, x, top, w, titleH, { font: kit.bold, size: 5.5 });
    kit.box(x, top - titleH, w, signH);
    if (current?.image) {
      // La firma ocupa el recuadro por encima del renglon del nombre.
      kit.image(current.image, x, top - titleH - 2, w, signH - 12, 3);
      if (current.signedAt) {
        const stamp = kit.safe(`Firma registrada el ${formatFormDate(current.signedAt.slice(0, 10))}`);
        kit.page().drawText(stamp, { x: x + w - 4 - kit.regular.widthOfTextAtSize(stamp, 4.5), y: top - titleH - 6, size: 4.5, font: kit.regular, color: FORM_COLORS.MUTED });
      }
    }
    kit.cell(current?.name ?? fixed.name, x, top - titleH - signH + 10, w, 10, { size: 6 });
    kit.box(x, top - titleH - signH, w, roleH, FORM_COLORS.BLUE_ROLE);
    kit.cell(current?.role ?? fixed.role, x, top - titleH - signH, w, roleH, { font: kit.bold, size: 6.5 });
    x += w;
  });
  kit.advance(headH + titleH + signH + roleH);
};
