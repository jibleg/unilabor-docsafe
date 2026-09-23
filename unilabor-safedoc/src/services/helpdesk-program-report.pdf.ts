import PDFDocument from 'pdfkit';
import { CALENDAR_KIND_LABELS, type CalendarEvent, type CalendarSummary } from './helpdesk-service-calendar.service';

/**
 * Programa de mantenimiento del periodo en PDF (horizontal): evidencia
 * imprimible/firmable del calendario, agrupado por unidad y area.
 */

const BRAND = '#00416a';
const INK = '#1f2933';
const MUTED = '#52606d';
const LINE = '#d9e3ec';

const STATUS: Record<string, string> = {
  SCHEDULED: 'Programada',
  RESCHEDULED: 'Reprogramada',
  IN_PROGRESS: 'En ejecucion',
  PENDING_VALIDATION: 'En validacion',
  CLOSED: 'Cerrada',
  OPEN: 'Abierto',
};

const fmt = (value: string | null): string => {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'date', label: 'Fecha', width: 58 },
  { key: 'kind', label: 'Tipo', width: 92 },
  { key: 'code', label: 'Orden', width: 62 },
  { key: 'asset', label: 'Activo', width: 190 },
  { key: 'routine', label: 'Rutina', width: 130 },
  { key: 'window', label: 'Ventana', width: 92 },
  { key: 'who', label: 'Ejecutor', width: 96 },
  { key: 'resp', label: 'Responsable', width: 96 },
  { key: 'status', label: 'Estado', width: 66 },
];

export interface ProgramReportInput {
  from: string;
  to: string;
  filtersLabel: string;
  events: CalendarEvent[];
  summary: CalendarSummary;
  generatedBy: string | null;
}

export const renderProgramReportPdf = (input: ProgramReportInput): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const pageWidth = doc.page.width - 72;
  const bottom = doc.page.height - 48;

  const header = () => {
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(16).text('UNILABOR · Programa de Mantenimiento de Activos', 36, 30);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`ISO 15189:2022 6.4.5 · Periodo ${fmt(input.from)} a ${fmt(input.to)} · ${input.filtersLabel}`, 36, 50);
    doc.moveTo(36, 64).lineTo(36 + pageWidth, 64).strokeColor(BRAND).lineWidth(1.5).stroke();
    doc.y = 72;
  };
  const tableHead = () => {
    let x = 36;
    const y = doc.y;
    doc.rect(36, y - 2, pageWidth, 16).fill('#eef5fa');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(7.5);
    for (const col of COLUMNS) {
      doc.text(col.label.toUpperCase(), x + 3, y + 2, { width: col.width - 6, lineBreak: false });
      x += col.width;
    }
    doc.y = y + 16;
  };
  const ensure = (needed: number) => {
    if (doc.y + needed > bottom) {
      doc.addPage();
      header();
      tableHead();
    }
  };

  header();
  const s = input.summary;
  doc.fillColor(INK).font('Helvetica').fontSize(9).text(
    `Servicios: ${s.total} · Vencidos: ${s.overdue} · Proximos 7 dias: ${s.due_soon} · En ejecucion: ${s.in_progress} · En validacion: ${s.pending_validation} · Cerrados: ${s.closed_in_range} · Cumplimiento en ventana: ${s.compliance_pct === null ? '—' : `${s.compliance_pct}%`}`,
    36,
    doc.y,
  );
  doc.moveDown(0.8);

  const groups = new Map<string, CalendarEvent[]>();
  for (const event of input.events) {
    const key = `${event.asset.unit_name ?? 'Sin unidad'} / ${event.asset.area_name ?? 'Sin area'}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  for (const [group, events] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    ensure(40);
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(10).text(group, 36, doc.y + 4);
    doc.moveDown(0.3);
    tableHead();
    for (const event of events.sort((a, b) => a.date.localeCompare(b.date))) {
      ensure(18);
      const cells: Record<string, string> = {
        date: fmt(event.date),
        kind: CALENDAR_KIND_LABELS[event.kind] ?? event.kind,
        code: event.code,
        asset: `${event.asset.asset_code} ${event.asset.name}`,
        routine: event.plan_title ?? event.title,
        window: event.window_starts_on || event.window_ends_on ? `${fmt(event.window_starts_on)} - ${fmt(event.window_ends_on)}` : '—',
        who: event.supplier_name ?? (event.executor_kind === 'EXTERNAL_PROVIDER' ? 'Proveedor' : event.executor_kind === 'INTERNAL_OPERATOR' ? 'Operador' : 'Help Desk'),
        resp: event.asset.responsible_employee_name ?? '—',
        status: `${STATUS[event.status] ?? event.status}${event.window_state === 'OVERDUE' && event.status !== 'CLOSED' ? ' (VENCIDA)' : ''}${event.is_projected && event.status === 'SCHEDULED' ? ' *' : ''}`,
      };
      let x = 36;
      const y = doc.y;
      doc.fillColor(event.window_state === 'OVERDUE' && event.status !== 'CLOSED' ? '#b02a2a' : INK).font('Helvetica').fontSize(7.5);
      for (const col of COLUMNS) {
        doc.text(cells[col.key] ?? '', x + 3, y + 2, { width: col.width - 6, height: 12, lineBreak: false, ellipsis: true });
        x += col.width;
      }
      doc.moveTo(36, y + 15).lineTo(36 + pageWidth, y + 15).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.y = y + 16;
    }
    doc.moveDown(0.6);
  }
  if (input.events.length === 0) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('No hay servicios programados en el periodo con los filtros seleccionados.', 36, doc.y + 10);
  }

  ensure(60);
  doc.moveDown(1.5);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('* Orden proyectada automaticamente a partir de la recurrencia de la rutina; se materializa al iniciarla, reprogramarla o adjuntarle evidencia.', 36, doc.y);
  doc.moveDown(1.2);
  const sigY = doc.y;
  const signature = (x: number, label: string) => {
    doc.moveTo(x, sigY + 30).lineTo(x + 220, sigY + 30).strokeColor(INK).lineWidth(0.8).stroke();
    doc.fillColor(MUTED).fontSize(8).text(label, x, sigY + 34, { width: 220, align: 'center' });
  };
  signature(60, 'Elaboro: Coordinacion de Help Desk');
  signature(320, 'Reviso: Responsable de Calidad');
  signature(580, 'Autorizo: Direccion');
  doc.fillColor(MUTED).fontSize(7.5).text(`Generado por SafeDoc el ${new Date().toLocaleString('es-MX')}${input.generatedBy ? ` · ${input.generatedBy}` : ''}`, 36, bottom - 4, { width: pageWidth, align: 'right' });

  doc.end();
  return done;
};
