import PDFDocument from 'pdfkit';

const BRAND = '#00416a';
const INK = '#1f2933';
const MUTED = '#52606d';
const PAGE_RIGHT = 539;
const PAGE_BOTTOM = 760;

export interface TicketConstanciaInput {
  ticket_code: string;
  title: string;
  status_name: string;
  priority_name: string;
  request_type_name: string;
  asset_label: string | null;
  requester_name: string;
  assigned_name: string;
  closer_name: string;
  reported_at: Date;
  solved_at: Date | null;
  validated_at: Date | null;
  closed_at: Date;
  solution_summary: string | null;
  support_channel_label: string | null;
  provider_name: string | null;
  provider_contact: string | null;
  onsite_responsible_name: string | null;
  call_at: Date | null;
  closure_notes: string;
  evidence_titles: string[];
  requester_signature_path: string | null;
  closer_signature_path: string | null;
}

const line = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'N/E';
  }
  return String(value);
};

const formatDateTime = (date: Date | null): string => {
  if (!date) {
    return 'N/E';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const field = (doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) => {
  doc.font('Helvetica-Bold').fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fillColor(INK).fontSize(10).text(value, x, y + 10, { width });
};

export const renderTicketConstanciaPdf = (input: TicketConstanciaInput): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text('UNILABOR', 56, 56);
  doc.fillColor(INK).fontSize(10).font('Helvetica').text('Mesa de Ayuda - ISO 15189:2022');
  doc.moveDown(0.4);
  doc.moveTo(56, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(0.8);

  doc.fillColor(BRAND).fontSize(15).font('Helvetica-Bold').text('CONSTANCIA DE ATENCION DE SOLICITUD DE SOPORTE', {
    align: 'center',
  });
  doc.moveDown(0.3);
  doc.fillColor(BRAND).fontSize(12).font('Helvetica-Bold').text(`Folio: ${line(input.ticket_code)}`, {
    align: 'center',
  });
  doc.moveDown(1);

  const colWidth = (PAGE_RIGHT - 56) / 2 - 8;
  let top = doc.y;
  field(doc, 56, top, colWidth, 'Título', input.title);
  field(doc, 56 + colWidth + 16, top, colWidth, 'Activo', line(input.asset_label));
  top += 32;
  field(doc, 56, top, colWidth, 'Tipo de solicitud', line(input.request_type_name));
  field(doc, 56 + colWidth + 16, top, colWidth, 'Prioridad', line(input.priority_name));
  top += 32;
  field(doc, 56, top, colWidth, 'Solicita', line(input.requester_name));
  field(doc, 56 + colWidth + 16, top, colWidth, 'Responsable', line(input.assigned_name));
  top += 32;
  field(doc, 56, top, colWidth, 'Reportado', formatDateTime(input.reported_at));
  field(doc, 56 + colWidth + 16, top, colWidth, 'Solucionado', formatDateTime(input.solved_at));
  top += 32;
  field(doc, 56, top, colWidth, 'Retorno validado', formatDateTime(input.validated_at));
  field(doc, 56 + colWidth + 16, top, colWidth, 'Cerrado', formatDateTime(input.closed_at));
  top += 32;
  field(doc, 56, top, colWidth, 'Estado final', line(input.status_name));
  field(doc, 56 + colWidth + 16, top, colWidth, 'Canal de atención', line(input.support_channel_label));
  doc.y = top + 32;
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text('Resumen de la solución:', 56, doc.y);
  doc.font('Helvetica').fillColor(INK).fontSize(9).text(line(input.solution_summary), 56, doc.y, {
    width: PAGE_RIGHT - 56,
  });
  doc.moveDown(0.6);

  if (input.support_channel_label === 'Asistencia telefónica del proveedor') {
    doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text('Bitácora de llamada (sin evidencia documental):', 56, doc.y);
    doc
      .font('Helvetica')
      .fillColor(INK)
      .fontSize(9)
      .text(
        `Proveedor: ${line(input.provider_name)} · Contacto: ${line(input.provider_contact)} · Responsable in situ: ${line(
          input.onsite_responsible_name,
        )} · Llamada: ${formatDateTime(input.call_at)}`,
        56,
        doc.y,
        { width: PAGE_RIGHT - 56 },
      );
    doc.moveDown(0.6);
  }

  doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text('Notas de cierre:', 56, doc.y);
  doc.font('Helvetica').fillColor(INK).fontSize(9).text(line(input.closure_notes), 56, doc.y, {
    width: PAGE_RIGHT - 56,
  });
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text('Evidencia documental adjunta:', 56, doc.y);
  doc
    .font('Helvetica')
    .fillColor(INK)
    .fontSize(9)
    .text(input.evidence_titles.length > 0 ? input.evidence_titles.join(', ') : 'Sin documentos adjuntos.', 56, doc.y, {
      width: PAGE_RIGHT - 56,
    });

  const signBlockHeight = 110;
  if (doc.y + signBlockHeight > PAGE_BOTTOM) {
    doc.addPage();
    doc.y = 80;
  } else {
    doc.moveDown(3);
  }

  const boxWidth = (PAGE_RIGHT - 56 - 30) / 2;
  const drawSignature = (x: number, imagePath: string | null, name: string, role: string) => {
    const imgY = doc.y;
    if (imagePath) {
      try {
        doc.image(imagePath, x + 15, imgY, { fit: [boxWidth - 30, 50] });
      } catch {
        // firma no legible: se deja el recuadro vacio, no invalida la constancia
      }
    }
    const lineY = imgY + 55;
    doc.moveTo(x, lineY).lineTo(x + boxWidth, lineY).strokeColor(INK).lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fillColor(INK).fontSize(9).text(line(name), x, lineY + 5, { width: boxWidth, align: 'center' });
    doc.font('Helvetica').fillColor(MUTED).fontSize(8).text(role, x, lineY + 18, { width: boxWidth, align: 'center' });
  };

  const signRowY = doc.y;
  drawSignature(56, input.requester_signature_path, input.requester_name, 'Conformidad del solicitante');
  doc.y = signRowY;
  drawSignature(56 + boxWidth + 30, input.closer_signature_path, input.closer_name, 'Responsable que cierra');

  doc.end();
  return done;
};
