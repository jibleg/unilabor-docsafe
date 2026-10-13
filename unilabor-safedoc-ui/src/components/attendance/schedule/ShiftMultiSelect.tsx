import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Coffee, Search } from 'lucide-react';
import type { AttendanceShift } from '../../../api/service.api-attendance-schedule';
import { inputClass } from './ui';

export const REST = 'rest';
export type ShiftSelection = (number | typeof REST)[];

interface Props {
  shifts: AttendanceShift[];
  selection: ShiftSelection;
  onToggle: (id: number | typeof REST) => void;
}

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const GAP = 4;
const MAX_PANEL_HEIGHT = 340;

/**
 * Selector desplegable con busqueda y seleccion multiple (jornada partida) para listas largas de turnos.
 * El panel flota sobre el contenido (portal + posicion fija bajo el boton, o encima si abajo no cabe), de modo
 * que abrirlo no cambia el tamano del modal.
 */
export const ShiftMultiSelect = ({ shifts, selection, onToggle }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - 8;
    const above = rect.top - GAP - 8;
    const openUp = below < 200 && above > below;
    const room = Math.max(120, Math.min(MAX_PANEL_HEIGHT, openUp ? above : below));
    setPanelStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: room,
      ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? shifts.filter((s) => normalize(`${s.name} ${s.start_time.slice(0, 5)} ${s.end_time.slice(0, 5)}`).includes(q)) : shifts;
  }, [shifts, query]);

  /** Elegir una opcion cierra el desplegable; para sumar otro turno (jornada partida) se vuelve a abrir. */
  const choose = (id: number | typeof REST) => {
    onToggle(id);
    setOpen(false);
  };

  const isRest = selection.includes(REST);
  const label = isRest
    ? 'Descanso'
    : selection.length === 0
      ? 'Elegir turnos…'
      : selection.length === 1
        ? (shifts.find((s) => s.id === selection[0])?.name ?? '1 turno elegido')
        : `${selection.length} turnos elegidos`;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Elegir turnos"
        onClick={() => setOpen((value) => !value)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selection.length === 0 ? 'text-[var(--unilabor-neutral)]' : 'font-semibold text-[var(--unilabor-ink)]'}>{label}</span>
        <ChevronDown size={16} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div ref={panelRef} style={panelStyle} className="z-[70] flex flex-col rounded-xl border border-[rgba(0,65,106,0.15)] bg-white p-2 shadow-xl">
          <label className="relative mb-2 block">
            <span className="sr-only">Buscar turno</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar turno por nombre u horario…" className={`${inputClass} !py-1.5 pl-8`} autoFocus />
          </label>
          <ul role="listbox" aria-multiselectable="true" aria-label="Turnos" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <li
              role="option"
              aria-selected={isRest}
              tabIndex={0}
              onClick={() => choose(REST)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(REST))}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-2 text-sm font-semibold ${isRest ? 'border-slate-500 bg-slate-100' : 'border-slate-300 hover:bg-slate-50'}`}
            >
              <Coffee size={16} className="text-slate-500" aria-hidden="true" /> Descanso
              {isRest && <Check size={14} className="ml-auto" aria-hidden="true" />}
            </li>
            {filtered.map((s) => {
              const on = selection.includes(s.id);
              return (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  onClick={() => choose(s.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(s.id))}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${on ? 'border-[var(--color-brand-500)] bg-[rgba(191,212,230,0.3)]' : 'border-transparent hover:bg-slate-50'}`}
                >
                  <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: s.color_hex }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--unilabor-ink)]">{s.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--unilabor-neutral)]">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                  {on && <Check size={14} aria-hidden="true" />}
                </li>
              );
            })}
            {filtered.length === 0 && <li className="p-2 text-xs text-[var(--unilabor-neutral)]">Ningún turno coincide.</li>}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
};
