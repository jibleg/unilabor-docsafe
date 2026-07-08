import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  hint?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

const normalize = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

export const SearchableSelect = ({
  value,
  options,
  onChange,
  placeholder = 'Selecciona...',
  emptyLabel = 'Sin seleccion',
  searchPlaceholder = 'Escribe para filtrar...',
  disabled = false,
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) => normalize(`${option.label} ${option.hint ?? ''}`).includes(normalizedQuery));
  }, [options, query]);

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
    // Cierra el menú al hacer scroll de la PÁGINA (el menú es position:fixed y su
    // posición se calcula una sola vez). Pero ignora el scroll ORIGINADO dentro
    // del propio menú: con captura, window recibe también el scroll de la lista
    // interna, y sin este guard cerraría el dropdown al intentar desplazarlo.
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
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) {
      return;
    }
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      setQuery('');
    }
    setOpen((current) => !current);
  };

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-left text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:opacity-60"
      >
        <span className={selected ? '' : 'text-[var(--unilabor-neutral)]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
              className="z-[60] overflow-hidden rounded-xl border border-[rgba(0,65,106,0.12)] bg-white shadow-2xl shadow-[rgba(0,65,106,0.18)]"
            >
              <div className="flex items-center gap-2 border-b border-[rgba(0,65,106,0.08)] px-3 py-2">
                <Search size={15} className="text-[var(--unilabor-neutral)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => select('')}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
                >
                  <span className="inline-flex items-center gap-2"><X size={14} /> {emptyLabel}</span>
                  {value === '' ? <Check size={14} className="text-[var(--color-brand-700)]" /> : null}
                </button>
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[var(--unilabor-neutral)]">Sin coincidencias.</p>
                ) : (
                  filtered.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => select(option.value)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[var(--unilabor-ink)] transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.hint ? <span className="block truncate text-xs text-[var(--unilabor-neutral)]">{option.hint}</span> : null}
                      </span>
                      {option.value === value ? <Check size={14} className="shrink-0 text-[var(--color-brand-700)]" /> : null}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
