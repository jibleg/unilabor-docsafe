import PDFDocument from 'pdfkit';
import {
  loadCommitmentData, type CommitmentData, type CommitmentFilters, type RankedPerson,
} from './board-commitment.service';
import { DAY_RESULT_LABELS, LEVEL_LABELS, type CommitmentSummary } from './engine/commitment';
import { periodLabel } from './engine/periods';

/** Reporte PDF (carta horizontal) del tablero de compromiso. Sin seccion de tendencia. */

const BRAND = '#00416a';
const INK = '#1f2933';
const MUTED = '#667085';
const LINE = '#d0d5dd';
const ZEBRA = '#f4f7fa';
const LEVEL_COLORS: Record<string, string> = {
  exemplary: '#067647', committed: '#1570ef', regular: '#b54708', attention: '#b42318', no_data: MUTED,
};

const MARGIN = 30;
const ROW_H = 17;
const HEADER_H = 26;

const pctText = (value: number | null): string => (value === null ? '-' : `${value}%`);

interface Column {
  header: string;
  width: number;
  align: 'left' | 'center' | 'right';
  value: (person: RankedPerson) => string;
}

const RANKING_COLUMNS: readonly Column[] = [
  { header: 'Lugar', width: 34, align: 'center', value: (p) => String(p.place) },
  { header: 'Número', width: 52, align: 'left', value: (p) => p.employee.code },
  { header: 'Colaborador', width: 128, align: 'left', value: (p) => p.employee.fullName },
  { header: 'Sucursal', width: 116, align: 'left', value: (p) => p.employee.branchName ?? '-' },
  { header: 'Índice', width: 38, align: 'center', value: (p) => (p.summary.index === null ? '-' : String(p.summary.index)) },
  { header: 'Nivel', width: 80, align: 'left', value: (p) => LEVEL_LABELS[p.summary.level] },
  { header: 'Asistencia', width: 52, align: 'center', value: (p) => pctText(p.summary.pctAttendance) },
  { header: 'Puntualidad', width: 56, align: 'center', value: (p) => pctText(p.summary.pctPunctuality) },
  { header: 'Salidas', width: 42, align: 'center', value: (p) => pctText(p.summary.pctExits) },
  { header: 'Retardos', width: 42, align: 'center', value: (p) => String(p.summary.lates) },
  { header: 'Faltas', width: 36, align: 'center', value: (p) => String(p.summary.absences) },
  { header: 'Incidencias', width: 56, align: 'center', value: (p) => String(p.summary.incidents) },
];

const kpis = (team: CommitmentSummary, single: boolean): Array<[string, string]> => [
  [single ? 'Índice de compromiso' : 'Índice del equipo', team.index === null ? '-' : String(team.index)],
  ['Asistencia', pctText(team.pctAttendance)],
  ['Puntualidad', pctText(team.pctPunctuality)],
  ['Salidas completas', pctText(team.pctExits)],
  ['Retardos', String(team.lates)],
  ['Faltas', String(team.absences)],
  ['Incidencias', String(team.incidents)],
  ['Horas extra', String(team.overtimeHours)],
];

const drawHeader = (doc: PDFKit.PDFDocument, title: string, subtitle: string): void => {
  const width = doc.page.width - MARGIN * 2;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(18).text('UNILABOR', MARGIN, MARGIN, { lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Control de Asistencias', MARGIN, MARGIN + 21, { lineBreak: false });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(title, MARGIN, MARGIN + 2, { width, align: 'right', lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(subtitle, MARGIN, MARGIN + 21, { width, align: 'right', lineBreak: false });
  doc.moveTo(MARGIN, MARGIN + 38).lineTo(MARGIN + width, MARGIN + 38).strokeColor(BRAND).lineWidth(1.5).stroke();
  doc.y = MARGIN + 48;
};

const drawKpis = (doc: PDFKit.PDFDocument, items: Array<[string, string]>): void => {
  const width = doc.page.width - MARGIN * 2;
  const gap = 6;
  const cardW = (width - gap * (items.length - 1)) / items.length;
  const top = doc.y;
  items.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardW + gap);
    doc.roundedRect(x, top, cardW, 42, 4).fillAndStroke(ZEBRA, LINE);
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(15).text(value, x, top + 6, { width: cardW, align: 'center', lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(label, x, top + 28, { width: cardW, align: 'center', lineBreak: false });
  });
  doc.y = top + 54;
};

const cellText = (
  doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number,
  align: 'left' | 'center' | 'right', color = INK, bold = false,
): void => {
  doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
    .text(text, x + 3, y, { width: width - 6, align, height: 9, ellipsis: true });
};

/** Dibuja una tabla generica con encabezado repetido en cada pagina. */
const drawTable = <T>(
  doc: PDFKit.PDFDocument,
  headers: ReadonlyArray<{ header: string; width: number; align: 'left' | 'center' | 'right' }>,
  rows: readonly T[],
  cell: (row: T, columnIndex: number) => { text: string; color?: string; bold?: boolean },
  onNewPage: () => void,
): void => {
  const drawHeaderRow = (): void => {
    let x = MARGIN;
    const y = doc.y;
    doc.rect(MARGIN, y, headers.reduce((s, c) => s + c.width, 0), HEADER_H).fill(BRAND);
    headers.forEach((column) => {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
        .text(column.header, x + 3, y + 9, { width: column.width - 6, align: column.align === 'left' ? 'left' : 'center', lineBreak: false });
      x += column.width;
    });
    doc.y = y + HEADER_H;
  };

  drawHeaderRow();
  rows.forEach((row, rowIndex) => {
    if (doc.y + ROW_H > doc.page.height - MARGIN - 18) {
      doc.addPage();
      onNewPage();
      drawHeaderRow();
    }
    const y = doc.y;
    if (rowIndex % 2 === 1) {
      doc.rect(MARGIN, y, headers.reduce((s, c) => s + c.width, 0), ROW_H).fill(ZEBRA);
    }
    let x = MARGIN;
    headers.forEach((column, columnIndex) => {
      const { text, color, bold } = cell(row, columnIndex);
      cellText(doc, text, x, y + 5, column.width, column.align, color ?? INK, bold ?? false);
      x += column.width;
    });
    doc.y = y + ROW_H;
  });
};

const scopeText = (data: CommitmentData, filters: CommitmentFilters): string => {
  const parts: string[] = [];
  if (filters.branchId !== undefined) {
    const branch = data.allEmployees.find((e) => e.branchId === filters.branchId)?.branchName;
    parts.push(`Sucursal: ${branch ?? filters.branchId}`);
  } else {
    parts.push('Todas las sucursales');
  }
  if (filters.employeeId !== undefined) {
    const person = data.ranking[0];
    if (person) parts.push(`Colaborador: ${person.employee.fullName} (${person.employee.code})`);
  }
  return parts.join('  |  ');
};

const formatGenerated = (timeZone: string): string =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date());

export const buildCommitmentPdf = async (
  filters: CommitmentFilters,
): Promise<{ buffer: Buffer; fileName: string }> => {
  const data = await loadCommitmentData(filters);
  const label = periodLabel(data.period, data.range.from, data.range.to);
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const title = 'Compromiso de asistencia';
  const redrawHeader = (): void => drawHeader(doc, title, label);
  redrawHeader();

  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(
    `${scopeText(data, filters)}  |  Días cerrados hasta ${data.closedTo < data.range.from ? 'ninguno (el periodo aún no cierra)' : data.closedTo}`,
    MARGIN, doc.y, { lineBreak: false },
  );
  doc.y += 18;
  drawKpis(doc, kpis(data.team, filters.employeeId !== undefined));

  const detailPerson = filters.employeeId === undefined ? null : (data.ranking[0] ?? null);
  if (detailPerson) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(
      `Detalle de ${detailPerson.employee.fullName} - Índice ${detailPerson.summary.index ?? '-'} (${LEVEL_LABELS[detailPerson.summary.level]}) - racha puntual actual ${detailPerson.summary.currentStreak}, mejor ${detailPerson.summary.bestStreak}`,
      MARGIN, doc.y, { lineBreak: false },
    );
    doc.y += 16;
    const rows = data.rows.filter((r) => r.employeeId === detailPerson.employee.id);
    const dayColumns = [
      { header: 'Fecha', width: 62, align: 'center' as const },
      { header: 'Resultado', width: 96, align: 'left' as const },
      { header: 'Horario', width: 84, align: 'center' as const },
      { header: 'Entrada', width: 50, align: 'center' as const },
      { header: 'Salida', width: 50, align: 'center' as const },
      { header: 'Retardo (min)', width: 66, align: 'center' as const },
      { header: 'Anticipada (min)', width: 74, align: 'center' as const },
      { header: 'Horas', width: 44, align: 'center' as const },
      { header: 'Extra', width: 40, align: 'center' as const },
      { header: 'Falta por retardos', width: 78, align: 'center' as const },
      { header: 'Incidencia', width: 88, align: 'left' as const },
    ];
    drawTable(doc, dayColumns, rows, (row, index) => {
      const values = [
        row.workDate,
        DAY_RESULT_LABELS[row.dayResult],
        row.expectedStart && row.expectedEnd ? `${row.expectedStart} - ${row.expectedEnd}` : '-',
        row.clockInAt ?? '-',
        row.clockOutAt ?? '-',
        row.lateMinutes > 0 ? String(row.lateMinutes) : '-',
        row.earlyDepartureMinutes > 0 ? String(row.earlyDepartureMinutes) : '-',
        row.workedHours === null ? '-' : String(row.workedHours),
        row.overtimeHours > 0 ? String(row.overtimeHours) : '-',
        row.isLateAccumulationAbsence ? 'Sí' : '-',
        row.incidentName ?? '-',
      ];
      const bad = row.dayResult === 'absent' || row.isLateAccumulationAbsence;
      return { text: values[index] ?? '', ...(index === 1 && bad ? { color: '#b42318', bold: true } : {}) };
    }, redrawHeader);
  } else {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Ranking de colaboradores', MARGIN, doc.y, { lineBreak: false });
    doc.y += 14;
    drawTable(doc, RANKING_COLUMNS, data.ranking, (person, index) => {
      const column = RANKING_COLUMNS[index];
      const text = column ? column.value(person) : '';
      if (index === 5) return { text, color: LEVEL_COLORS[person.summary.level] ?? INK, bold: true };
      if (index === 4) return { text, bold: true };
      return { text };
    }, redrawHeader);
  }

  // Nota metodologica
  const noteHeight = 46;
  if (doc.y + noteHeight > doc.page.height - MARGIN - 18) {
    doc.addPage();
    redrawHeader();
  }
  doc.y += 10;
  const w = data.weights;
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text('Nota metodológica', MARGIN, doc.y, { lineBreak: false });
  doc.y += 10;
  doc.font('Helvetica').fontSize(7).text(
    `Índice = (asistencia x ${w.attendance} + puntualidad x ${w.punctuality} + salidas completas x ${w.exits}) / ${w.attendance + w.punctuality + w.exits}. ` +
      `Solo se consideran días cerrados con horario y sin incidencia autorizada. La falta por retardos acumulados cuenta como falta. ` +
      `Niveles: Ejemplar >= ${w.exemplary}; Comprometido >= ${(w.exemplary + w.attention) / 2}; Regular >= ${w.attention}; Requiere atención < ${w.attention}.`,
    MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 },
  );

  // Pie de pagina con fecha y numero de pagina.
  const range = doc.bufferedPageRange();
  const generated = formatGenerated(data.settings.timezone);
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 4;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text(`Generado el ${generated}`, MARGIN, y, { lineBreak: false })
      .text(`Página ${index + 1} de ${range.count}`, MARGIN, y, { width: doc.page.width - MARGIN * 2, align: 'right', lineBreak: false });
  }

  doc.end();
  const buffer = await done;
  return {
    buffer,
    fileName: `compromiso-asistencia_${data.range.from}_${data.range.to}${filters.employeeId === undefined ? '' : `_colaborador-${filters.employeeId}`}.pdf`,
  };
};
