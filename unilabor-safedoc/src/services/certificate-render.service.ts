import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Motor de render de constancias (pdfkit). Reutilizado por el preliminar (datos
 * de muestra, Sprint 35) y por la generacion real (Sprint 36). Produce un Buffer
 * PDF premium a partir de la plantilla disenable (textos con placeholders, logo,
 * firmas).
 *
 * Diseno: hay 4 estilos premium (clasico, onda, geometrico, degradado) inspirados
 * en disenos de constancia modernos/minimalistas. El estilo se elige de forma
 * DETERMINISTA con `styleSeed` (el id de la capacitacion), de modo que cada
 * capacitacion tiene un diseno distinto y consistente entre emisiones.
 */

export interface CertificateSignatureInput {
  name: string;
  role?: string | null;
  imagePath?: string | null;
}

export interface CertificateRenderInput {
  recipientName: string;
  courseTitle: string;
  date: string;
  scoreText: string;
  validityText: string;
  titleText: string;
  bodyText: string;
  logoPath?: string | null;
  orientation: 'landscape' | 'portrait';
  signatures: CertificateSignatureInput[];
  /** Semilla para elegir el estilo (id de la capacitacion). Determinista. */
  styleSeed?: number;
  /** Folio/referencia para verificacion (se muestra en el pie). */
  referenceCode?: string;
}

// --- Paleta de marca ---
const PALETTE = {
  ink: '#0b2235',
  brand: '#00416a',
  brandMid: '#1f6aa5',
  brandSoft: '#7cadd3',
  tint: '#eef4f9',
  gold: '#c2a14d',
  body: '#33485c',
  muted: '#7488a0',
  line: '#d7e2ec',
};

interface ThemeStyle {
  key: string;
  titleFont: string;
  nameFont: string;
  accent: string;
  sealColor: string;
  sealStarColor: string;
  contentX: number;
  contentWidth: number;
  /** El folio queda sobre una zona oscura (se pinta en blanco). */
  folioOnDark?: boolean;
}

type PDFKitDoc = InstanceType<typeof PDFDocument>;

interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
}

/** Sustituye los placeholders soportados por los valores reales/de muestra. */
const resolvePlaceholders = (template: string, input: CertificateRenderInput): string =>
  template
    .replace(/\{\{\s*nombre\s*\}\}/gi, input.recipientName)
    .replace(/\{\{\s*capacitacion\s*\}\}/gi, input.courseTitle)
    .replace(/\{\{\s*fecha\s*\}\}/gi, input.date)
    .replace(/\{\{\s*calificacion\s*\}\}/gi, input.scoreText)
    .replace(/\{\{\s*vigencia\s*\}\}/gi, input.validityText);

/** Resuelve la ruta de una imagen existente (subida o asset por defecto). */
const resolveImagePath = (relativeOrAbsolute: string | null | undefined): string | null => {
  if (!relativeOrAbsolute) {
    return null;
  }
  const candidate = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(process.cwd(), relativeOrAbsolute);
  return fs.existsSync(candidate) ? candidate : null;
};

/** Logo por defecto (mismo asset que usa el correo) si la plantilla no trae uno. */
const resolveDefaultLogo = (): string | null => {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'unilabor-logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

/** Dibuja una estrella de N puntas centrada (para el sello). */
const drawStar = (
  doc: PDFKitDoc,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number,
  color: string,
): void => {
  const step = Math.PI / spikes;
  let rotation = -Math.PI / 2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < spikes; i += 1) {
    points.push([cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius]);
    rotation += step;
    points.push([cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius]);
    rotation += step;
  }
  doc.polygon(...points).fill(color);
};

/** Sello de autenticidad vectorial (anillos + estrella + etiqueta). */
const drawSeal = (doc: PDFKitDoc, cx: number, cy: number, radius: number, style: ThemeStyle): void => {
  doc.save();
  doc.lineWidth(1.6).strokeColor(style.sealColor).circle(cx, cy, radius).stroke();
  doc.lineWidth(0.7).strokeColor(style.sealColor).circle(cx, cy, radius - 5).stroke();
  doc.fillColor(style.sealColor).circle(cx, cy, radius - 12).fill();
  drawStar(doc, cx, cy, 5, radius - 19, (radius - 19) / 2.3, style.sealStarColor);
  doc
    .fillColor(style.sealColor)
    .font('Helvetica-Bold')
    .fontSize(6)
    .text('CONSTANCIA OFICIAL', cx - radius, cy + radius + 4, {
      width: radius * 2,
      align: 'center',
      characterSpacing: 0.5,
    });
  doc.restore();
};

// --- Estilos / decoraciones ---

/** 0 · Clasico: marco doble, esquinas en triangulo y sello watermark central. */
const decorateClassic = (doc: PDFKitDoc, geom: PageGeometry): ThemeStyle => {
  const { pageWidth, pageHeight } = geom;
  doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');

  // Esquinas triangulares
  const corner = 95;
  doc.polygon([0, 0], [corner, 0], [0, corner]).fill(PALETTE.brand);
  doc.polygon([0, 0], [corner * 0.6, 0], [0, corner * 0.6]).fill(PALETTE.brandSoft);
  doc
    .polygon([pageWidth, pageHeight], [pageWidth - corner, pageHeight], [pageWidth, pageHeight - corner])
    .fill(PALETTE.brand);
  doc
    .polygon([pageWidth, pageHeight], [pageWidth - corner * 0.6, pageHeight], [pageWidth, pageHeight - corner * 0.6])
    .fill(PALETTE.brandSoft);

  // Marco doble
  doc.lineWidth(2.5).strokeColor(PALETTE.brand).rect(26, 26, pageWidth - 52, pageHeight - 52).stroke();
  doc.lineWidth(0.8).strokeColor(PALETTE.brandSoft).rect(33, 33, pageWidth - 66, pageHeight - 66).stroke();

  // Watermark (sello tenue al centro)
  doc.save();
  doc.opacity(0.05);
  doc.lineWidth(6).strokeColor(PALETTE.brand).circle(pageWidth / 2, pageHeight / 2 + 10, 120).stroke();
  doc.lineWidth(3).strokeColor(PALETTE.brand).circle(pageWidth / 2, pageHeight / 2 + 10, 95).stroke();
  doc.restore();

  return {
    key: 'classic',
    titleFont: 'Times-Bold',
    nameFont: 'Times-Bold',
    accent: PALETTE.gold,
    sealColor: PALETTE.brand,
    sealStarColor: PALETTE.gold,
    contentX: 70,
    contentWidth: pageWidth - 140,
  };
};

/** 1 · Onda: gran onda diagonal con degradado a la derecha + grid de puntos. */
const decorateWave = (doc: PDFKitDoc, geom: PageGeometry): ThemeStyle => {
  const { pageWidth, pageHeight } = geom;
  doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');

  const grad = doc.linearGradient(pageWidth * 0.55, 0, pageWidth, pageHeight);
  grad.stop(0, PALETTE.brandMid).stop(1, PALETTE.brand);
  doc.save();
  doc
    .path(
      `M ${pageWidth} 0 ` +
        `L ${pageWidth} ${pageHeight} ` +
        `L ${pageWidth * 0.6} ${pageHeight} ` +
        `C ${pageWidth * 0.82} ${pageHeight * 0.66}, ${pageWidth * 0.68} ${pageHeight * 0.34}, ${pageWidth * 0.9} 0 Z`,
    )
    .fill(grad);
  // Onda clara superpuesta
  doc.opacity(0.18);
  doc
    .path(
      `M ${pageWidth} ${pageHeight * 0.1} ` +
        `L ${pageWidth} ${pageHeight} ` +
        `L ${pageWidth * 0.66} ${pageHeight} ` +
        `C ${pageWidth * 0.84} ${pageHeight * 0.7}, ${pageWidth * 0.74} ${pageHeight * 0.4}, ${pageWidth * 0.96} ${pageHeight * 0.1} Z`,
    )
    .fill('#ffffff');
  doc.restore();

  // Grid de puntos (esquina superior izquierda)
  doc.save();
  doc.fillColor(PALETTE.brandSoft).opacity(0.8);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      doc.circle(58 + col * 9, 50 + row * 9, 1.3).fill();
    }
  }
  doc.restore();

  // Barra de acento izquierda
  doc.rect(34, pageHeight / 2 - 55, 4, 110).fill(PALETTE.brand);

  return {
    key: 'wave',
    titleFont: 'Helvetica',
    nameFont: 'Helvetica-Bold',
    accent: PALETTE.brandMid,
    sealColor: PALETTE.brand,
    sealStarColor: '#ffffff',
    contentX: 64,
    contentWidth: pageWidth * 0.56,
    folioOnDark: true,
  };
};

/** 2 · Geometrico: panel angular navy a la izquierda con titulo vertical. */
const decorateGeometric = (doc: PDFKitDoc, geom: PageGeometry): ThemeStyle => {
  const { pageWidth, pageHeight } = geom;
  doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');

  const panelW = pageWidth * 0.3;
  const grad = doc.linearGradient(0, 0, panelW, pageHeight);
  grad.stop(0, PALETTE.brand).stop(1, PALETTE.ink);
  doc.polygon([0, 0], [panelW, 0], [panelW - 55, pageHeight], [0, pageHeight]).fill(grad);
  // Acento claro diagonal
  doc.save();
  doc.opacity(0.16);
  doc.polygon([panelW - 55, pageHeight], [panelW, 0], [panelW + 22, 0], [panelW - 33, pageHeight]).fill(PALETTE.brandSoft);
  doc.restore();

  // Titulo vertical en el panel
  doc.save();
  doc.rotate(-90, { origin: [panelW / 2, pageHeight / 2] });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('FORMACION CONTINUA · UNILABOR', panelW / 2 - 150, pageHeight / 2 - 6, {
      width: 300,
      align: 'center',
      characterSpacing: 3,
    });
  doc.restore();

  // Marco fino del area de contenido
  doc.lineWidth(0.8).strokeColor(PALETTE.line).rect(panelW + 24, 28, pageWidth - panelW - 52, pageHeight - 56).stroke();

  return {
    key: 'geometric',
    titleFont: 'Helvetica-Bold',
    nameFont: 'Helvetica-Bold',
    accent: PALETTE.brandMid,
    sealColor: PALETTE.brand,
    sealStarColor: PALETTE.gold,
    contentX: panelW + 48,
    contentWidth: pageWidth - panelW - 96,
  };
};

/** 3 · Degradado: lavado suave en la esquina superior derecha + marco fino. */
const decorateGradient = (doc: PDFKitDoc, geom: PageGeometry): ThemeStyle => {
  const { pageWidth, pageHeight } = geom;
  doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');

  // Lavado degradado esquina superior derecha
  const grad = doc.linearGradient(pageWidth, 0, pageWidth * 0.45, pageHeight * 0.7);
  grad.stop(0, PALETTE.brandSoft).stop(1, '#ffffff');
  doc.save();
  doc.opacity(0.55);
  doc.polygon([pageWidth, 0], [pageWidth, pageHeight * 0.55], [pageWidth * 0.45, 0]).fill(grad);
  doc.restore();

  // Lavado inferior izquierdo muy tenue
  const grad2 = doc.linearGradient(0, pageHeight, pageWidth * 0.4, pageHeight * 0.5);
  grad2.stop(0, PALETTE.tint).stop(1, '#ffffff');
  doc.save();
  doc.opacity(0.7);
  doc.polygon([0, pageHeight], [0, pageHeight * 0.6], [pageWidth * 0.35, pageHeight]).fill(grad2);
  doc.restore();

  // Marco fino
  doc.lineWidth(1).strokeColor(PALETTE.line).rect(28, 28, pageWidth - 56, pageHeight - 56).stroke();
  doc.lineWidth(2.5).strokeColor(PALETTE.brand).rect(28, 28, 64, 4).fill(PALETTE.brand);

  return {
    key: 'gradient',
    titleFont: 'Times-Bold',
    nameFont: 'Helvetica-Bold',
    accent: PALETTE.brandMid,
    sealColor: PALETTE.brand,
    sealStarColor: PALETTE.gold,
    contentX: 70,
    contentWidth: pageWidth - 140,
  };
};

const THEMES = [decorateClassic, decorateWave, decorateGeometric, decorateGradient];

/** Texto centrado en el area de contenido del estilo. */
const centeredText = (
  doc: PDFKitDoc,
  text: string,
  y: number,
  style: ThemeStyle,
  options: { font: string; size: number; color: string; spacing?: number; lineGap?: number },
): void => {
  doc
    .fillColor(options.color)
    .font(options.font)
    .fontSize(options.size)
    .text(text, style.contentX, y, {
      width: style.contentWidth,
      align: 'center',
      characterSpacing: options.spacing ?? 0,
      lineGap: options.lineGap ?? 0,
    });
};

/** Render del contenido textual (cabecera, titulo, nombre, cuerpo, pie). */
const renderContent = (doc: PDFKitDoc, input: CertificateRenderInput, style: ThemeStyle, geom: PageGeometry): void => {
  const { pageWidth, pageHeight } = geom;
  const centerX = style.contentX + style.contentWidth / 2;

  // Folio (esquina superior derecha)
  if (input.referenceCode) {
    const folioColor = style.folioOnDark ? '#ffffff' : PALETTE.brand;
    doc
      .fillColor(style.folioOnDark ? '#ffffff' : PALETTE.muted, style.folioOnDark ? 0.7 : 1)
      .font('Helvetica')
      .fontSize(8)
      .text('FOLIO', pageWidth - 170, 46, { width: 120, align: 'right', characterSpacing: 1.5 });
    doc
      .fillColor(folioColor, 1)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(input.referenceCode, pageWidth - 170, 57, { width: 120, align: 'right' });
  }

  let cursorY = 56;

  // Logo
  const logo = resolveImagePath(input.logoPath) ?? resolveDefaultLogo();
  if (logo) {
    try {
      const logoWidth = 92;
      doc.image(logo, centerX - logoWidth / 2, cursorY, { width: logoWidth });
      cursorY += 74;
    } catch {
      cursorY += 8;
    }
  } else {
    cursorY += 8;
  }

  // Titulo (mayusculas, letter-spacing premium)
  centeredText(doc, resolvePlaceholders(input.titleText, input).toUpperCase(), cursorY, style, {
    font: style.titleFont,
    size: 30,
    color: PALETTE.ink,
    spacing: 3,
    lineGap: 2,
  });
  cursorY = doc.y + 12;

  // Divisor corto
  const dividerW = 70;
  doc
    .lineWidth(2)
    .strokeColor(style.accent)
    .moveTo(centerX - dividerW / 2, cursorY)
    .lineTo(centerX + dividerW / 2, cursorY)
    .stroke();
  cursorY += 22;

  // Lead-in
  centeredText(doc, 'SE OTORGA LA PRESENTE CONSTANCIA A', cursorY, style, {
    font: 'Helvetica',
    size: 9.5,
    color: PALETTE.muted,
    spacing: 2.5,
  });
  cursorY = doc.y + 10;

  // Nombre (heroe)
  centeredText(doc, input.recipientName, cursorY, style, {
    font: style.nameFont,
    size: 26,
    color: PALETTE.brand,
  });
  cursorY = doc.y + 16;

  // Cuerpo
  centeredText(doc, resolvePlaceholders(input.bodyText, input), cursorY, style, {
    font: 'Helvetica',
    size: 12,
    color: PALETTE.body,
    lineGap: 5,
  });
  cursorY = doc.y + 14;

  // Meta (fecha · vigencia)
  centeredText(doc, `Emitida el ${input.date}   ·   ${input.validityText}`, cursorY, style, {
    font: 'Helvetica-Oblique',
    size: 9.5,
    color: PALETTE.muted,
  });

  // Sello de autenticidad (esquina inferior derecha del area de contenido)
  const sealCx = style.contentX + style.contentWidth - 46;
  const sealCy = pageHeight - 108;
  drawSeal(doc, sealCx, sealCy, 36, style);

  // Firmas (a la izquierda, dejando espacio al sello)
  renderSignatures(doc, input.signatures, style, pageHeight, sealCx - 70);

  // Pie de verificacion (esquina inferior izquierda)
  if (input.referenceCode) {
    doc
      .fillColor(PALETTE.muted)
      .font('Helvetica')
      .fontSize(7.5)
      .text('Verifica la autenticidad de esta constancia con el folio', style.contentX, pageHeight - 64, {
        width: style.contentWidth * 0.5,
      });
    doc
      .fillColor(PALETTE.brand)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(input.referenceCode, style.contentX, pageHeight - 53, { width: style.contentWidth * 0.5 });
  }
};

/** Firmas con linea, nombre y cargo. Se acomodan a la izquierda del sello. */
const renderSignatures = (
  doc: PDFKitDoc,
  rawSignatures: CertificateSignatureInput[],
  style: ThemeStyle,
  pageHeight: number,
  rightBound: number,
): void => {
  const signatures = rawSignatures.slice(0, 4);
  if (signatures.length === 0) {
    return;
  }
  const areaX = style.contentX;
  const areaWidth = Math.max(160, rightBound - style.contentX);
  const columnWidth = areaWidth / signatures.length;
  const lineY = pageHeight - 96;

  signatures.forEach((signature, index) => {
    const columnX = areaX + index * columnWidth;
    const imagePath = resolveImagePath(signature.imagePath);
    if (imagePath) {
      try {
        doc.image(imagePath, columnX + columnWidth / 2 - 40, lineY - 38, { fit: [80, 34], align: 'center' });
      } catch {
        // imagen invalida -> se omite
      }
    }
    doc
      .strokeColor(PALETTE.ink)
      .lineWidth(0.8)
      .moveTo(columnX + 18, lineY)
      .lineTo(columnX + columnWidth - 18, lineY)
      .stroke();
    doc
      .fillColor(PALETTE.ink)
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(signature.name, columnX + 6, lineY + 6, { width: columnWidth - 12, align: 'center' });
    if (signature.role) {
      doc
        .fillColor(PALETTE.muted)
        .font('Helvetica')
        .fontSize(8.5)
        .text(signature.role, columnX + 6, doc.y + 1, { width: columnWidth - 12, align: 'center' });
    }
  });
};

export const renderCertificatePdf = (input: CertificateRenderInput): Promise<Buffer> => {
  const doc = new PDFDocument({ layout: input.orientation, size: 'A4', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const geom: PageGeometry = { pageWidth: doc.page.width, pageHeight: doc.page.height };

  // Estilo determinista por capacitacion (cada una con un diseno distinto).
  const seed = Number.isFinite(input.styleSeed) ? Math.abs(Math.trunc(input.styleSeed as number)) : 0;
  const decorate = THEMES[seed % THEMES.length] ?? decorateClassic;
  const style = decorate(doc, geom);

  renderContent(doc, input, style, geom);

  doc.end();
  return done;
};
