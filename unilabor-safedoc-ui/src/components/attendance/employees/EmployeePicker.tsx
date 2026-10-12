import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { listAttendanceEmployees, type AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { inputClass } from './ui';

export type PickedEmployee = Pick<AttendanceEmployee, 'id' | 'full_name' | 'employee_code'>;

interface EmployeePickerProps {
  value: PickedEmployee | null;
  onChange: (employee: AttendanceEmployee | null) => void;
  /** Solo colaboradores habilitados en el control (por defecto true). */
  onlyEnabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

/** Selector con busqueda en el servidor (nombre, codigo o numero de reloj). */
export const EmployeePicker = ({
  value,
  onChange,
  onlyEnabled = true,
  placeholder = 'Buscar colaborador…',
  ariaLabel = 'Colaborador',
}: EmployeePickerProps) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AttendanceEmployee[]>([]);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await listAttendanceEmployees({
          search: query.trim() || undefined,
          enabled: onlyEnabled ? 'true' : undefined,
          limit: 20,
        });
        if (active) setResults(response.data);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [query, open, onlyEnabled]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm">
        <span className="min-w-0 truncate text-[var(--unilabor-ink)]">
          <strong>{value.full_name}</strong>
          {value.employee_code ? <span className="text-[var(--unilabor-neutral)]"> · {value.employee_code}</span> : null}
        </span>
        <button
          type="button"
          aria-label="Quitar colaborador"
          className="text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
          onClick={() => onChange(null)}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
        <input
          aria-label={ariaLabel}
          className={`${inputClass} pl-9`}
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {loading ? <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--unilabor-neutral)]" /> : null}
      </div>
      {open ? (
        <div className="absolute z-[90] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.12)] bg-white py-1 shadow-2xl">
          {failed ? (
            <p className="px-3 py-2 text-sm text-[var(--unilabor-neutral)]">No se pudo buscar. Intenta de nuevo.</p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-2 text-sm text-[var(--unilabor-neutral)]">Sin resultados.</p>
          ) : (
            results.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[rgba(191,212,230,0.28)]"
                onClick={() => {
                  onChange(employee);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="font-semibold text-[var(--unilabor-ink)]">{employee.full_name}</span>
                <span className="text-xs text-[var(--unilabor-neutral)]">
                  {[employee.employee_code, employee.branch_name].filter(Boolean).join(' · ') || 'Sin sucursal'}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
