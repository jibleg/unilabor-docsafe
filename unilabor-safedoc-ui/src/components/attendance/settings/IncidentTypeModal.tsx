import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  createAttendanceIncidentType,
  updateAttendanceIncidentType,
  type AttendanceIncidentType,
  type IncidentTypeFlags,
} from '../../../api/service.api-attendance-settings';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { inputClass, labelClass, ModalShell, primaryButtonClass, secondaryButtonClass } from '../devices/ModalShell';
import { FLAG_FIELDS } from './incidentFlags';
import { isValidIncidentCode, suggestIncidentCode } from './settingsHelpers';

interface IncidentTypeModalProps {
  type: AttendanceIncidentType | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}

export const IncidentTypeModal = ({ type, nextSortOrder, onClose, onSaved }: IncidentTypeModalProps) => {
  const [name, setName] = useState(type?.name ?? '');
  const [code, setCode] = useState(type?.code ?? '');
  const [codeTouched, setCodeTouched] = useState(false);
  const [flags, setFlags] = useState<IncidentTypeFlags>({
    requires_attachment: type?.requires_attachment ?? true,
    is_paid: type?.is_paid ?? true,
    deducts_vacation: type?.deducts_vacation ?? false,
    counts_as_attendance: type?.counts_as_attendance ?? true,
    is_hourly: type?.is_hourly ?? false,
  });
  const [sortOrder, setSortOrder] = useState(String(type?.sort_order ?? nextSortOrder));
  const [isActive, setIsActive] = useState(type?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystem = type?.is_system ?? false;

  const onNameChange = (value: string) => {
    setName(value);
    if (!type && !codeTouched) setCode(suggestIncidentCode(value));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) return setError('El nombre debe tener entre 2 y 80 caracteres.');
    if (!isSystem && !isValidIncidentCode(code)) {
      return setError('La clave usa minúsculas, números y guion bajo; empieza con letra y mide de 2 a 30 caracteres.');
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0) return setError('El orden debe ser un entero igual o mayor a cero.');
    setError(null);
    setSaving(true);
    try {
      const payload = { name: trimmed, ...flags, sort_order: order };
      if (type) {
        await updateAttendanceIncidentType(type.id, { ...payload, ...(isSystem ? {} : { code, is_active: isActive }) });
      } else {
        await createAttendanceIncidentType({ ...payload, code });
      }
      notifySuccess(type ? 'Tipo actualizado.' : 'Tipo creado.');
      onSaved();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo guardar el tipo de incidencia.'));
      setSaving(false);
    }
  };

  return (
    <ModalShell title={type ? 'Editar tipo' : 'Nuevo tipo'} eyebrow="Tipos de incidencia" onClose={onClose} locked={saving} maxWidthClass="max-w-xl">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="it-name">Nombre</label>
            <input id="it-name" className={inputClass} value={name} maxLength={80} onChange={(event) => onNameChange(event.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelClass} htmlFor="it-code">Clave</label>
            <input
              id="it-code"
              className={inputClass}
              value={code}
              maxLength={30}
              disabled={isSystem}
              onChange={(event) => { setCodeTouched(true); setCode(event.target.value); }}
              placeholder="permiso_medico"
            />
            {isSystem ? <p className="mt-1 text-xs text-slate-500">Los tipos de sistema no cambian de clave.</p> : null}
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClass}>Comportamiento</legend>
          {FLAG_FIELDS.map((field) => (
            <label key={field.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] p-2.5">
              <input
                type="checkbox"
                className="toggle toggle-sm mt-0.5"
                checked={flags[field.key]}
                onChange={(event) => setFlags((current) => ({ ...current, [field.key]: event.target.checked }))}
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--unilabor-ink)]">{field.label}</span>
                <span className="block text-xs text-slate-500">{field.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="it-order">Orden</label>
            <input id="it-order" type="number" min={0} className={inputClass} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </div>
          {type ? (
            <label className="flex items-center gap-3 self-end pb-2">
              <input type="checkbox" className="toggle toggle-sm" checked={isActive} disabled={isSystem} onChange={(event) => setIsActive(event.target.checked)} />
              <span className="text-sm font-semibold text-[var(--unilabor-ink)]">Activo{isSystem ? ' (siempre)' : ''}</span>
            </label>
          ) : null}
        </div>

        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className={primaryButtonClass} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
