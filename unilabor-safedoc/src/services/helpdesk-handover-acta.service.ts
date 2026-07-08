import fs from 'fs';
import PDFDocument from 'pdfkit';

const BRAND = '#00416a';
const INK = '#1f2933';
const MUTED = '#52606d';

export interface HandoverActaAssetLine {
  index: number;
  asset_code: string;
  name: string;
  brand_model: string;
  serial_number: string;
  condition: string;
  observations: string | null;
  // Componentes del equipo (codigo + nombre) para dejarlos asentados en el acta.
  components?: string[];
}

export interface HandoverActaInput {
  folio: string;
  unit_name: string;
  area_name: string;
  delivered_by_name: string;
  received_by_name: string;
  handover_at: Date;
  notes: string | null;
  assets: HandoverActaAssetLine[];
  deliverer_signature_path: string | null;
  receiver_signature_path: string | null;
}

const line = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'N/E';
  }
  return String(value);
};

const formatDateTime = (date: Date): string => {
  // Formato local es-MX legible (DD/MM/AAAA HH:mm) sin dependencias externas.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Columnas de la tabla de activos (ancho de contenido A4 con margen 56 ~= 483pt).
const COLS = {
  index: { x: 56, w: 24, label: '#' },
  code: { x: 80, w: 92, label: 'Codigo' },
  name: { x: 172, w: 132, label: 'Equipo / Descripcion' },
  brand: { x: 304, w: 96, label: 'Marca / Modelo' },
  serial: { x: 400, w: 74, label: 'No. serie' },
  condition: { x: 474, w: 65, label: 'Condicion' },
};
const TABLE_RIGHT = 539;
const PAGE_BOTTOM = 760;

export const renderHandoverActaPdf = (input: HandoverActaInput): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Encabezado institucional
  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text('UNILABOR', 56, 56);
  doc.fillColor(INK).fontSize(10).font('Helvetica').text('Sistema de Gestion de Calidad - ISO 15189:2022');
  doc.moveDown(0.4);
  doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(0.8);

  doc.fillColor(BRAND).fontSize(15).font('Helvetica-Bold').text('ACTA DE ENTREGA-RECEPCION DE ACTIVOS', { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor(BRAND).fontSize(12).font('Helvetica-Bold').text(`Folio: ${line(input.folio)}`, { align: 'center' });
  doc.moveDown(1);

  // Datos de la entrega (dos columnas)
  const infoTop = doc.y;
  const drawInfo = (label: string, value: string, x: number, y: number, width: number) => {
    doc.font('Helvetica-Bold').fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x, y, { width });
    doc.font('Helvetica').fillColor(INK).fontSize(10).text(value, x, y + 10, { width });
  };
  drawInfo('Unidad', line(input.unit_name), 56, infoTop, 230);
  drawInfo('Area', line(input.area_name), 309, infoTop, 230);
  drawInfo('Entrega', line(input.delivered_by_name), 56, infoTop + 34, 230);
  drawInfo('Recibe (responsable)', line(input.received_by_name), 309, infoTop + 34, 230);
  drawInfo('Fecha y hora', formatDateTime(input.handover_at), 56, infoTop + 68, 230);
  drawInfo('Total de activos', String(input.assets.length), 309, infoTop + 68, 230);
  doc.y = infoTop + 96;
  doc.moveDown(0.5);

  // Cabecera de la tabla
  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(56, y - 2, TABLE_RIGHT - 56, 16).fill('#eef5fa');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(7.5);
    (Object.keys(COLS) as Array<keyof typeof COLS>).forEach((key) => {
      const col = COLS[key];
      doc.text(col.label, col.x + 2, y + 2, { width: col.w - 4 });
    });
    doc.y = y + 18;
  };

  drawTableHeader();

  doc.font('Helvetica').fontSize(8).fillColor(INK);
  input.assets.forEach((asset) => {
    const cells: Array<{ col: keyof typeof COLS; value: string }> = [
      { col: 'index', value: String(asset.index) },
      { col: 'code', value: line(asset.asset_code) },
      { col: 'name', value: line(asset.name) },
      { col: 'brand', value: line(asset.brand_model) },
      { col: 'serial', value: line(asset.serial_number) },
      { col: 'condition', value: line(asset.condition) },
    ];

    // Altura de la fila = mayor alto de sus celdas (para textos que envuelven).
    const rowTop = doc.y;
    const heights = cells.map(({ col, value }) =>
      doc.heightOfString(value, { width: COLS[col].w - 4 }),
    );
    const obsHeight = asset.observations
      ? doc.heightOfString(`Obs: ${asset.observations}`, { width: TABLE_RIGHT - 60 }) + 2
      : 0;
    const compText =
      asset.components && asset.components.length > 0 ? `Componentes: ${asset.components.join(', ')}` : null;
    const compHeight = compText ? doc.heightOfString(compText, { width: TABLE_RIGHT - 60 }) + 2 : 0;
    const rowHeight = Math.max(12, ...heights) + obsHeight + compHeight + 6;

    if (rowTop + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      doc.y = 56;
      drawTableHeader();
      doc.font('Helvetica').fontSize(8).fillColor(INK);
    }

    const y = doc.y;
    cells.forEach(({ col, value }) => {
      doc.fillColor(INK).text(value, COLS[col].x + 2, y, { width: COLS[col].w - 4 });
    });
    let extraY = y + Math.max(12, ...heights) + 1;
    if (asset.observations) {
      doc.fillColor(MUTED).fontSize(7.5).text(`Obs: ${asset.observations}`, 60, extraY, { width: TABLE_RIGHT - 60 });
      extraY += obsHeight;
      doc.fontSize(8);
    }
    if (compText) {
      doc.fillColor(MUTED).fontSize(7.5).text(compText, 60, extraY, { width: TABLE_RIGHT - 60 });
      doc.fontSize(8);
    }
    doc.y = y + rowHeight;
    doc.moveTo(56, doc.y - 3).lineTo(TABLE_RIGHT, doc.y - 3).strokeColor('#dfe6ec').lineWidth(0.5).stroke();
  });

  if (input.notes) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text('Observaciones generales:', 56, doc.y);
    doc.font('Helvetica').fillColor(INK).fontSize(9).text(line(input.notes), 56, doc.y, { width: TABLE_RIGHT - 56 });
  }

  // Firmas: si no caben, pasar a pagina nueva.
  const signBlockHeight = 120;
  if (doc.y + signBlockHeight > PAGE_BOTTOM) {
    doc.addPage();
    doc.y = 80;
  } else {
    doc.moveDown(3);
  }

  const drawSignature = (imagePath: string | null, name: string, role: string, x: number) => {
    const boxWidth = 200;
    const imgY = doc.y;
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        doc.image(imagePath, x + 15, imgY, { fit: [boxWidth - 30, 50] });
      } catch {
        // imagen ilegible: se deja el espacio en blanco sobre la linea de firma
      }
    }
    const lineY = imgY + 56;
    doc.moveTo(x, lineY).lineTo(x + boxWidth, lineY).strokeColor(INK).lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text(line(name), x, lineY + 5, { width: boxWidth, align: 'center' });
    doc.font('Helvetica').fillColor(MUTED).fontSize(8).text(role, x, lineY + 18, { width: boxWidth, align: 'center' });
  };

  const signRowY = doc.y;
  drawSignature(input.deliverer_signature_path, input.delivered_by_name, 'Entrega', 70);
  doc.y = signRowY;
  drawSignature(input.receiver_signature_path, input.received_by_name, 'Recibe (responsable)', 325);

  doc.end();
  return done;
};
