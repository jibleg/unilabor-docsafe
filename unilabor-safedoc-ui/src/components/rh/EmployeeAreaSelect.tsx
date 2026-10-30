import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { createEmployeeArea, getApiErrorMessage, listEmployeeAreas } from '../../api/service';
import type { EmployeeArea } from '../../types/models';
import { notifyError, notifySuccess } from '../../utils/notify';
import { SearchableSelect, type SearchableOption } from '../SearchableSelect';

interface EmployeeAreaSelectProps {
  value: string;
  onChange: (area: string) => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';

/**
 * Campo "Seccion / Departamento" del colaborador (employees.area): solo se
 * elige del catalogo oficial (evita variantes como Validacion / VALIDACIÓN).
 * El AREA del proceso la rige el puesto. Con "+" se agrega una seccion nueva;
 * el backend la guarda en MAYUSCULAS y rechaza duplicados aunque cambien
 * acentos o mayusculas.
 */
export const EmployeeAreaSelect = ({ value, onChange }: EmployeeAreaSelectProps) => {
  const [areas, setAreas] = useState<EmployeeArea[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listEmployeeAreas()
      .then(setAreas)
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudo cargar el catálogo de secciones.')));
  }, []);

  const options = useMemo<SearchableOption[]>(() => {
    const list: SearchableOption[] = areas.map((area) => ({
      value: area.name,
      label: area.name,
      hint: area.employees === 1 ? '1 colaborador' : `${area.employees} colaboradores`,
    }));
    // Valor previo a la normalizacion que no esta en el catalogo: se muestra para no perderlo.
    if (value && !areas.some((area) => area.name === value)) list.unshift({ value, label: value, hint: 'Fuera del catálogo' });
    return list;
  }, [areas, value]);

  const save = async () => {
    if (newName.trim().length < 2) return;
    setSaving(true);
    try {
      const created = await createEmployeeArea(newName);
      setAreas((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.name);
      notifySuccess(`Sección ${created.name} agregada.`);
      setAdding(false);
      setNewName('');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar la sección.'));
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={newName}
          onChange={(event) => setNewName(event.target.value.toLocaleUpperCase('es-MX'))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
          }}
          className={inputClass}
          placeholder="NOMBRE DE LA SECCIÓN NUEVA"
          maxLength={80}
        />
        <button type="button" onClick={() => void save()} disabled={saving || newName.trim().length < 2} title="Agregar sección" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button type="button" onClick={() => { setAdding(false); setNewName(''); }} title="Cancelar" className="rounded-lg p-2 text-[var(--unilabor-neutral)] hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <SearchableSelect value={value} options={options} onChange={onChange} placeholder="Elige la sección" emptyLabel="Sin sección" searchPlaceholder="Buscar sección..." />
      </div>
      <button type="button" onClick={() => setAdding(true)} title="Agregar una sección nueva al catálogo" className="rounded-lg p-2 text-[var(--color-brand-500)] hover:bg-[rgba(0,65,106,0.06)]">
        <Plus size={16} />
      </button>
    </div>
  );
};
