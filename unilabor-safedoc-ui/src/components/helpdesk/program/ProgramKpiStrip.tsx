import { AlertTriangle, CalendarCheck2, CheckCircle2, Gauge, Hourglass, PenLine, Sparkles, Wrench } from 'lucide-react';
import type { CalendarSummary } from '../../../types/helpdesk-program';

interface ProgramKpiStripProps {
  summary: CalendarSummary | null;
  loading: boolean;
  onPick: (key: 'overdue' | 'due_soon' | 'in_progress' | 'pending_validation' | 'closed' | 'all') => void;
  active: string;
}

const tiles = (summary: CalendarSummary | null) => [
  { key: 'all', label: 'Servicios en el periodo', value: summary?.total ?? 0, icon: Wrench, tone: 'text-[var(--color-brand-700)]' },
  { key: 'overdue', label: 'Vencidos', value: summary?.overdue ?? 0, icon: AlertTriangle, tone: 'text-[#b02a2a]' },
  { key: 'due_soon', label: 'Próximos 7 días', value: summary?.due_soon ?? 0, icon: Hourglass, tone: 'text-[#8a5a12]' },
  { key: 'in_progress', label: 'En ejecución', value: summary?.in_progress ?? 0, icon: CalendarCheck2, tone: 'text-[var(--color-brand-500)]' },
  { key: 'pending_validation', label: 'En validación', value: summary?.pending_validation ?? 0, icon: PenLine, tone: 'text-[#4c1d95]' },
  { key: 'closed', label: 'Cerrados', value: summary?.closed_in_range ?? 0, icon: CheckCircle2, tone: 'text-[#1c7a4a]' },
];

export const ProgramKpiStrip = ({ summary, loading, onPick, active }: ProgramKpiStripProps) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
    {tiles(summary).map((tile) => {
      const Icon = tile.icon;
      const isActive = active === tile.key;
      return (
        <button
          key={tile.key}
          type="button"
          onClick={() => onPick(tile.key as Parameters<typeof onPick>[0])}
          className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
            isActive
              ? 'border-[rgba(0,105,166,0.35)] bg-[rgba(191,212,230,0.35)] shadow-inner'
              : 'border-[rgba(0,65,106,0.08)] bg-white/90 hover:bg-[rgba(191,212,230,0.2)]'
          }`}
        >
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.35)] ${tile.tone}`}>
            <Icon size={17} />
          </span>
          <span className="min-w-0">
            <span className={`block text-xl font-bold leading-none ${tile.tone} ${loading ? 'opacity-40' : ''}`}>{tile.value}</span>
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{tile.label}</span>
          </span>
        </button>
      );
    })}
    <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2.5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.35)] text-[var(--color-brand-700)]">
        <Gauge size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold leading-none text-[var(--color-brand-700)]">
            {summary?.compliance_pct === null || summary?.compliance_pct === undefined ? '—' : `${summary.compliance_pct}%`}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--unilabor-neutral)]">
            <Sparkles size={11} /> {summary?.projected ?? 0} proyectadas
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(191,212,230,0.4)]">
          <div
            className={`h-full rounded-full transition-all ${
              (summary?.compliance_pct ?? 0) >= 90 ? 'bg-[#1c7a4a]' : (summary?.compliance_pct ?? 0) >= 70 ? 'bg-[#d0952a]' : 'bg-[#b02a2a]'
            }`}
            style={{ width: `${summary?.compliance_pct ?? 0}%` }}
          />
        </div>
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Cumplimiento en ventana</span>
      </div>
    </div>
  </div>
);
