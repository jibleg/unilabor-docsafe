import { useState } from 'react';
import { AlertTriangle, Save, Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  extractScheduleConflicts,
  removeAssignment,
  updateAssignment,
  type AssignmentPatch,
  type AttendanceShift,
  type ScheduleChip,
  type ScheduleConflictDetail,
} from '../../../api/service.api-attendance-schedule';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { formatDate } from '../shared/format';
import { ConflictList } from './ConflictList';
import { ModalShell } from './ModalShell';
import { RepeatFields, type RepeatState } from './RepeatFields';
import { isoWeekday } from './scheduleHelpers';
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from './ui';

export interface EditTarget {
  employeeName: string;
  date: string;
  chip: ScheduleChip;
}

interface EditAssignmentModalProps {
  target: EditTarget;
  shifts: AttendanceShift[];
  weekdayOrder: number[];
  onClose: () => void;
  onChanged: () => void;
}

const REST = 'rest';

export const EditAssignmentModal = ({ target, shifts, weekdayOrder, onClose, onChanged }: EditAssignmentModalProps) => {
  const { chip, date } = target;
  const [shiftValue, setShiftValue] = useState<string>(chip.shift_id === null ? REST : String(chip.shift_id));
  const [notes, setNotes] = useState(chip.notes ?? '');
  const [notesTouched, setNotesTouched] = useState(false);
  const [changeValidity, setChangeValidity] = useState(false);
  const [startDate, setStartDate] = useState(chip.start_date);
  const [endDate, setEndDate] = useState(chip.end_date ?? '');
  const [repeat, setRepeat] = useState<RepeatState>({ repeats: chip.repeats_weekly, weekInterval: chip.week_interval, weekdays: chip.weekdays.length > 0 ? chip.weekdays : [isoWeekday(date)] });
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<{ message: string; details: ScheduleConflictDetail[] } | null>(null);

  const currentShiftValue = chip.shift_id === null ? REST : String(chip.shift_id);
  // Los turnos inactivos no se pueden asignar: se ofrecen los activos y el actual.
  const options = shifts.filter((s) => s.is_active || String(s.id) === currentShiftValue);

  const save = async () => {
    const patch: AssignmentPatch = {};
    if (shiftValue !== currentShiftValue) patch.shift_id = shiftValue === REST ? null : Number(shiftValue);
    if (notesTouched) patch.notes = notes.trim() || null;
    if (changeValidity) {
      if (!startDate) return notifyWarning('Indica la fecha de inicio.');
      if (endDate && endDate < startDate) return notifyWarning('La fecha final no puede ser anterior a la inicial.');
      if (repeat.repeats && repeat.weekdays.length === 0) return notifyWarning('Elige al menos un día de la semana.');
      patch.start_date = startDate;
      patch.end_date = repeat.repeats ? endDate || null : endDate || startDate;
      patch.repeats_weekly = repeat.repeats;
      patch.week_interval = repeat.weekInterval;
      patch.weekdays = repeat.repeats ? repeat.weekdays : [isoWeekday(startDate)];
    }
    if (Object.keys(patch).length === 0) return notifyWarning('No hay cambios que guardar.');
    setBusy(true);
    setConflicts(null);
    try {
      await updateAssignment(chip.assignment_id, patch);
      notifySuccess('Programación actualizada.');
      onChanged();
    } catch (error) {
      const details = extractScheduleConflicts(error);
      if (details) setConflicts({ message: getApiErrorMessage(error, 'Hay conflictos de horario.'), details });
      else notifyError(getApiErrorMessage(error, 'No se pudo actualizar la programación.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (fromDateOnly: boolean) => {
    setBusy(true);
    try {
      const result = await removeAssignment(chip.assignment_id, { date, fromDateOnly });
      notifySuccess(result.action === 'end' ? `Programación terminada a partir del ${formatDate(date)}.` : 'Programación quitada.');
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo quitar la programación.'));
    } finally {
      setBusy(false);
    }
  };

  // "Terminar a partir de" solo aplica a una recurrente que empezo antes de este dia; el backend lo valida (si no, elimina).
  const canEnd = chip.is_recurring && chip.start_date < date;

  return (
    <ModalShell
      title="Editar programación"
      subtitle={`${target.employeeName} · ${formatDate(date)}`}
      onClose={onClose}
      busy={busy}
      footer={
        removing ? null : (
          <>
            <button type="button" className={dangerButton} onClick={() => setRemoving(true)} disabled={busy}><Trash2 size={15} /> Quitar</button>
            <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="button" className={primaryButton} onClick={() => void save()} disabled={busy}><Save size={15} /> {busy ? 'Guardando…' : 'Guardar'}</button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {chip.duplicate_count > 1 && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} /> Este bloque agrupa {chip.duplicate_count} programaciones idénticas; la edición aplica a la primera y “Quitar” a todas.
          </p>
        )}

        {removing && (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
            <p className="text-sm font-semibold text-red-800">¿Qué quieres quitar?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={dangerButton} disabled={busy} onClick={() => void remove(false)}>Quitar toda la programación</button>
              {canEnd && (
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => void remove(true)}>Terminar a partir del {formatDate(date)}</button>
              )}
              <button type="button" className={secondaryButton} disabled={busy} onClick={() => setRemoving(false)}>Cancelar</button>
            </div>
            {canEnd && <p className="text-xs text-red-800">“Terminar” conserva los días anteriores; si la programación empieza este mismo día se quita por completo.</p>}
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="edit-shift">Turno</label>
          <select id="edit-shift" className={inputClass} value={shiftValue} onChange={(e) => setShiftValue(e.target.value)}>
            <option value={REST}>Descanso</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-notes">Notas</label>
          <input id="edit-notes" className={inputClass} value={notes} maxLength={200} placeholder="Sin cambios" onChange={(e) => { setNotes(e.target.value); setNotesTouched(true); }} />
        </div>

        <div className="rounded-xl border border-[rgba(0,65,106,0.12)] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
            <input type="checkbox" checked={changeValidity} onChange={(e) => setChangeValidity(e.target.checked)} />
            Cambiar vigencia y repetición
          </label>
          {changeValidity && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="edit-start">Desde</label>
                  <input id="edit-start" type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="edit-end">Hasta</label>
                  <input id="edit-end" type="date" className={inputClass} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{repeat.repeats ? 'Vacío = sin fin' : 'Vacío = solo ese día'}</p>
                </div>
              </div>
              <RepeatFields value={repeat} onChange={setRepeat} weekdayOrder={weekdayOrder} />
              <p className="text-xs text-[var(--unilabor-neutral)]">Se reemplazan por completo la vigencia, los días y la repetición de esta programación.</p>
            </div>
          )}
        </div>

        {conflicts && <ConflictList message={conflicts.message} conflicts={conflicts.details} />}
      </div>
    </ModalShell>
  );
};
