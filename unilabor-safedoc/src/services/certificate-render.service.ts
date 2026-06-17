import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Motor de render de constancias (pdfkit). Reutilizado por el preliminar (datos
 * de muestra, Sprint 35) y por la generacion real (Sprint 36). Produce un Buffer
 * PDF a partir de la plantilla disenable (textos con placeholders, logo, firmas).
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
  const candidates = [
    path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(process.cwd(), relativeOrAbsolute),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
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

export const renderCertificatePdf = (input: CertificateRenderInput): Promise<Buffer> => {
  const doc = new PDFDocument({ layout: input.orientation, size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = doc.page.margins.left;
  const usableWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
  const brand = '#00416a';

  // Marco decorativo
  doc
    .lineWidth(3)
    .strokeColor(brand)
    .rect(25, 25, pageWidth - 50, pageHeight - 50)
    .stroke();
  doc
    .lineWidth(1)
    .strokeColor('#7cadd3')
    .rect(33, 33, pageWidth - 66, pageHeight - 66)
    .stroke();

  let cursorY = 70;

  // Logo (subido o por defecto)
  const logo = resolveImagePath(input.logoPath) ?? resolveDefaultLogo();
  if (logo) {
    try {
      const logoWidth = 110;
      doc.image(logo, (pageWidth - logoWidth) / 2, cursorY, { width: logoWidth });
      cursorY += 90;
    } catch {
      // Imagen invalida: se omite sin romper el render.
    }
  }

  // Titulo
  doc
    .fillColor(brand)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(resolvePlaceholders(input.titleText, input), left, cursorY, { width: usableWidth, align: 'center' });

  cursorY = doc.y + 24;

  // Cuerpo
  doc
    .fillColor('#1f2d3d')
    .font('Helvetica')
    .fontSize(15)
    .text(resolvePlaceholders(input.bodyText, input), left, cursorY, {
      width: usableWidth,
      align: 'center',
      lineGap: 6,
    });

  // Firmas (cerca del pie)
  const signatures = input.signatures.slice(0, 4);
  if (signatures.length > 0) {
    const blockY = pageHeight - 150;
    const columnWidth = usableWidth / signatures.length;
    signatures.forEach((signature, index) => {
      const columnX = left + index * columnWidth;
      const imagePath = resolveImagePath(signature.imagePath);
      if (imagePath) {
        try {
          doc.image(imagePath, columnX + columnWidth / 2 - 45, blockY - 45, { fit: [90, 40], align: 'center' });
        } catch {
          // imagen invalida -> se omite
        }
      }
      doc
        .strokeColor('#1f2d3d')
        .lineWidth(0.8)
        .moveTo(columnX + 30, blockY + 5)
        .lineTo(columnX + columnWidth - 30, blockY + 5)
        .stroke();
      doc
        .fillColor('#1f2d3d')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(signature.name, columnX + 10, blockY + 12, { width: columnWidth - 20, align: 'center' });
      if (signature.role) {
        doc
          .fillColor('#5a6b7b')
          .font('Helvetica')
          .fontSize(10)
          .text(signature.role, columnX + 10, doc.y + 1, { width: columnWidth - 20, align: 'center' });
      }
    });
  }

  doc.end();
  return done;
};
