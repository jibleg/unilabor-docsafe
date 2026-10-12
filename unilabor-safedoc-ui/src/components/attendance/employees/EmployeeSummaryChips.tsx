import type { EmployeeSummary } from '../../../api/service.api-attendance-employees';
import type { SummaryChipKey } from './readiness';

interface Props {
  summary: EmployeeSummary | null;
  active: SummaryChipKey | null;
  onSelect: (key: SummaryChipKey | null) => void;
}

const CHIPS: Array<{ key: SummaryChipKey; label: string; tone: 'neutral' | 'warn' | 'bad' }> = [
  { key: 'enabled', label: 'Habilitados', tone: 'neutral' },
  { key: 'without_branch', label: 'Sin sucursal', tone: 'warn' },
  { key: 'without_device_number', label: 'Sin número de reloj', tone: 'warn' },
  { key: 'pending_sync', label: 'Por sincronizar', tone: 'warn' },
  { key: 'without_schedule', label: 'Sin horario', tone: 'warn' },
  { key: 'sync_error', label: 'Con error', tone: 'bad' },
];

const TONE_CLASS = {
  neutral: 'border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)]',
  warn: 'border-amber-300 text-amber-900',
  bad: 'border-red-300 text-red-800',
} as const;

export const EmployeeSummaryChips = ({ summary, active, onSelect }: Props) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label="Resumen de colaboradores">
    {CHIPS.map((chip) => {
      const count = summary ? summary[chip.key] : null;
      const isActive = active === chip.key;
      const dim = chip.tone !== 'neutral' && count === 0;
      return (
        <button
          key={chip.key}
          type="button"
          aria-pressed={isActive}
          onClick={() => onSelect(isActive ? null : chip.key)}
          className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-[rgba(191,212,230,0.28)] ${TONE_CLASS[chip.tone]} ${
            isActive ? 'ring-2 ring-[var(--color-brand-500)]' : ''
          } ${dim ? 'opacity-60' : ''}`}
        >
          {chip.label}
          <span className="rounded-full bg-[rgba(0,65,106,0.08)] px-2 py-0.5">{count ?? '—'}</span>
        </button>
      );
    })}
  </div>
);
