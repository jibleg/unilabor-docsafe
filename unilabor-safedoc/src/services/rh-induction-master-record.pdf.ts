import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import type { RhInductionMasterRecord } from './rh-induction-master-record.service';

/**
 * Reporte de avance del Formato de Induccion (REH-REG-005), en el mismo estilo
 * pdf-lib de bloques etiqueta/valor que reading-annex.pdf.ts: es un documento
 * de evidencia/auditoria, no una constancia decorativa. NO incluye las firmas
 * de cierre (RH/Coordinador de area/Colaborador): eso procede solo cuando
 * existan las 7 fases (ver rh-induction-master-record.service.ts).
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.04, 0.13, 0.21);
const MUTED = rgb(0.42, 0.48, 0.54);
const RULE = rgb(0.87, 0.9, 0.93);

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
  if (current) lines.push(current);
  return lines;
};

const formatDate = (value: string | null): string => {
  if (!value) return 'No registrado';
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

interface Cursor {
  y: number;
}

const ensureSpace = (doc: PDFDocument, page: PDFPage, cursor: Cursor, needed: number): PDFPage => {
  if (cursor.y - needed > MARGIN) {
    return page;
  }
  const newPage = doc.addPage(A4);
  cursor.y = A4[1] - MARGIN;
  return newPage;
};

const drawLabelValue = (
  page: PDFPage,
  cursor: Cursor,
  label: string,
  value: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): void => {
  const contentWidth = A4[0] - MARGIN * 2;
  page.drawText(winAnsiSafe(label), { x: MARGIN, y: cursor.y, size: 8, font: fonts.bold, color: MUTED });
  const lines = wrapText(winAnsiSafe(value), fonts.regular, 10, contentWidth);
  let y = cursor.y - 12;
  for (const line of lines) {
    page.drawText(line, { x: MARGIN, y, size: 10, font: fonts.regular, color: INK });
    y -= 13;
  }
  cursor.y = y - 6;
};

export const buildInductionMasterRecordPdf = async (record: RhInductionMasterRecord): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contentWidth = A4[0] - MARGIN * 2;

  let page = doc.addPage(A4);
  const cursor: Cursor = { y: A4[1] - MARGIN };

  page.drawText('REPORTE DE AVANCE — FORMATO DE INDUCCIÓN (REH-REG-005)', {
    x: MARGIN,
    y: cursor.y,
    size: 13,
    font: bold,
    color: INK,
  });
  cursor.y -= 16;
  page.drawText(
    'Documento de estatus; el cierre formal con firmas procede al completar las 7 fases.',
    { x: MARGIN, y: cursor.y, size: 8, font: regular, color: MUTED },
  );
  cursor.y -= 16;
  page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: MARGIN + contentWidth, y: cursor.y }, thickness: 1, color: RULE });
  cursor.y -= 20;

  drawLabelValue(page, cursor, 'COLABORADOR', `${record.employee.full_name} (${record.employee.employee_code})`, fonts);
  drawLabelValue(
    page,
    cursor,
    'PUESTO(S) / ÁREA',
    `${record.employee.active_positions.join(', ') || record.employee.position || 'Sin puesto asignado'} — ${record.employee.area ?? 'Sin área'}`,
    fonts,
  );
  drawLabelValue(page, cursor, 'FECHA DE INICIO', formatDate(record.started_at), fonts);
  drawLabelValue(page, cursor, 'FECHA DE TÉRMINO (última fase completada)', formatDate(record.finished_at), fonts);

  cursor.y -= 4;
  page.drawText('CONTROL DE LAS 7 FASES DEL PROGRAMA DE INDUCCIÓN', { x: MARGIN, y: cursor.y, size: 10, font: bold, color: INK });
  cursor.y -= 16;

  for (const phase of record.phases) {
    page = ensureSpace(doc, page, cursor, 90);
    page.drawText(winAnsiSafe(`Fase ${phase.phase_number} — ${phase.name}`), {
      x: MARGIN,
      y: cursor.y,
      size: 9.5,
      font: bold,
      color: INK,
    });
    cursor.y -= 12;
    page.drawText(winAnsiSafe(`Responsable: ${phase.responsible_label}  ·  Supervisor: ${phase.supervisor_name ?? 'No asignado'}`), {
      x: MARGIN,
      y: cursor.y,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    cursor.y -= 12;
    const scoreText = phase.score_percentage !== null ? `${phase.score_percentage}%` : 'Sin calificación';
    page.drawText(
      winAnsiSafe(
        `Inicio: ${formatDate(phase.started_at)}  ·  Término: ${formatDate(phase.finished_at)}  ·  Calificación: ${scoreText}  ·  Estado: ${phase.status}`,
      ),
      { x: MARGIN, y: cursor.y, size: 8.5, font: regular, color: INK },
    );
    cursor.y -= 12;
    page.drawText(
      winAnsiSafe(`Checklist de contenidos: ${phase.checklist_completed}/${phase.checklist_total}`),
      { x: MARGIN, y: cursor.y, size: 8.5, font: regular, color: MUTED },
    );
    cursor.y -= 12;
    page.drawText(winAnsiSafe(`Firma del colaborador: ${phase.collaborator_signature_note}`), {
      x: MARGIN,
      y: cursor.y,
      size: 8,
      font: regular,
      color: MUTED,
    });
    cursor.y -= 11;
    page.drawText(winAnsiSafe(`Firma del responsable: ${phase.responsible_signature_note}`), {
      x: MARGIN,
      y: cursor.y,
      size: 8,
      font: regular,
      color: MUTED,
    });
    cursor.y -= 16;
    page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: MARGIN + contentWidth, y: cursor.y }, thickness: 0.5, color: RULE });
    cursor.y -= 14;
  }

  page = ensureSpace(doc, page, cursor, 120);
  page.drawText('RESULTADO DE LA INDUCCIÓN', { x: MARGIN, y: cursor.y, size: 10, font: bold, color: INK });
  cursor.y -= 16;
  drawLabelValue(page, cursor, 'Fases aprobadas', String(record.summary.approved_count), fonts);
  drawLabelValue(page, cursor, 'Fases no aprobadas', String(record.summary.not_approved_count), fonts);
  drawLabelValue(page, cursor, 'Fases pendientes', String(record.summary.pending_count), fonts);
  drawLabelValue(
    page,
    cursor,
    'Calificación media',
    record.summary.average_score !== null ? `${record.summary.average_score}%` : 'Sin calificaciones aún',
    fonts,
  );
  drawLabelValue(page, cursor, 'DICTAMEN', record.summary.verdict, fonts);
  drawLabelValue(page, cursor, 'QUÉ PROCEDE', record.summary.what_next, fonts);

  page = ensureSpace(doc, page, cursor, 100);
  page.drawText('EFICACIA DEL PROGRAMA DE INDUCCIÓN', { x: MARGIN, y: cursor.y, size: 10, font: bold, color: INK });
  cursor.y -= 16;
  if (record.effectiveness_reviews.length === 0) {
    page.drawText('Sin seguimientos de eficacia registrados todavía.', { x: MARGIN, y: cursor.y, size: 9, font: regular, color: MUTED });
    cursor.y -= 14;
  } else {
    for (const review of record.effectiveness_reviews) {
      page = ensureSpace(doc, page, cursor, 60);
      drawLabelValue(
        page,
        cursor,
        `Seguimiento del ${formatDate(review.review_date)}`,
        `Método: ${review.method}  ·  Resultado: ${review.result_percentage !== null ? `${review.result_percentage}%` : 'N/D'}  ·  ¿Desempeña conforme a lo esperado?: ${
          review.performs_as_expected === null ? 'N/D' : review.performs_as_expected ? 'Sí' : 'No'
        }`,
        fonts,
      );
      if (review.evidence_notes) {
        drawLabelValue(page, cursor, 'Evidencia objetiva', review.evidence_notes, fonts);
      }
    }
  }

  return Buffer.from(await doc.save());
};
