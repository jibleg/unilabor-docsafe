import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import { saveVacationPolicyRow, type VacationPolicyRow } from '../../../api/service.api-attendance-settings';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { inputClass, labelClass, ModalShell, primaryButtonClass, secondaryButtonClass } from '../devices/ModalShell';

interface VacationRowModalProps {
  row: VacationPolicyRow | null;
  onClose: () => void;
  onSaved: (rows: VacationPolicyRow[]) => void;
}

export const VacationRowModal = ({ row, onClose, onSaved }: VacationRowModalProps) => {
  const [year, setYear] = useState(row ? String(row.from_seniority_year) : '');
  const [days, setDays] = useState(row ? String(row.vacation_days) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const yearNumber = Number(year);
    const daysNumber = Number(days);
    if (!Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 60) return setError('El año de antigüedad va de 1 a 60.');
    if (days.trim() === '' || !Number.isFinite(daysNumber) || daysNumber < 0 || daysNumber > 60 || (daysNumber * 2) % 1 !== 0) {
      return setError('Los días van de 0 a 60, en pasos de 0.5.');
    }
    setError(null);
    setSaving(true);
    try {
      const rows = await saveVacationPolicyRow(yearNumber, daysNumber);
      notifySuccess('Tabla de vacaciones actualizada.');
      onSaved(rows);
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo guardar la fila.'));
      setSaving(false);
    }
  };

  return (
    <ModalShell title={row ? `Editar año ${row.from_seniority_year}` : 'Nueva fila'} eyebrow="Vacaciones" onClose={onClose} locked={saving}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="vac-year">Desde el año</label>
            <input id="vac-year" type="number" min={1} max={60} className={inputClass} value={year} disabled={row !== null} onChange={(event) => setYear(event.target.value)} autoFocus={!row} />
          </div>
          <div>
            <label className={labelClass} htmlFor="vac-days">Días de vacaciones</label>
            <input id="vac-days" type="number" min={0} max={60} step={0.5} className={inputClass} value={days} onChange={(event) => setDays(event.target.value)} autoFocus={row !== null} />
          </div>
        </div>
        <p className="text-xs text-slate-500">La fila aplica desde ese año de antigüedad hasta antes de la siguiente fila.</p>
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
