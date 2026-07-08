import { useState } from 'react';
import { CalendarClock, Loader2, Plus, X } from 'lucide-react';

import { notifyWarning } from '../../utils/notify';

interface ScheduleDatesModalProps {
  open: boolean;
  title?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (dates: string[]) => void;
}

export const ScheduleDatesModal = ({
  open,
  title = 'Cargar cronograma',
  saving = false,
  onClose,
  onSubmit,
}: ScheduleDatesModalProps) => {
  const [rows, setRows] = useState<string[]>(['']);
  // Reinicia a una sola fila vacía cada vez que se abre el modal (patrón de
  // ajuste de estado en render al cambiar una prop, sin efecto).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(['']);
    }
  }

  if (!open) {
    return null;
  }

  const updateRow = (index: number, value: string) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? value : row)));
  };

  const addRow = () => {
    setRows((current) => [...current, '']);
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [''];
    });
  };

  const handleSubmit = () => {
    const cleaned = Array.from(new Set(rows.map((row) => row.trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      notifyWarning('Agrega al menos una fecha.');
      return;
    }
    onSubmit(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Calibración (ISO 15189)
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
            Captura las fechas del calendario provisto por el proveedor o responsable metrológico.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="date"
                value={row}
                onChange={(event) => updateRow(index, event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                aria-label="Quitar fecha"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <Plus size={16} />
            Agregar fecha
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            Cargar cronograma
          </button>
        </div>
      </div>
    </div>
  );
};
