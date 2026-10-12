import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import {
  getAttendanceEmployeeOption,
  searchAttendanceEmployees,
  type AttendanceEmployeeOption,
} from '../../../api/service.api-attendance-days';

interface EmployeePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Colaborador ya conocido (p. ej. el de la fila) para mostrar su nombre sin consultar. */
  seed?: AttendanceEmployeeOption | null;
}

const hintOf = (e: AttendanceEmployeeOption): string =>
  [e.employee_code, e.branch_name, e.device_employee_number ? `reloj ${e.device_employee_number}` : ''].filter(Boolean).join(' · ');

/** Selector de colaborador con busqueda en el servidor (GET /attendance/employees?search=). */
export const EmployeePicker = ({ value, onChange, placeholder = 'Selecciona colaborador', emptyLabel = 'Todos', seed = null }: EmployeePickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttendanceEmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AttendanceEmployeeOption | null>(seed);
  const rootRef = useRef<HTMLDivElement>(null);

  // Resuelve el nombre cuando el valor viene de la URL.
  useEffect(() => {
    if (!value) return;
    if (selected && String(selected.id) === value) return;
    let active = true;
    void getAttendanceEmployeeOption(Number(value)).then((item) => {
      if (active && item) setSelected(item);
    });
    return () => {
      active = false;
    };
  }, [value, selected]);

  // Busqueda con debounce mientras el menu esta abierto.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = window.setTimeout(() => {
      setLoading(true);
      searchAttendanceEmployees(query)
        .then((list) => active && setResults(list))
        .catch(() => active && setResults([]))
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const pick = (employee: AttendanceEmployeeOption | null) => {
    setSelected(employee);
    onChange(employee ? String(employee.id) : '');
    setOpen(false);
  };

  const label = value && selected && String(selected.id) === value ? selected.full_name : value ? 'Cargando...' : placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-left text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
      >
        <span className={`truncate ${value ? '' : 'text-[var(--unilabor-neutral)]'}`}>{label}</span>
        <ChevronDown size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-[80] mt-1 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.12)] bg-white shadow-2xl shadow-[rgba(0,65,106,0.18)]">
          <div className="flex items-center gap-2 border-b border-[rgba(0,65,106,0.08)] px-3 py-2">
            <Search size={15} className="text-[var(--unilabor-neutral)]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, código o reloj..."
              aria-label="Buscar colaborador"
              className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
            />
            {loading ? <Loader2 size={14} className="animate-spin text-[var(--unilabor-neutral)]" /> : null}
          </div>
          <div role="listbox" className="max-h-60 overflow-y-auto py-1">
            {emptyLabel ? (
              <button type="button" onClick={() => pick(null)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.28)]">
                <X size={14} /> {emptyLabel}
              </button>
            ) : null}
            {!loading && results.length === 0 ? <p className="px-3 py-3 text-sm text-[var(--unilabor-neutral)]">Sin coincidencias.</p> : null}
            {results.map((employee) => (
              <button
                key={employee.id}
                type="button"
                role="option"
                aria-selected={String(employee.id) === value}
                onClick={() => pick(employee)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.28)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{employee.full_name}</span>
                  <span className="block truncate text-xs text-[var(--unilabor-neutral)]">{hintOf(employee)}</span>
                </span>
                {String(employee.id) === value ? <Check size={14} className="shrink-0 text-[var(--color-brand-700)]" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
