import { Repeat } from 'lucide-react';
import { WEEKDAY_SHORT } from './scheduleHelpers';
import { inputClass, labelClass } from './ui';

export interface RepeatState {
  repeats: boolean;
  weekInterval: number;
  weekdays: number[];
}

interface RepeatFieldsProps {
  value: RepeatState;
  onChange: (next: RepeatState) => void;
  /** Weekdays ISO ordenados segun el inicio de semana. */
  weekdayOrder: number[];
}

/** Recuadro "Repetir": toggle, cada N semanas y los 7 dias. */
export const RepeatFields = ({ value, onChange, weekdayOrder }: RepeatFieldsProps) => {
  const toggleDay = (day: number) =>
    onChange({
      ...value,
      weekdays: value.weekdays.includes(day) ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day],
    });

  return (
    <div className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.7)] p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
        <input type="checkbox" checked={value.repeats} onChange={(e) => onChange({ ...value, repeats: e.target.checked })} />
        <Repeat size={15} /> Repetir cada semana
      </label>
      {value.repeats && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`${labelClass} mb-0`}>Cada</span>
            <input
              type="number"
              min={1}
              max={8}
              aria-label="Cada cuántas semanas"
              className={`${inputClass} !w-20`}
              value={value.weekInterval}
              onChange={(e) => onChange({ ...value, weekInterval: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
            />
            <span className="text-[var(--unilabor-neutral)]">{value.weekInterval === 1 ? 'semana' : 'semanas'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
            {weekdayOrder.map((day) => {
              const on = value.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`h-9 min-w-11 rounded-lg border px-2 text-xs font-bold transition ${on ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white' : 'border-[rgba(0,65,106,0.14)] bg-white text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.25)]'}`}
                >
                  {WEEKDAY_SHORT[day]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
