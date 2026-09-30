import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsiSafe } from './reading/reading-annex.pdf';
import {
  AUTHORIZATION_LABELS,
  DICTAMEN_LABELS,
  type CompetencyDictamen,
  type CompetencyEvaluationAction,
  type CompetencyEvaluationItem,
  type CompetencyEvaluationRecord,
} from './rh-competency-evaluation.service';

/**
 * PDF oficial del REH-REG-003 (Evaluacion de competencia tecnica, desempeno
 * laboral y conocimientos) con imagen institucional UNILABOR: portada con hero
 * navy, logo, ficha del colaborador evaluado y resumen de resultados; paginas
 * interiores con las tres secciones en tablas, resultado global ponderado
 * (50/20/30) con regla de VETO, plan de acciones y las 5 firmas embebidas.
 * Pie con folio de pagina en todas las hojas. Se archiva en el expediente.
 */

const A4: [number, number] = [595.28, 841.89];
const PAGE_W = A4[0];
const PAGE_H = A4[1];
const MARGIN = 46;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 34;
const HEADER_H = 40;

// Paleta institucional (misma que la SPA: --color-brand-*).
const NAVY = rgb(0, 0.255, 0.416); // #00416A
const BRAND_500 = rgb(0, 0.412, 0.651); // #0069A6
const BRAND_300 = rgb(0.486, 0.678, 0.827); // #7CADD3
const BRAND_100 = rgb(0.859, 0.91, 0.949); // #DBE8F2
const BRAND_50 = rgb(0.933, 0.961, 0.98); // #EEF5FA
const INK = rgb(0.09, 0.188, 0.278); // #173047
const MUTED = rgb(0.42, 0.478, 0.525); // #6B7A86
const RULE = rgb(0.87, 0.9, 0.93);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.118, 0.482, 0.31);
const GREEN_SOFT = rgb(0.902, 0.957, 0.925);
const AMBER = rgb(0.718, 0.475, 0.122);
const AMBER_SOFT = rgb(0.992, 0.953, 0.882);
const RED = rgb(0.706, 0.169, 0.22);
const RED_SOFT = rgb(0.984, 0.914, 0.922);

const CRITICALITY_VALUE: Record<string, number> = { A: 5, M: 3, B: 1 };
const CRITICALITY_LABEL: Record<string, string> = { A: 'Alta', M: 'Media', B: 'Baja' };
// Codigos de metodo del editor (mismos que la SPA); textos libres se imprimen tal cual.
const METHOD_LABEL: Record<string, string> = {
  OD: 'Observación directa',
  RR: 'Revisión de registro',
  ES: 'Examen escrito',
  EP: 'Examen práctico',
  SI: 'Simulación',
};

const EVALUATION_TYPE_LABELS: Record<string, string> = {
  INICIAL: 'Inicial (Fase 7 de Inducción)',
  PERIODICA: 'Periódica (anual)',
  REEVALUACION: 'Reevaluación',
  CAMBIO_PUESTO: 'Cambio de puesto',
  POST_CAPACITACION: 'Posterior a capacitación (eficacia)',
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

type Rgb = ReturnType<typeof rgb>;

interface Cursor {
  y: number;
}

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
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
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
};

const formatPct = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value} %`);

const resolveLogo = (): Buffer | null => {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'unilabor-logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'unilabor-logo.png'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? fs.readFileSync(found) : null;
};

const dictamenTone = (dictamen: CompetencyDictamen | null): { fill: Rgb; text: Rgb } => {
  switch (dictamen) {
    case 'COMPETENTE_Y_AUTORIZADO':
      return { fill: GREEN_SOFT, text: GREEN };
    case 'COMPETENTE_CON_OBSERVACIONES':
    case 'COMPETENTE_BAJO_SUPERVISION':
      return { fill: AMBER_SOFT, text: AMBER };
    case 'NO_COMPETENTE':
      return { fill: RED_SOFT, text: RED };
    default:
      return { fill: BRAND_50, text: NAVY };
  }
};

export const buildCompetencyEvaluationPdf = async (input: CompetencyEvaluationPdfInput): Promise<Buffer> => {
  const { record, items, actions } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`REH-REG-003 Evaluación de competencia - ${record.employee_name}`);
  doc.setAuthor('UNILABOR · SafeDoc');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = resolveLogo();
  const logo: PDFImage | null = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  const safe = (value: string): string => winAnsiSafe(value);
  const textWidth = (value: string, font: PDFFont, size: number): number => font.widthOfTextAtSize(safe(value), size);

  // ------------------------------------------------------------------ paginas
  let page: PDFPage = doc.addPage(A4);
  const cursor: Cursor = { y: PAGE_H - MARGIN };

  const drawText = (value: string, x: number, y: number, size: number, font: PDFFont, color: Rgb) => {
    page.drawText(safe(value), { x, y, size, font, color });
  };
  const drawRight = (value: string, rightX: number, y: number, size: number, font: PDFFont, color: Rgb) => {
    drawText(value, rightX - textWidth(value, font, size), y, size, font, color);
  };
  const drawCentered = (value: string, centerX: number, y: number, size: number, font: PDFFont, color: Rgb) => {
    drawText(value, centerX - textWidth(value, font, size) / 2, y, size, font, color);
  };

  /** Encabezado corto de las paginas interiores. */
  const drawPageHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: NAVY });
    const y = PAGE_H - 26;
    if (logo) {
      const scaled = logo.scaleToFit(64, 20);
      page.drawImage(logo, { x: MARGIN, y: y - 5, width: scaled.width, height: scaled.height });
      drawText('REH-REG-003 · Evaluación de competencia', MARGIN + scaled.width + 10, y, 8, bold, NAVY);
    } else {
      drawText('UNILABOR · REH-REG-003 · Evaluación de competencia', MARGIN, y, 8, bold, NAVY);
    }
    drawRight(`${record.employee_name} · ${record.position_name}`, PAGE_W - MARGIN, y, 7.5, regular, MUTED);
    page.drawLine({ start: { x: MARGIN, y: y - 9 }, end: { x: PAGE_W - MARGIN, y: y - 9 }, thickness: 0.6, color: RULE });
  };

  const newPage = () => {
    page = doc.addPage(A4);
    drawPageHeader();
    cursor.y = PAGE_H - MARGIN - HEADER_H + 14;
  };

  const ensureSpace = (needed: number) => {
    if (cursor.y - needed < MARGIN + FOOTER_H) {
      newPage();
    }
  };

  // ------------------------------------------------------------------ portada
  const HERO_H = 268;
  page.drawRectangle({ x: 0, y: PAGE_H - HERO_H, width: PAGE_W, height: HERO_H, color: NAVY });
  page.drawCircle({ x: PAGE_W - 60, y: PAGE_H - 40, size: 150, color: BRAND_500, opacity: 0.35 });
  page.drawCircle({ x: PAGE_W - 150, y: PAGE_H - HERO_H + 30, size: 90, color: BRAND_300, opacity: 0.18 });
  page.drawRectangle({ x: 0, y: PAGE_H - HERO_H - 5, width: PAGE_W, height: 5, color: BRAND_300 });

  // Logo sobre tarjeta blanca + chip de codigo.
  const logoCard = { x: MARGIN, y: PAGE_H - 34 - 58, w: 168, h: 58 };
  page.drawRectangle({ x: logoCard.x, y: logoCard.y, width: logoCard.w, height: logoCard.h, color: WHITE });
  if (logo) {
    const scaled = logo.scaleToFit(logoCard.w - 24, logoCard.h - 16);
    page.drawImage(logo, {
      x: logoCard.x + (logoCard.w - scaled.width) / 2,
      y: logoCard.y + (logoCard.h - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
  } else {
    drawCentered('UNILABOR', logoCard.x + logoCard.w / 2, logoCard.y + 22, 18, bold, NAVY);
  }
  const chip = 'REH-REG-003  ·  Rev. 1';
  const chipW = textWidth(chip, bold, 8) + 20;
  page.drawRectangle({ x: PAGE_W - MARGIN - chipW, y: PAGE_H - 34 - 20, width: chipW, height: 20, color: BRAND_500 });
  drawText(chip, PAGE_W - MARGIN - chipW + 10, PAGE_H - 34 - 14, 8, bold, WHITE);

  let heroY = PAGE_H - 140;
  drawText('REGISTRO DEL SISTEMA DE GESTIÓN DE LA CALIDAD', MARGIN, heroY, 8, bold, BRAND_300);
  heroY -= 30;
  for (const line of ['EVALUACIÓN DE COMPETENCIA', 'TÉCNICA, DESEMPEÑO LABORAL', 'Y CONOCIMIENTOS']) {
    drawText(line, MARGIN, heroY, 21, bold, WHITE);
    heroY -= 26;
  }
  heroY -= 2;
  drawText('Unidad de Laboratorio Clínico y Biología Molecular  ·  ISO 15189:2022 §6.2', MARGIN, heroY, 9, regular, BRAND_100);

  // Ficha del colaborador evaluado.
  cursor.y = PAGE_H - HERO_H - 34;
  drawText('COLABORADOR EVALUADO', MARGIN, cursor.y, 8, bold, BRAND_500);
  cursor.y -= 10;
  const cardTop = cursor.y;
  const referenceCourse = record.reference_course_title
    ? `${record.reference_course_title}${record.reference_course_date ? ` (${formatDate(record.reference_course_date)})` : ''}`
    : null;
  const referenceLines = referenceCourse ? wrapText(safe(referenceCourse), regular, 9.5, CONTENT_W - 44).slice(0, 2) : [];
  // 2 filas de datos en 2 columnas + capacitacion (ancho completo) + vigencia.
  const cardH = 72 + 2 * 32 + (referenceLines.length > 0 ? 22 + referenceLines.length * 11 : 0) + 20;
  page.drawRectangle({ x: MARGIN, y: cardTop - cardH, width: CONTENT_W, height: cardH, color: WHITE, borderColor: BRAND_100, borderWidth: 1 });
  page.drawRectangle({ x: MARGIN, y: cardTop - cardH, width: 5, height: cardH, color: BRAND_500 });
  let cy = cardTop - 26;
  const nameLines = wrapText(safe(record.employee_name), bold, 16, CONTENT_W - 40 - 90);
  drawText(nameLines[0] ?? '', MARGIN + 18, cy, 16, bold, NAVY);
  const codeChip = record.employee_code;
  const codeW = textWidth(codeChip, bold, 8) + 16;
  page.drawRectangle({ x: PAGE_W - MARGIN - 14 - codeW, y: cy - 5, width: codeW, height: 18, color: BRAND_50, borderColor: BRAND_100, borderWidth: 0.8 });
  drawText(codeChip, PAGE_W - MARGIN - 14 - codeW + 8, cy, 8, bold, NAVY);
  cy -= 16;
  drawText(record.position_name, MARGIN + 18, cy, 10.5, regular, INK);
  cy -= 22;
  page.drawLine({ start: { x: MARGIN + 18, y: cy + 8 }, end: { x: PAGE_W - MARGIN - 14, y: cy + 8 }, thickness: 0.6, color: RULE });

  const datos: Array<[string, string]> = [
    ['Tipo de evaluación', EVALUATION_TYPE_LABELS[record.evaluation_type] ?? record.evaluation_type],
    ['Fecha de evaluación', formatDate(record.evaluation_date)],
    ['Evaluador técnico', record.evaluator_name],
    ['Cierre del registro', formatDate(input.closedAt)],
  ];
  const colW = (CONTENT_W - 32) / 2;
  datos.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + 18 + col * colW;
    const y = cy - row * 32;
    drawText(label.toUpperCase(), x, y, 6.5, bold, MUTED);
    const valueLine = wrapText(safe(value), regular, 9.5, colW - 12)[0] ?? '';
    drawText(valueLine, x, y - 12, 9.5, regular, INK);
  });
  let dy = cy - 2 * 32;
  if (referenceLines.length > 0) {
    drawText('CAPACITACIÓN DE REFERENCIA', MARGIN + 18, dy, 6.5, bold, MUTED);
    referenceLines.forEach((line, lineIndex) => drawText(line, MARGIN + 18, dy - 12 - lineIndex * 11, 9.5, regular, INK));
    dy -= 22 + referenceLines.length * 11;
  }
  drawText('VIGENCIA', MARGIN + 18, dy, 6.5, bold, MUTED);
  drawText(
    input.validUntil
      ? `12 meses, hasta el ${formatDate(input.validUntil)}`
      : record.results.authorization_result === 'PENDIENTE'
        ? 'Se define al autorizar (12 meses desde la autorización)'
        : 'No aplica',
    MARGIN + 18,
    dy - 12,
    9.5,
    regular,
    INK,
  );
  cursor.y = cardTop - cardH - 20;

  // Resumen de resultados.
  drawText('RESUMEN DE RESULTADOS', MARGIN, cursor.y, 8, bold, BRAND_500);
  cursor.y -= 12;
  const boxGap = 10;
  const boxW = (CONTENT_W - boxGap * 2) / 3;
  const boxH = 54;
  const summary: Array<[string, string, number | null]> = [
    ['Competencia técnica', 'peso 50 %', record.results.competency_pct],
    ['Desempeño laboral', 'peso 20 %', record.results.performance_pct],
    ['Conocimiento', 'peso 30 %', record.results.knowledge_pct],
  ];
  summary.forEach(([title, weight, pct], index) => {
    const x = MARGIN + index * (boxW + boxGap);
    page.drawRectangle({ x, y: cursor.y - boxH, width: boxW, height: boxH, color: BRAND_50, borderColor: BRAND_100, borderWidth: 0.8 });
    drawText(title, x + 12, cursor.y - 16, 8, bold, NAVY);
    drawText(weight, x + 12, cursor.y - 27, 7, regular, MUTED);
    drawText(formatPct(pct), x + 12, cursor.y - 44, 16, bold, NAVY);
  });
  cursor.y -= boxH + 8;

  const finalH = 62;
  page.drawRectangle({ x: MARGIN, y: cursor.y - finalH, width: CONTENT_W, height: finalH, color: NAVY });
  drawText('RESULTADO FINAL PONDERADO', MARGIN + 16, cursor.y - 18, 7.5, bold, BRAND_300);
  drawText(formatPct(record.results.final_pct), MARGIN + 16, cursor.y - 48, 26, bold, WHITE);
  const tone = dictamenTone(record.results.dictamen);
  const dictamenLabel = record.results.dictamen ? DICTAMEN_LABELS[record.results.dictamen] : 'SIN DICTAMEN';
  const badgeW = textWidth(dictamenLabel, bold, 9) + 24;
  const badgeX = PAGE_W - MARGIN - 16 - badgeW;
  page.drawRectangle({ x: badgeX, y: cursor.y - 42, width: badgeW, height: 22, color: tone.fill });
  drawText(dictamenLabel, badgeX + 12, cursor.y - 35, 9, bold, tone.text);
  const authResult = record.results.authorization_result;
  const authPending = authResult === 'PENDIENTE';
  const authLabel = authResult ? AUTHORIZATION_LABELS[authResult] ?? authResult : '—';
  cursor.y -= finalH + 10;
  if (record.results.veto_applied) {
    page.drawRectangle({ x: MARGIN, y: cursor.y - 30, width: CONTENT_W, height: 30, color: RED_SOFT });
    drawText('RESTRICCIÓN OBLIGATORIA (VETO): una o más competencias de criticidad ALTA obtuvieron calificación menor a 3.', MARGIN + 12, cursor.y - 13, 7.5, bold, RED);
    drawText('El dictamen es NO COMPETENTE independientemente del porcentaje global.', MARGIN + 12, cursor.y - 24, 7.5, regular, RED);
    cursor.y -= 40;
  }
  // Tarjeta de AUTORIZACION (paso de RH / Direccion General) con diseno propio.
  const authTone =
    authResult === 'AUTORIZADO' || authResult === 'AUTORIZADO_CON_SEGUIMIENTO'
      ? { fill: GREEN_SOFT, accent: GREEN, title: authLabel }
      : authResult === 'NO_AUTORIZADO'
        ? { fill: RED_SOFT, accent: RED, title: 'NO AUTORIZADO' }
        : { fill: AMBER_SOFT, accent: AMBER, title: 'PENDIENTE DE AUTORIZACIÓN' };
  const authNoteLines = record.authorization_note ? wrapText(safe(`Nota: ${record.authorization_note}`), italic, 7.5, CONTENT_W - 96).slice(0, 2) : [];
  const authCardH = 64 + authNoteLines.length * 10;
  page.drawRectangle({ x: MARGIN, y: cursor.y - authCardH, width: CONTENT_W, height: authCardH, color: authTone.fill, borderColor: authTone.accent, borderWidth: 1 });
  page.drawRectangle({ x: MARGIN, y: cursor.y - authCardH, width: 6, height: authCardH, color: authTone.accent });
  // Icono: circulo con palomita (o guion si pendiente / cruz si no autorizado).
  const iconCx = MARGIN + 34;
  const iconCy = cursor.y - authCardH / 2;
  page.drawCircle({ x: iconCx, y: iconCy, size: 14, color: authTone.accent });
  if (authTone.accent === GREEN) {
    page.drawLine({ start: { x: iconCx - 7, y: iconCy }, end: { x: iconCx - 2, y: iconCy - 5 }, thickness: 2.4, color: WHITE });
    page.drawLine({ start: { x: iconCx - 2, y: iconCy - 5 }, end: { x: iconCx + 7, y: iconCy + 6 }, thickness: 2.4, color: WHITE });
  } else if (authTone.accent === RED) {
    page.drawLine({ start: { x: iconCx - 6, y: iconCy - 6 }, end: { x: iconCx + 6, y: iconCy + 6 }, thickness: 2.4, color: WHITE });
    page.drawLine({ start: { x: iconCx - 6, y: iconCy + 6 }, end: { x: iconCx + 6, y: iconCy - 6 }, thickness: 2.4, color: WHITE });
  } else {
    page.drawLine({ start: { x: iconCx - 6, y: iconCy }, end: { x: iconCx + 6, y: iconCy }, thickness: 2.4, color: WHITE });
  }
  const authTextX = MARGIN + 60;
  drawText('AUTORIZACIÓN DEL REGISTRO  ·  RH / DIRECCIÓN GENERAL', authTextX, cursor.y - 16, 7, bold, authTone.accent);
  drawText(authTone.title, authTextX, cursor.y - 32, 14, bold, authTone.accent);
  const authDetail = authPending
    ? 'Pendiente: la decisión la registra RH o Dirección General en la plataforma. La vigencia se fija al autorizar.'
    : `${record.authorized_by_name ? `Autorizó: ${record.authorized_by_name}   ·   ` : ''}Fecha: ${formatDate(input.authorizedAt)}${input.validUntil ? `   ·   Vigente hasta el ${formatDate(input.validUntil)}` : ''}`;
  drawText(wrapText(safe(authDetail), regular, 8, CONTENT_W - 96)[0] ?? '', authTextX, cursor.y - 46, 8, regular, INK);
  authNoteLines.forEach((line, index) => drawText(line, authTextX, cursor.y - 57 - index * 10, 7.5, italic, MUTED));
  cursor.y -= authCardH + 8;
  drawText('Fórmula: Competencia x 0.50 + Desempeño x 0.20 + Conocimiento x 0.30. Escala de calificación 1-4 ponderada por criticidad (Alta 5, Media 3, Baja 1).', MARGIN, cursor.y - 4, 7, italic, MUTED);

  // ------------------------------------------------------------- secciones
  newPage();

  const sectionBand = (title: string, right: string) => {
    ensureSpace(60);
    cursor.y -= 6;
    page.drawRectangle({ x: MARGIN, y: cursor.y - 22, width: CONTENT_W, height: 22, color: NAVY });
    drawText(title, MARGIN + 10, cursor.y - 15, 9.5, bold, WHITE);
    drawRight(right, PAGE_W - MARGIN - 10, cursor.y - 15, 8, regular, BRAND_100);
    cursor.y -= 22;
  };

  interface Column {
    label: string;
    width: number;
    align?: 'left' | 'right' | 'center';
  }

  const tableHeader = (columns: Column[]) => {
    page.drawRectangle({ x: MARGIN, y: cursor.y - 16, width: CONTENT_W, height: 16, color: BRAND_100 });
    let x = MARGIN;
    for (const column of columns) {
      const label = column.label;
      if (column.align === 'right') drawRight(label, x + column.width - 6, cursor.y - 11, 7, bold, NAVY);
      else if (column.align === 'center') drawCentered(label, x + column.width / 2, cursor.y - 11, 7, bold, NAVY);
      else drawText(label, x + 6, cursor.y - 11, 7, bold, NAVY);
      x += column.width;
    }
    cursor.y -= 16;
  };

  const sections: Array<{ key: CompetencyEvaluationItem['section']; title: string; weight: string; pct: number | null }> = [
    { key: 'COMPETENCIA', title: '1 · EVALUACIÓN DE COMPETENCIA TÉCNICA', weight: '50 %', pct: record.results.competency_pct },
    { key: 'DESEMPENO', title: '2 · EVALUACIÓN DE DESEMPEÑO LABORAL', weight: '20 %', pct: record.results.performance_pct },
    { key: 'CONOCIMIENTO', title: '3 · EVALUACIÓN DE CONOCIMIENTO', weight: '30 %', pct: record.results.knowledge_pct },
  ];

  for (const section of sections) {
    const sectionItems = items.filter((item) => item.section === section.key);
    const knowledge = section.key === 'CONOCIMIENTO';
    const columns: Column[] = knowledge
      ? [
          { label: '#', width: 22, align: 'center' },
          { label: 'PREGUNTA', width: CONTENT_W - 22 - 64 - 58 - 50 },
          { label: 'RESULTADO', width: 64, align: 'center' },
          { label: 'CRITICIDAD', width: 58, align: 'center' },
          { label: 'PUNTAJE', width: 50, align: 'right' },
        ]
      : [
          { label: '#', width: 22, align: 'center' },
          { label: 'ÍTEM EVALUADO', width: CONTENT_W - 22 - 40 - 58 - 92 - 50 },
          { label: 'CALIF.', width: 40, align: 'center' },
          { label: 'CRITICIDAD', width: 58, align: 'center' },
          { label: 'MÉTODO', width: 92 },
          { label: 'PUNTAJE', width: 50, align: 'right' },
        ];

    const col = (index: number): Column => columns[index] as Column;
    sectionBand(section.title, `Peso ${section.weight}   ·   Resultado ${formatPct(section.pct)}`);
    tableHeader(columns);

    sectionItems.forEach((item, index) => {
      const value = CRITICALITY_VALUE[item.criticality] ?? 0;
      const score = knowledge ? (item.is_correct === null ? null : item.is_correct ? 4 : 1) : item.score;
      const points = score !== null && score !== undefined ? score * value : null;
      const vetoHit = section.key === 'COMPETENCIA' && item.criticality === 'A' && score !== null && score !== undefined && score < 3;

      const textLines = wrapText(safe(item.item_text), regular, 8.5, col(1).width - 12);
      const methodLabel = item.method ? METHOD_LABEL[item.method.trim().toUpperCase()] ?? item.method : '—';
      const methodLines = knowledge ? [] : wrapText(safe(methodLabel), regular, 7.5, col(4).width - 10);
      const obsLines = item.observations ? wrapText(safe(`Obs.: ${item.observations}`), italic, 7.5, CONTENT_W - 40) : [];
      const bodyLines = Math.max(textLines.length, methodLines.length);
      const rowH = 8 + bodyLines * 10.5 + (obsLines.length > 0 ? obsLines.length * 9.5 + 2 : 0) + (vetoHit ? 11 : 0);

      if (cursor.y - rowH < MARGIN + FOOTER_H) {
        newPage();
        sectionBand(`${section.title} (continúa)`, `Peso ${section.weight}   ·   Resultado ${formatPct(section.pct)}`);
        tableHeader(columns);
      }
      if (index % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: cursor.y - rowH, width: CONTENT_W, height: rowH, color: BRAND_50 });
      }
      const baseline = cursor.y - 13;
      let x = MARGIN;
      drawCentered(String(index + 1), x + col(0).width / 2, baseline, 8, bold, MUTED);
      x += col(0).width;
      textLines.forEach((line, lineIndex) => drawText(line, x + 6, baseline - lineIndex * 10.5, 8.5, regular, INK));
      x += col(1).width;
      if (knowledge) {
        const resultLabel = item.is_correct === null || item.is_correct === undefined ? 'Sin calificar' : item.is_correct ? 'Correcta' : 'Incorrecta';
        const resultColor = item.is_correct === null || item.is_correct === undefined ? MUTED : item.is_correct ? GREEN : RED;
        drawCentered(resultLabel, x + col(2).width / 2, baseline, 8, bold, resultColor);
        x += col(2).width;
        drawCentered(`${CRITICALITY_LABEL[item.criticality] ?? item.criticality} (${value})`, x + col(3).width / 2, baseline, 7.5, regular, INK);
        x += col(3).width;
        drawRight(points === null ? '—' : String(points), x + col(4).width - 6, baseline, 8.5, bold, NAVY);
      } else {
        drawCentered(score === null || score === undefined ? '—' : `${score} / 4`, x + col(2).width / 2, baseline, 8.5, bold, vetoHit ? RED : NAVY);
        x += col(2).width;
        drawCentered(`${CRITICALITY_LABEL[item.criticality] ?? item.criticality} (${value})`, x + col(3).width / 2, baseline, 7.5, regular, INK);
        x += col(3).width;
        methodLines.forEach((line, lineIndex) => drawText(line, x + 5, baseline - lineIndex * 10.5, 7.5, regular, MUTED));
        x += col(4).width;
        drawRight(points === null ? '—' : String(points), x + col(5).width - 6, baseline, 8.5, bold, NAVY);
      }
      let extraY = baseline - bodyLines * 10.5 + 1;
      if (vetoHit) {
        drawText('VETO: competencia de criticidad ALTA con calificación menor a 3.', MARGIN + col(0).width + 6, extraY, 7.5, bold, RED);
        extraY -= 11;
      }
      obsLines.forEach((line) => {
        drawText(line, MARGIN + col(0).width + 6, extraY, 7.5, italic, MUTED);
        extraY -= 9.5;
      });
      cursor.y -= rowH;
    });

    if (sectionItems.length === 0) {
      ensureSpace(20);
      drawText('Sin ítems registrados en esta sección.', MARGIN + 6, cursor.y - 12, 8, italic, MUTED);
      cursor.y -= 18;
    }
    ensureSpace(24);
    page.drawLine({ start: { x: MARGIN, y: cursor.y - 2 }, end: { x: PAGE_W - MARGIN, y: cursor.y - 2 }, thickness: 0.8, color: BRAND_300 });
    drawRight(`Resultado de la sección: ${formatPct(section.pct)}`, PAGE_W - MARGIN - 6, cursor.y - 15, 9, bold, NAVY);
    cursor.y -= 30;
  }

  // ------------------------------------------------------ resultado global
  ensureSpace(120);
  sectionBand('RESULTADO GLOBAL PONDERADO', 'Regla 50 / 20 / 30');
  const globalH = (record.results.veto_applied ? 112 : 94) + (record.authorization_note ? 14 : 0);
  page.drawRectangle({ x: MARGIN, y: cursor.y - globalH, width: CONTENT_W, height: globalH, color: BRAND_50, borderColor: BRAND_100, borderWidth: 0.8 });
  let gy = cursor.y - 18;
  drawText(
    `Competencia ${formatPct(record.results.competency_pct)} x 0.50   +   Desempeño ${formatPct(record.results.performance_pct)} x 0.20   +   Conocimiento ${formatPct(record.results.knowledge_pct)} x 0.30`,
    MARGIN + 12,
    gy,
    8.5,
    regular,
    INK,
  );
  gy -= 24;
  drawText('RESULTADO FINAL', MARGIN + 12, gy, 7, bold, MUTED);
  drawText(formatPct(record.results.final_pct), MARGIN + 12, gy - 18, 16, bold, NAVY);
  const badge2W = textWidth(dictamenLabel, bold, 8.5) + 20;
  page.drawRectangle({ x: MARGIN + 150, y: gy - 20, width: badge2W, height: 20, color: tone.fill });
  drawText(dictamenLabel, MARGIN + 160, gy - 14, 8.5, bold, tone.text);
  const authText = `Autorización: ${authLabel}`;
  const authX = MARGIN + 150 + badge2W + 14;
  const authFits = authX + textWidth(authText, bold, 8.5) <= PAGE_W - MARGIN - 12;
  drawText(authText, authFits ? authX : MARGIN + 12, authFits ? gy - 14 : gy - 26, 8.5, bold, authPending ? AMBER : INK);
  drawText(
    authPending
      ? 'Pendiente de autorización por RH o Dirección General. La vigencia (12 meses) se fija al autorizar.'
      : `Decisión: ${formatDate(input.authorizedAt)}${record.authorized_by_name ? `  ·  Por: ${record.authorized_by_name}` : ''}   ·   Vigencia: ${input.validUntil ? `12 meses, hasta el ${formatDate(input.validUntil)}` : 'No aplica'}`,
    MARGIN + 12,
    gy - 38,
    8,
    regular,
    MUTED,
  );
  if (record.authorization_note) {
    drawText(wrapText(safe(`Nota de autorización: ${record.authorization_note}`), italic, 7.5, CONTENT_W - 24)[0] ?? '', MARGIN + 12, gy - 52, 7.5, italic, MUTED);
  }
  if (record.results.veto_applied) {
    drawText(
      'VETO aplicado: una o más competencias de criticidad ALTA con calificación menor a 3; el dictamen es NO COMPETENTE sin importar el porcentaje.',
      MARGIN + 12,
      gy - 56 - (record.authorization_note ? 14 : 0),
      7.5,
      bold,
      RED,
    );
  }
  cursor.y -= globalH + 14;

  // ------------------------------------------------------- plan de acciones
  ensureSpace(70);
  sectionBand('PLAN DE ACCIONES', 'Capacitación · mejora · reentrenamiento');
  if (actions.length === 0) {
    drawText('Sin acciones requeridas: el dictamen no exige plan de acciones.', MARGIN + 6, cursor.y - 14, 8.5, italic, MUTED);
    cursor.y -= 26;
  } else {
    const actionColumns: Column[] = [
      { label: '#', width: 22, align: 'center' },
      { label: 'ÁREA DE MEJORA', width: 100 },
      { label: 'ACCIÓN REQUERIDA', width: CONTENT_W - 22 - 100 - 82 - 62 - 92 },
      { label: 'RESPONSABLE', width: 82 },
      { label: 'COMPROMISO', width: 62, align: 'center' },
      { label: 'SEGUIMIENTO', width: 92 },
    ];
    const acol = (index: number): Column => actionColumns[index] as Column;
    tableHeader(actionColumns);
    actions.forEach((action, index) => {
      const cells = [
        wrapText(safe(action.improvement_area), regular, 8, acol(1).width - 10),
        wrapText(safe(action.required_action), regular, 8, acol(2).width - 10),
        wrapText(safe(action.responsible ?? '—'), regular, 8, acol(3).width - 10),
        [formatDate(action.due_date)],
        wrapText(safe(action.follow_up ?? '—'), regular, 8, acol(5).width - 10),
      ];
      const lines = Math.max(...cells.map((cell) => cell.length));
      const rowH = 8 + lines * 10;
      if (cursor.y - rowH < MARGIN + FOOTER_H) {
        newPage();
        sectionBand('PLAN DE ACCIONES (continúa)', '');
        tableHeader(actionColumns);
      }
      if (index % 2 === 0) page.drawRectangle({ x: MARGIN, y: cursor.y - rowH, width: CONTENT_W, height: rowH, color: BRAND_50 });
      const baseline = cursor.y - 13;
      let x = MARGIN;
      drawCentered(String(index + 1), x + acol(0).width / 2, baseline, 8, bold, MUTED);
      x += acol(0).width;
      cells.forEach((cell, cellIndex) => {
        const column = acol(cellIndex + 1);
        cell.forEach((line, lineIndex) => {
          if (column.align === 'center') drawCentered(line, x + column.width / 2, baseline - lineIndex * 10, 8, regular, INK);
          else drawText(line, x + 5, baseline - lineIndex * 10, 8, regular, INK);
        });
        x += column.width;
      });
      cursor.y -= rowH;
    });
    cursor.y -= 12;
  }

  // ----------------------------------------------------------------- firmas
  const signatureBlocks: Array<{ png: Buffer; name: string; role: string }> = [
    { png: input.signaturePngs.collaborator, name: input.signatories.collaboratorName, role: 'Colaborador evaluado' },
    { png: input.signaturePngs.evaluator, name: input.signatories.evaluatorName, role: 'Evaluador técnico' },
    { png: input.signaturePngs.area, name: input.signatories.areaName, role: 'Coordinador del área' },
    { png: input.signaturePngs.rh, name: input.signatories.rhName, role: 'Coordinador de Recursos Humanos' },
    { png: input.signaturePngs.director, name: input.signatories.directorName, role: 'Director General' },
  ];
  ensureSpace(262);
  sectionBand('FIRMAS', 'Firma autógrafa capturada en la plataforma');
  cursor.y -= 8;
  const columnWidth = CONTENT_W / 3;
  const drawSignatureRow = async (blocks: typeof signatureBlocks, topY: number, offsetColumns = 0) => {
    for (const [index, block] of blocks.entries()) {
      const x = MARGIN + (index + offsetColumns) * columnWidth;
      const boxW = columnWidth - 18;
      const boxH = 46;
      page.drawRectangle({ x, y: topY - boxH, width: boxW, height: boxH, color: WHITE, borderColor: BRAND_100, borderWidth: 0.6 });
      const signature = await doc.embedPng(block.png);
      const scaled = signature.scaleToFit(boxW - 12, boxH - 10);
      page.drawImage(signature, { x: x + (boxW - scaled.width) / 2, y: topY - boxH + (boxH - scaled.height) / 2, width: scaled.width, height: scaled.height });
      const lineY = topY - boxH - 6;
      page.drawLine({ start: { x, y: lineY }, end: { x: x + boxW, y: lineY }, thickness: 0.9, color: NAVY });
      let y = lineY - 11;
      for (const line of wrapText(safe(block.name), bold, 8, boxW).slice(0, 2)) {
        drawText(line, x, y, 8, bold, INK);
        y -= 10;
      }
      drawText(block.role, x, y, 7, regular, MUTED);
    }
    return topY - 108;
  };
  cursor.y = await drawSignatureRow(signatureBlocks.slice(0, 3), cursor.y);
  cursor.y = await drawSignatureRow(signatureBlocks.slice(3), cursor.y, 0);

  // Sello de autorizacion junto a la segunda fila de firmas (columna libre).
  if (!authPending && authResult) {
    const stampColor = authResult === 'NO_AUTORIZADO' ? RED : GREEN;
    const stampW = columnWidth - 18;
    const stampH = 74;
    const stampX = MARGIN + 2 * columnWidth + 4;
    const stampY = cursor.y + 108 - stampH - 6;
    const tilt = degrees(-5);
    page.drawRectangle({ x: stampX, y: stampY, width: stampW, height: stampH, borderColor: stampColor, borderWidth: 2, rotate: tilt, opacity: 0.9, borderOpacity: 0.9 });
    page.drawRectangle({ x: stampX + 4, y: stampY + 4, width: stampW - 8, height: stampH - 8, borderColor: stampColor, borderWidth: 0.8, rotate: tilt, borderOpacity: 0.9 });
    const stampTitle = authResult === 'AUTORIZADO_CON_SEGUIMIENTO' ? 'AUTORIZADO' : authLabel;
    const titleSize = 15;
    page.drawText(safe(stampTitle), { x: stampX + (stampW - textWidth(stampTitle, bold, titleSize)) / 2 + 2, y: stampY + stampH - 26, size: titleSize, font: bold, color: stampColor, rotate: tilt, opacity: 0.9 });
    if (authResult === 'AUTORIZADO_CON_SEGUIMIENTO') {
      page.drawText('CON SEGUIMIENTO', { x: stampX + (stampW - textWidth('CON SEGUIMIENTO', bold, 7.5)) / 2 + 1, y: stampY + stampH - 38, size: 7.5, font: bold, color: stampColor, rotate: tilt, opacity: 0.9 });
    }
    const stampLines = [
      `${formatDate(input.authorizedAt)} · RH / Dirección General`,
      record.authorized_by_name ? wrapText(safe(record.authorized_by_name), regular, 6.5, stampW - 24)[0] ?? '' : 'Plataforma SafeDoc',
    ];
    stampLines.forEach((line, index) => {
      page.drawText(safe(line), { x: stampX + (stampW - textWidth(line, regular, 6.5)) / 2, y: stampY + 20 - index * 9, size: 6.5, font: regular, color: stampColor, rotate: tilt, opacity: 0.9 });
    });
  }
  ensureSpace(30);
  for (const line of wrapText(
    safe(
      `Registro cerrado el ${formatDate(input.closedAt)}. Conservar conforme al procedimiento de gestión de registros del laboratorio. Firmas autógrafas capturadas y verificadas en la Plataforma UNILABOR SafeDoc.`,
    ),
    italic,
    7,
    CONTENT_W,
  )) {
    drawText(line, MARGIN, cursor.y - 4, 7, italic, MUTED);
    cursor.y -= 9.5;
  }

  // ------------------------------------------------------------------- pie
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    page = current;
    const y = 22;
    page.drawLine({ start: { x: MARGIN, y: y + 12 }, end: { x: PAGE_W - MARGIN, y: y + 12 }, thickness: 0.6, color: RULE });
    drawText(`UNILABOR  ·  Plataforma SafeDoc  ·  REH-REG-003 Rev. 1  ·  ${record.employee_name}  ·  Cerrada el ${formatDate(input.closedAt)}`, MARGIN, y, 6.8, regular, MUTED);
    drawRight(`Página ${index + 1} de ${pages.length}`, PAGE_W - MARGIN, y, 6.8, bold, NAVY);
  });

  return Buffer.from(await doc.save());
};
