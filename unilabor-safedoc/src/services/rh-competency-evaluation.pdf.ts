import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import {
  AUTHORIZATION_LABELS,
  DICTAMEN_LABELS,
  type CompetencyEvaluationAction,
  type CompetencyEvaluationItem,
  type CompetencyEvaluationRecord,
} from './rh-competency-evaluation.service';

/**
 * PDF oficial del REH-REG-003 (Evaluacion de competencia tecnica, desempeno
 * laboral y conocimientos), mismo estilo pdf-lib de evidencia/auditoria que el
 * Formato de Induccion. Tres secciones con sus items y puntajes, resultado
 * global ponderado (50/20/30), regla de VETO, plan de acciones, vigencia de 12
 * meses y las 5 firmas embebidas.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.04, 0.13, 0.21);
const MUTED = rgb(0.42, 0.48, 0.54);
const RULE = rgb(0.87, 0.9, 0.93);
const ALERT = rgb(0.75, 0.16, 0.22);

const CRITICALITY_VALUE: Record<string, number> = { A: 5, M: 3, B: 1 };

interface Cursor {
  y: number;
}

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

const formatDate = (value: Date | string | null): string => {
  if (!value) return '—';
  // Fechas date-only (YYYY-MM-DD) se formatean sin pasar por Date para no
  // correrse un dia por zona horaria (UTC midnight -> dia anterior en MX).
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ensureSpace = (doc: PDFDocument, page: PDFPage, cursor: Cursor, needed: number): PDFPage => {
  if (cursor.y - needed > MARGIN) {
    return page;
  }
  const newPage = doc.addPage(A4);
  cursor.y = A4[1] - MARGIN;
  return newPage;
};

export interface CompetencyEvaluationPdfInput {
  record: CompetencyEvaluationRecord;
  items: CompetencyEvaluationItem[];
  actions: CompetencyEvaluationAction[];
  closedAt: Date;
  authorizedAt: Date | null;
  validUntil: Date | null;
  signatories: {
    collaboratorName: string;
    evaluatorName: string;
    areaName: string;
    rhName: string;
    directorName: string;
  };
  signaturePngs: {
    collaborator: Buffer;
    evaluator: Buffer;
    area: Buffer;
    rh: Buffer;
    director: Buffer;
  };
}

const EVALUATION_TYPE_LABELS: Record<string, string> = {
  INICIAL: 'Inicial (Fase 7 de Inducción)',
  PERIODICA: 'Periódica (anual)',
  REEVALUACION: 'Reevaluación',
  CAMBIO_PUESTO: 'Cambio de puesto',
  POST_CAPACITACION: 'Posterior a capacitación (eficacia)',
};

export const buildCompetencyEvaluationPdf = async (input: CompetencyEvaluationPdfInput): Promise<Buffer> => {
  const { record, items, actions } = input;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4[0] - MARGIN * 2;

  let page = doc.addPage(A4);
  const cursor: Cursor = { y: A4[1] - MARGIN };

  const text = (value: string, size: number, options: { font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    page.drawText(winAnsiSafe(value), {
      x: options.x ?? MARGIN,
      y: cursor.y,
      size,
      font: options.font ?? regular,
      color: options.color ?? INK,
    });
  };

  const paragraph = (value: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>) => {
    for (const line of wrapText(winAnsiSafe(value), font, size, contentWidth)) {
      page = ensureSpace(doc, page, cursor, size + 6);
      page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
      cursor.y -= size + 3.5;
    }
  };

  const rule = (thickness = 0.7) => {
    page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: MARGIN + contentWidth, y: cursor.y }, thickness, color: RULE });
    cursor.y -= 12;
  };

  // --- Encabezado oficial ---
  text('EVALUACIÓN DE COMPETENCIA TÉCNICA, DESEMPEÑO LABORAL', 12.5, { font: bold });
  cursor.y -= 15;
  text('Y CONOCIMIENTOS (REH-REG-003)', 12.5, { font: bold });
  // El rotulo va en la segunda linea del titulo (la corta) para no encimarse.
  page.drawText('Código: REH-REG-003  ·  No. de revisión: 1', {
    x: MARGIN + contentWidth - 180,
    y: cursor.y,
    size: 7.5,
    font: regular,
    color: MUTED,
  });
  cursor.y -= 16;
  rule(1);

  // --- Datos generales ---
  const dato = (label: string, value: string) => {
    page = ensureSpace(doc, page, cursor, 26);
    page.drawText(winAnsiSafe(label), { x: MARGIN, y: cursor.y, size: 7.5, font: bold, color: MUTED });
    cursor.y -= 11;
    page.drawText(winAnsiSafe(value), { x: MARGIN, y: cursor.y, size: 9.5, font: regular, color: INK });
    cursor.y -= 15;
  };

  dato('COLABORADOR', `${record.employee_name} (${record.employee_code})`);
  dato('PUESTO', record.position_name);
  dato('TIPO DE EVALUACIÓN', EVALUATION_TYPE_LABELS[record.evaluation_type] ?? record.evaluation_type);
  dato('FECHA DE EVALUACIÓN', formatDate(record.evaluation_date));
  dato('EVALUADOR', record.evaluator_name);
  if (record.reference_course_title) {
    dato(
      'CAPACITACIÓN DE REFERENCIA',
      `${record.reference_course_title}${record.reference_course_date ? ` (${formatDate(record.reference_course_date)})` : ''}`,
    );
  }

  // --- Secciones con items ---
  const sections: Array<{ key: CompetencyEvaluationItem['section']; title: string; weight: string; pct: number | null }> = [
    { key: 'COMPETENCIA', title: '1. EVALUACIÓN DE COMPETENCIA', weight: '50%', pct: record.results.competency_pct },
    { key: 'DESEMPENO', title: '2. EVALUACIÓN DE DESEMPEÑO', weight: '20%', pct: record.results.performance_pct },
    { key: 'CONOCIMIENTO', title: '3. EVALUACIÓN DE CONOCIMIENTO', weight: '30%', pct: record.results.knowledge_pct },
  ];

  for (const section of sections) {
    const sectionItems = items.filter((item) => item.section === section.key);
    page = ensureSpace(doc, page, cursor, 40);
    cursor.y -= 4;
    text(`${section.title}  ·  peso ${section.weight}`, 10, { font: bold });
    cursor.y -= 15;

    for (const [index, item] of sectionItems.entries()) {
      page = ensureSpace(doc, page, cursor, 34);
      const value = CRITICALITY_VALUE[item.criticality] ?? 0;
      const score = section.key === 'CONOCIMIENTO' ? (item.is_correct === null ? null : item.is_correct ? 4 : 1) : item.score;
      const points = score !== null && score !== undefined ? score * value : null;

      const headLine = `${index + 1}. ${item.item_text}`;
      for (const line of wrapText(winAnsiSafe(headLine), regular, 9, contentWidth - 150)) {
        page = ensureSpace(doc, page, cursor, 12);
        page.drawText(line, { x: MARGIN, y: cursor.y, size: 9, font: regular, color: INK });
        cursor.y -= 11;
      }
      cursor.y += 11;
      const detail =
        section.key === 'CONOCIMIENTO'
          ? `${item.is_correct === null ? 'Sin calificar' : item.is_correct ? 'Correcta' : 'Incorrecta'}  ·  Crit. ${item.criticality} (${value})  ·  Puntaje: ${points ?? '—'}`
          : `Calif. ${score ?? '—'}/4  ·  Crit. ${item.criticality} (${value})${item.method ? `  ·  Método: ${item.method}` : ''}  ·  Puntaje: ${points ?? '—'}`;
      page.drawText(winAnsiSafe(detail), {
        x: MARGIN + contentWidth - 245,
        y: cursor.y,
        size: 7.5,
        font: regular,
        color: MUTED,
      });
      cursor.y -= 11;
      const vetoHit = section.key === 'COMPETENCIA' && item.criticality === 'A' && score !== null && score !== undefined && score < 3;
      if (vetoHit) {
        page = ensureSpace(doc, page, cursor, 12);
        page.drawText(winAnsiSafe('VETO: competencia de criticidad ALTA con calificación menor a 3.'), {
          x: MARGIN + 10,
          y: cursor.y,
          size: 7.5,
          font: bold,
          color: ALERT,
        });
        cursor.y -= 11;
      }
      if (item.observations) {
        for (const line of wrapText(winAnsiSafe(`Obs.: ${item.observations}`), regular, 7.5, contentWidth - 20)) {
          page = ensureSpace(doc, page, cursor, 11);
          page.drawText(line, { x: MARGIN + 10, y: cursor.y, size: 7.5, font: regular, color: MUTED });
          cursor.y -= 10;
        }
      }
      cursor.y -= 3;
    }

    page = ensureSpace(doc, page, cursor, 20);
    text(`RESULTADO DE LA SECCIÓN: ${section.pct !== null ? `${section.pct}%` : '—'}`, 9, { font: bold });
    cursor.y -= 14;
    rule(0.5);
  }

  // --- Resultado global ---
  page = ensureSpace(doc, page, cursor, 120);
  cursor.y -= 2;
  text('RESULTADO GLOBAL PONDERADO', 10, { font: bold });
  cursor.y -= 14;
  paragraph(
    `Competencia ${record.results.competency_pct ?? '—'}% x 0.50  +  Desempeño ${record.results.performance_pct ?? '—'}% x 0.20  +  Conocimiento ${record.results.knowledge_pct ?? '—'}% x 0.30`,
    9,
    regular,
    INK,
  );
  cursor.y -= 2;
  text(`RESULTADO FINAL: ${record.results.final_pct ?? '—'}%`, 11, { font: bold });
  cursor.y -= 16;
  if (record.results.veto_applied) {
    paragraph(
      'RESTRICCIÓN OBLIGATORIA APLICADA (VETO): una o más competencias de criticidad ALTA obtuvieron calificación menor a 3; el dictamen es NO COMPETENTE independientemente del porcentaje global.',
      8.5,
      bold,
      ALERT,
    );
    cursor.y -= 2;
  }
  text(`DICTAMEN: ${record.results.dictamen ? DICTAMEN_LABELS[record.results.dictamen] : '—'}`, 10.5, { font: bold });
  cursor.y -= 14;
  text(
    `AUTORIZACIÓN: ${record.results.authorization_result ? AUTHORIZATION_LABELS[record.results.authorization_result] ?? record.results.authorization_result : '—'}`,
    9.5,
    { font: bold },
  );
  cursor.y -= 14;
  text(
    `Fecha de autorización: ${formatDate(input.authorizedAt)}  ·  Vigencia: ${input.validUntil ? `12 meses, hasta el ${formatDate(input.validUntil)}` : 'No aplica'}`,
    8.5,
    { color: MUTED },
  );
  cursor.y -= 16;

  // --- Plan de acciones ---
  if (actions.length > 0) {
    page = ensureSpace(doc, page, cursor, 40);
    text('PLAN DE ACCIONES (capacitación / mejora / reentrenamiento)', 10, { font: bold });
    cursor.y -= 14;
    for (const [index, action] of actions.entries()) {
      paragraph(
        `${index + 1}. ${action.improvement_area} - ${action.required_action}` +
          `${action.responsible ? `  ·  Responsable: ${action.responsible}` : ''}` +
          `${action.due_date ? `  ·  Compromiso: ${formatDate(action.due_date)}` : ''}` +
          `${action.follow_up ? `  ·  Seguimiento: ${action.follow_up}` : ''}`,
        8.5,
        regular,
        INK,
      );
    }
    cursor.y -= 6;
  }

  // --- Firmas (5, en 2 filas: 3 + 2) ---
  const signatureBlocks: Array<{ png: Buffer; name: string; role: string }> = [
    { png: input.signaturePngs.collaborator, name: input.signatories.collaboratorName, role: 'Colaborador evaluado' },
    { png: input.signaturePngs.evaluator, name: input.signatories.evaluatorName, role: 'Evaluador técnico' },
    { png: input.signaturePngs.area, name: input.signatories.areaName, role: 'Coordinador del área' },
    { png: input.signaturePngs.rh, name: input.signatories.rhName, role: 'Coordinador de RH' },
    { png: input.signaturePngs.director, name: input.signatories.directorName, role: 'Director General' },
  ];

  page = ensureSpace(doc, page, cursor, 260);
  text('FIRMAS', 10, { font: bold });
  cursor.y -= 12;

  const columnWidth = contentWidth / 3;
  const drawSignatureRow = async (blocks: typeof signatureBlocks, topY: number) => {
    for (const [index, block] of blocks.entries()) {
      const x = MARGIN + index * columnWidth;
      const signature = await doc.embedPng(block.png);
      const box = { width: columnWidth - 18, height: 44 };
      const scaled = signature.scaleToFit(box.width, box.height);
      page.drawImage(signature, {
        x: x + (box.width - scaled.width) / 2,
        y: topY - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      const lineY = topY - box.height - 5;
      page.drawLine({ start: { x, y: lineY }, end: { x: x + box.width, y: lineY }, thickness: 0.9, color: INK });
      let y = lineY - 11;
      for (const line of wrapText(winAnsiSafe(block.name), bold, 8, box.width).slice(0, 2)) {
        page.drawText(line, { x, y, size: 8, font: bold, color: INK });
        y -= 10;
      }
      page.drawText(winAnsiSafe(block.role), { x, y, size: 7, font: regular, color: MUTED });
    }
    return topY - 105;
  };

  cursor.y = await drawSignatureRow(signatureBlocks.slice(0, 3), cursor.y);
  page = ensureSpace(doc, page, cursor, 120);
  cursor.y = await drawSignatureRow(signatureBlocks.slice(3), cursor.y);

  page = ensureSpace(doc, page, cursor, 20);
  text(
    `Cerrada el ${formatDate(input.closedAt)}. Conservar conforme al procedimiento de gestión de registros del laboratorio.`,
    7.5,
    { color: MUTED },
  );

  return Buffer.from(await doc.save());
};
