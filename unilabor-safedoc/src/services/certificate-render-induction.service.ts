import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Render de la constancia OFICIAL de Induccion (RH), plantilla fija provista
 * por RH (storage/Constancia.pptx) — a diferencia de certificate-render.service.ts
 * (motor generico de 4 estilos rotativos usado por el resto de capacitaciones),
 * este archivo reproduce UN solo diseno exacto: marco navy doble, logo,
 * "CONSTANCIA DE APROBACION", 5 campos de datos y 3 firmas. Carta horizontal
 * (11x8.5in), no A4 — asi esta definido el PPTX original.
 *
 * Las posiciones (IN.*) vienen de medir el XML del PPTX (EMU -> pulgadas) para
 * que el PDF quede fiel al diseno oficial, no son valores estimados a ojo.
 */

type PDFKitDoc = InstanceType<typeof PDFDocument>;

const PT_PER_IN = 72;
const pt = (inches: number): number => inches * PT_PER_IN;

const COLOR = {
  navy: '#123B5D',
  teal: '#1A8E98',
  gold: '#C8A24D',
  gray: '#667783',
  body: '#263746',
  fieldTeal: '#EAF5F5',
  fieldGold: '#F8F2E4',
};

export interface InductionCertificateSignatureInput {
  name: string;
  role?: string | null;
  imagePath?: string | null;
}

export interface InductionCertificateRenderInput {
  recipientName: string;
  position: string;
  branch: string;
  scoreText: string;
  durationText: string;
  evaluationDateText: string;
  phaseNumber: number;
  phaseName: string;
  issueDateLong: string;
  logoPath?: string | null;
  signatures: InductionCertificateSignatureInput[];
}

const resolveImagePath = (relativeOrAbsolute: string | null | undefined): string | null => {
  if (!relativeOrAbsolute) {
    return null;
  }
  const candidate = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(process.cwd(), relativeOrAbsolute);
  return fs.existsSync(candidate) ? candidate : null;
};

const resolveDefaultLogo = (): string | null => {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'unilabor-logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const centered = (
  doc: PDFKitDoc,
  text: string,
  xIn: number,
  yIn: number,
  wIn: number,
  options: { font: string; size: number; color: string; spacing?: number },
): void => {
  doc
    .fillColor(options.color)
    .font(options.font)
    .fontSize(options.size)
    .text(text, pt(xIn), pt(yIn), { width: pt(wIn), align: 'center', characterSpacing: options.spacing ?? 0 });
};

const FIELD_BOXES = [
  { x: 0.5, bg: COLOR.fieldTeal, label: 'PUESTO' },
  { x: 2.5, bg: COLOR.fieldGold, label: 'SUCURSAL' },
  { x: 4.5, bg: COLOR.fieldTeal, label: 'CALIFICACIÓN' },
  { x: 6.5, bg: COLOR.fieldGold, label: 'DURACIÓN' },
  { x: 8.5, bg: COLOR.fieldTeal, label: 'FECHA DE EVALUACIÓN' },
] as const;
const FIELD_Y = 4.27;
const FIELD_W = 2.0;
const FIELD_H = 0.52;

const SIGNATURE_COLUMNS = [
  { x: 0.98, w: 2.79 },
  { x: 4.1, w: 2.79 },
  { x: 7.23, w: 2.79 },
] as const;
const SIGNATURE_LINE_Y = 5.98;

/** Genera la constancia oficial de Induccion (diseno fijo). */
export const renderInductionCertificatePdf = (input: InductionCertificateRenderInput): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Fondo + marco doble
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
  doc.lineWidth(1.875).strokeColor(COLOR.navy).rect(pt(0.19), pt(0.19), pt(10.62), pt(8.12)).stroke();
  doc.lineWidth(0.825).strokeColor(COLOR.navy).rect(pt(0.25), pt(0.25), pt(10.5), pt(8.0)).stroke();

  // Logo (mismo asset que el motor generico)
  const logo = resolveImagePath(input.logoPath) ?? resolveDefaultLogo();
  if (logo) {
    try {
      const logoWidth = pt(1.92);
      doc.image(logo, doc.page.width / 2 - logoWidth / 2, pt(0.33), { width: logoWidth });
    } catch {
      /* logo invalido -> se omite */
    }
  }

  centered(doc, 'UNIDAD DE LABORATORIO CLÍNICO Y BIOLOGÍA MOLECULAR', 0.5, 1.08, 10.0, {
    font: 'Helvetica-Bold',
    size: 9,
    color: COLOR.teal,
    spacing: 0.4,
  });

  // Linea dorada
  doc.lineWidth(1.35).strokeColor(COLOR.gold).moveTo(pt(0.5), pt(1.36)).lineTo(pt(10.5), pt(1.36)).stroke();

  centered(doc, 'OTORGA LA PRESENTE', 0.5, 1.4, 10.0, { font: 'Helvetica-Bold', size: 10.5, color: COLOR.gray, spacing: 0.6 });

  centered(doc, 'CONSTANCIA', 0.5, 1.55, 10.0, { font: 'Helvetica-Bold', size: 36, color: COLOR.navy, spacing: 0.8 });
  centered(doc, 'DE APROBACIÓN', 0.5, 2.05, 10.0, { font: 'Helvetica-Bold', size: 13.5, color: COLOR.gold, spacing: 1.2 });

  centered(doc, 'A', 0.5, 2.28, 10.0, { font: 'Helvetica-Bold', size: 9.75, color: COLOR.gray });

  // Nombre del colaborador
  centered(doc, input.recipientName.toUpperCase(), 0.5, 2.44, 10.0, { font: 'Helvetica-Bold', size: 21, color: COLOR.teal });
  doc.lineWidth(0.6).strokeColor(COLOR.navy).moveTo(pt(1.46), pt(2.82)).lineTo(pt(9.54), pt(2.82)).stroke();

  centered(doc, 'Por haber aprobado satisfactoriamente la evaluación correspondiente a la', 0.5, 2.94, 10.0, {
    font: 'Helvetica',
    size: 12.75,
    color: COLOR.body,
  });
  centered(doc, `FASE ${input.phaseNumber}  DEL PROGRAMA DE INDUCCIÓN`, 0.5, 3.17, 10.0, {
    font: 'Helvetica-Bold',
    size: 18,
    color: COLOR.navy,
  });
  centered(doc, input.phaseName.toUpperCase(), 0.5, 3.48, 10.0, { font: 'Helvetica-Bold', size: 13, color: COLOR.teal });

  centered(
    doc,
    'Acredita la comprensión de la información institucional proporcionada durante esta etapa y el cumplimiento de los criterios establecidos para continuar con su proceso de inducción.',
    1.51,
    3.78,
    7.98,
    { font: 'Helvetica', size: 10.88, color: COLOR.body },
  );

  // Fila de 5 campos
  const fieldValues = [input.position, input.branch, input.scoreText, input.durationText, input.evaluationDateText];
  FIELD_BOXES.forEach((field, index) => {
    doc.rect(pt(field.x), pt(FIELD_Y), pt(FIELD_W), pt(FIELD_H)).fill(field.bg);
    centered(doc, field.label, field.x, FIELD_Y + 0.05, FIELD_W, { font: 'Helvetica-Bold', size: 9, color: COLOR.gray, spacing: 0.3 });
    centered(doc, fieldValues[index] ?? '—', field.x, FIELD_Y + 0.23, FIELD_W, {
      font: 'Helvetica-Bold',
      size: 12.75,
      color: COLOR.navy,
    });
  });

  centered(doc, `Villahermosa, Tabasco, a ${input.issueDateLong}.`, 2.81, 5.05, 5.38, {
    font: 'Helvetica-Oblique',
    size: 9.75,
    color: COLOR.gray,
  });

  // Firmas
  const signatures = input.signatures.slice(0, 3);
  const captions = ['Nombre y firma', 'Nombre y firma', 'Nombre y firma de recibido'];
  SIGNATURE_COLUMNS.forEach((column, index) => {
    const signature = signatures[index];
    if (!signature) {
      return;
    }
    const imagePath = resolveImagePath(signature.imagePath);
    if (imagePath) {
      try {
        doc.image(imagePath, pt(column.x) + pt(column.w) / 2 - 40, pt(SIGNATURE_LINE_Y) - 34, { fit: [80, 30], align: 'center' });
      } catch {
        /* imagen invalida -> se omite */
      }
    }
    doc
      .lineWidth(0.8)
      .strokeColor(COLOR.navy)
      .moveTo(pt(column.x) - pt(0.04), pt(SIGNATURE_LINE_Y))
      .lineTo(pt(column.x) - pt(0.04) + pt(2.71), pt(SIGNATURE_LINE_Y))
      .stroke();
    // Debajo de la linea: NOMBRE del firmante (navy, bold) y su CARGO (gris, mayusculas),
    // como en el motor generico. Antes solo se imprimia el cargo y el nombre capturado en la
    // plantilla nunca aparecia. Cada bloque se mide (pueden envolver a 2 lineas) para que la
    // leyenda "Nombre y firma" no se encime.
    const nameText = signature.name.trim().toUpperCase();
    const roleText = signature.role ? signature.role.trim().toUpperCase() : '';
    const nameSize = 10.5;
    const roleSize = 8.5;
    let cursorY = SIGNATURE_LINE_Y + 0.04;
    doc.font('Helvetica-Bold').fontSize(nameSize);
    const nameHeight = doc.heightOfString(nameText, { width: pt(column.w), align: 'center' });
    centered(doc, nameText, column.x, cursorY, column.w, { font: 'Helvetica-Bold', size: nameSize, color: COLOR.navy });
    cursorY += nameHeight / PT_PER_IN + 0.02;
    if (roleText) {
      doc.font('Helvetica-Bold').fontSize(roleSize);
      const roleHeight = doc.heightOfString(roleText, { width: pt(column.w), align: 'center' });
      centered(doc, roleText, column.x, cursorY, column.w, { font: 'Helvetica-Bold', size: roleSize, color: COLOR.gray, spacing: 0.3 });
      cursorY += roleHeight / PT_PER_IN + 0.02;
    }
    centered(doc, captions[index] ?? 'Nombre y firma', column.x, cursorY + 0.02, column.w, {
      font: 'Helvetica-Oblique',
      size: 7.5,
      color: COLOR.gray,
    });
  });

  centered(
    doc,
    `Esta constancia acredita únicamente la aprobación de la Fase ${input.phaseNumber} y no constituye autorización para realizar actividades técnicas sin supervisión.`,
    2.14,
    6.84,
    6.73,
    { font: 'Helvetica-Oblique', size: 7.88, color: COLOR.gray },
  );

  doc.end();
  return done;
};
