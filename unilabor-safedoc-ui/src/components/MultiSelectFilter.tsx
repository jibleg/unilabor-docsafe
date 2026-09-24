import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ListChecks, RotateCcw } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Clase Tailwind para la bolita/etiqueta de color del estado (opcional). */
  className?: string;
}

interface MultiSelectFilterProps {
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  /** Valores que restaura el boton "Restablecer" (p. ej. la seleccion por defecto). */
  defaultValues?: string[];
  /** Texto del disparador cuando todas las opciones estan marcadas. */
  allLabel?: string;
  disabled?: boolean;
}

/**
 * Dropdown de seleccion multiple con casillas (mismo patron de SearchableSelect:
 * menu en portal con position:fixed, cierre al hacer clic fuera / scroll).
 * Siempre queda al menos una opcion marcada: desmarcar la ultima no hace nada,
 * porque "ningun estado" dejaria la pantalla vacia sin razon aparente.
 */
export const MultiSelectFilter = ({
  values,
  options,
  onChange,
  defaultValues,
  allLabel = 'Todos',
  disabled = false,
}: MultiSelectFilterProps) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(values);
  const allSelected = options.every((option) => selectedSet.has(option.value));
  const selectedLabels = options.filter((option) => selectedSet.has(option.value)).map((option) => option.label);

  const summary = allSelected
    ? allLabel
    : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.length} de ${options.length} seleccionados`;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleResize = () => setOpen(false);
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  const ESTIMATED_MENU_HEIGHT = 360;

  const toggleMenu = () => {
    if (disabled) {
      return;
    }
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < ESTIMATED_MENU_HEIGHT && rect.top > spaceBelow;
      const top = openUpward ? Math.max(8, rect.top - ESTIMATED_MENU_HEIGHT - 4) : rect.bottom + 4;
      setPos({ top, left: rect.left, width: Math.max(rect.width, 260) });
    }
    setOpen((current) => !current);
  };

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      if (values.length === 1) {
        return;
      }
      onChange(values.filter((item) => item !== value));
      return;
    }
    // Conserva el orden del catalogo de opciones, no el orden de clic.
    const next = new Set([...values, value]);
    onChange(options.map((option) => option.value).filter((item) => next.has(item)));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-left text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:opacity-60"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <ListChecks size={15} className="shrink-0 text-[var(--color-brand-500)]" />
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-multiselectable="true"
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
              className="z-[90] overflow-hidden rounded-xl border border-[rgba(0,65,106,0.12)] bg-white shadow-2xl shadow-[rgba(0,65,106,0.18)]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[rgba(0,65,106,0.08)] px-3 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => onChange(options.map((option) => option.value))}
                  disabled={allSelected}
                  className="font-semibold text-[var(--color-brand-700)] transition hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Marcar todos
                </button>
                {defaultValues ? (
                  <button
                    type="button"
                    onClick={() => onChange(defaultValues)}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
                  >
                    <RotateCcw size={12} /> Restablecer
                  </button>
                ) : null}
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {options.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggleValue(option.value)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--unilabor-ink)] transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white'
                            : 'border-[rgba(0,65,106,0.3)] bg-white'
                        }`}
                      >
                        {checked ? <Check size={12} /> : null}
                      </span>
                      {option.className ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${option.className}`}>
                          {option.label}
                        </span>
                      ) : (
                        <span>{option.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
