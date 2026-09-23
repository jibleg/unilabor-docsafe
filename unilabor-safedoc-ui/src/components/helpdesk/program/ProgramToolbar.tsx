import { BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Download, FileDown, List, Loader2, Printer, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import type { CalendarViewMode } from '../../../types/helpdesk-program';

interface ProgramToolbarProps {
  title: string;
  viewMode: CalendarViewMode;
  onViewChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  mine: boolean;
  onToggleMine: () => void;
  onReload: () => void;
  onExportIcs: () => void;
  onPrint: () => void;
  onOpenCoverage: () => void;
  onOpenKpis: () => void;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
  loading: boolean;
}

const VIEWS: Array<{ value: CalendarViewMode; label: string; icon: typeof CalendarDays }> = [
  { value: 'month', label: 'Mes', icon: CalendarDays },
  { value: 'week', label: 'Semana', icon: CalendarRange },
  { value: 'agenda', label: 'Agenda', icon: List },
  { value: 'year', label: 'Año', icon: CalendarRange },
];

const iconButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';

export const ProgramToolbar = ({
  title,
  viewMode,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  mine,
  onToggleMine,
  onReload,
  onExportIcs,
  onPrint,
  onOpenCoverage,
  onOpenKpis,
  onDownloadPdf,
  downloadingPdf,
  loading,
}: ProgramToolbarProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrev} className={`${iconButton} w-9 px-0`} aria-label="Periodo anterior">
        <ChevronLeft size={16} />
      </button>
      <button type="button" onClick={onToday} className={iconButton}>
        Hoy
      </button>
      <button type="button" onClick={onNext} className={`${iconButton} w-9 px-0`} aria-label="Periodo siguiente">
        <ChevronRight size={16} />
      </button>
      <h2 className="ml-2 text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
      {loading ? <Loader2 size={16} className="animate-spin text-[var(--unilabor-neutral)]" /> : null}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 p-0.5">
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const active = viewMode === view.value;
          return (
            <button
              key={view.value}
              type="button"
              onClick={() => onViewChange(view.value)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
                active ? 'bg-[var(--color-brand-700)] text-white shadow' : 'text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
              }`}
            >
              <Icon size={14} />
              {view.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onToggleMine}
        className={`${iconButton} ${mine ? 'border-[rgba(0,105,166,0.4)] bg-[rgba(191,212,230,0.45)]' : ''}`}
        title="Solo activos donde soy operador, responsable técnico o responsable de área"
      >
        <UserRound size={14} />
        Mi calendario
      </button>
      <button type="button" onClick={onOpenCoverage} className={iconButton} title="Activos que deberían tener programa y no lo tienen">
        <ShieldCheck size={14} />
        Cobertura
      </button>
      <button type="button" onClick={onOpenKpis} className={iconButton} title="Indicadores del periodo (cumplimiento, vencidas, downtime, correctivos repetidos)">
        <BarChart3 size={14} />
        Indicadores
      </button>
      <button type="button" onClick={onDownloadPdf} className={iconButton} disabled={downloadingPdf} title="Programa del periodo en PDF (evidencia firmable)">
        {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        PDF
      </button>
      <button type="button" onClick={onExportIcs} className={iconButton} title="Exportar a Outlook / Google Calendar (.ics)">
        <Download size={14} />
        ICS
      </button>
      <button type="button" onClick={onPrint} className={iconButton} title="Imprimir programa del periodo">
        <Printer size={14} />
      </button>
      <button type="button" onClick={onReload} className={`${iconButton} w-9 px-0`} aria-label="Recargar" disabled={loading}>
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  </div>
);
