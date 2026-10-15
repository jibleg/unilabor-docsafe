import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  createAttendanceHoliday,
  updateAttendanceHoliday,
  type AttendanceHoliday,
} from '../../../api/service.api-attendance-settings';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { inputClass, labelClass, ModalShell, primaryButtonClass, secondaryButtonClass } from '../devices/ModalShell';
import { isValidIsoDate } from './settingsHelpers';
import { ATTENDANCE_MIN_DATE } from '../shared/format';

interface HolidayModalProps {
  holiday: AttendanceHoliday | null;
  defaultYear: number;
  onClose: () => void;
  onSaved: () => void;
}

export const HolidayModal = ({ holiday, defaultYear, onClose, onSaved }: HolidayModalProps) => {
  const [date, setDate] = useState(holiday?.holiday_date ?? `${defaultYear}-01-01`);
  const [name, setName] = useState(holiday?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!isValidIsoDate(date)) return setError('Indica una fecha válida.');
    if (trimmed.length < 2 || trimmed.length > 120) return setError('El nombre debe tener entre 2 y 120 caracteres.');
    setError(null);
    setSaving(true);
    try {
      if (holiday) await updateAttendanceHoliday(holiday.id, { holiday_date: date, name: trimmed });
      else await createAttendanceHoliday({ holiday_date: date, name: trimmed });
      notifySuccess(holiday ? 'Festivo actualizado.' : 'Festivo creado.');
      onSaved();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo guardar el festivo.'));
      setSaving(false);
    }
  };

  return (
    <ModalShell title={holiday ? 'Editar festivo' : 'Nuevo festivo'} eyebrow="Festivos" onClose={onClose} locked={saving}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="holiday-date">Fecha</label>
          <input id="holiday-date" type="date" min={ATTENDANCE_MIN_DATE} className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holiday-name">Nombre</label>
          <input id="holiday-name" className={inputClass} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus />
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
