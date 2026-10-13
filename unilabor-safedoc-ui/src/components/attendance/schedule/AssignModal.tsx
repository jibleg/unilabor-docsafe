import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Save } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  createAssignments,
  extractScheduleConflicts,
  type AttendanceShift,
  type ScheduleConflictDetail,
} from '../../../api/service.api-attendance-schedule';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { ConflictList } from './ConflictList';
import { DrawerShell } from './DrawerShell';
import { ModalShell } from './ModalShell';
import { RepeatFields, type RepeatState } from './RepeatFields';
import { ShiftForm } from './ShiftForm';
import { REST, ShiftMultiSelect, type ShiftSelection } from './ShiftMultiSelect';
import { describeWeekdays, findOverlaps, formatHoursValue, isoWeekday, readableTextColor, totalNetHours } from './scheduleHelpers';
import { inputClass, labelClass, primaryButton, secondaryButton } from './ui';

export interface AssignTarget {
  id: number;
  name: string;
}

interface AssignModalProps {
  employees: AssignTarget[];
  shifts: AttendanceShift[];
  weekdayOrder: number[];
  maxShiftsPerDay: number;
  initialDate: string;
  /** Algun colaborador elegido ya tiene turnos ese dia (true/false) o se desconoce (null). */
  hasExistingOnDate: (date: string) => boolean | null;
  onClose: () => void;
  onSaved: () => void;
  onShiftCreated: (shift: AttendanceShift) => void;
}

export const AssignModal = ({ employees, shifts, weekdayOrder, maxShiftsPerDay, initialDate, hasExistingOnDate, onClose, onSaved, onShiftCreated }: AssignModalProps) => {
  const [selection, setSelection] = useState<ShiftSelection>([]);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState('');
  const [repeat, setRepeat] = useState<RepeatState>({ repeats: false, weekInterval: 1, weekdays: [1, 2, 3, 4, 5] });
  const [notes, setNotes] = useState('');
  const [keepExisting, setKeepExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [conflicts, setConflicts] = useState<{ message: string; details: ScheduleConflictDetail[] } | null>(null);

  const isRest = selection.includes(REST);
  const chosen = useMemo(() => shifts.filter((s) => selection.includes(s.id)), [shifts, selection]);
  const overlaps = useMemo(() => findOverlaps(chosen), [chosen]);
  const overLimit = chosen.length > maxShiftsPerDay;
  const existing = !repeat.repeats ? hasExistingOnDate(startDate) : false;

  const toggleShift = (id: number | typeof REST) => {
    setConflicts(null);
    setSelection((prev) => {
      if (id === REST) return prev.includes(REST) ? [] : [REST];
      const without = prev.filter((x) => x !== REST);
      return without.includes(id) ? without.filter((x) => x !== id) : [...without, id];
    });
  };

  const submit = async () => {
    if (selection.length === 0) return notifyWarning('Elige al menos un turno o Descanso.');
    if (!startDate) return notifyWarning('Indica la fecha de inicio.');
    if (endDate && endDate < startDate) return notifyWarning('La fecha final no puede ser anterior a la inicial.');
    if (repeat.repeats && repeat.weekdays.length === 0) return notifyWarning('Elige al menos un día de la semana.');
    if (overLimit) return notifyWarning(`El máximo es de ${maxShiftsPerDay} turnos por día.`);
    if (overlaps.length > 0) return notifyWarning('Hay turnos que se enciman entre sí.');
    setSaving(true);
    setConflicts(null);
    try {
      const created = await createAssignments({
        employee_ids: employees.map((e) => e.id),
        shift_ids: isRest ? [] : chosen.map((s) => s.id),
        start_date: startDate,
        end_date: repeat.repeats ? endDate || null : endDate || startDate,
        repeats_weekly: repeat.repeats,
        week_interval: repeat.weekInterval,
        weekdays: repeat.repeats ? repeat.weekdays : [isoWeekday(startDate)],
        notes: notes.trim() || null,
        keep_existing: !repeat.repeats && keepExisting,
      });
      notifySuccess(`Horario programado (${created.length} ${created.length === 1 ? 'programación' : 'programaciones'}).`);
      onSaved();
    } catch (error) {
      const details = extractScheduleConflicts(error);
      if (details) setConflicts({ message: getApiErrorMessage(error, 'Hay conflictos de horario.'), details });
      else notifyError(getApiErrorMessage(error, 'No se pudo programar el horario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalShell
        title="Programar turno"
        subtitle={employees.length === 1 ? employees[0]?.name : `${employees.length} colaboradores`}
        onClose={onClose}
        busy={saving}
        widthClass="max-w-2xl"
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className={primaryButton} onClick={() => void submit()} disabled={saving || selection.length === 0}>
              <Save size={15} /> {saving ? 'Guardando…' : 'Programar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {employees.length > 1 && (
            <p className="max-h-16 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-[var(--unilabor-neutral)]">
              {employees.map((e) => e.name).join(' · ')}
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={`${labelClass} mb-0`}>Turnos</span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline" onClick={() => setCreating(true)}>
                <Plus size={13} /> Nuevo turno
              </button>
            </div>
            <ShiftMultiSelect shifts={shifts} selection={selection} onToggle={toggleShift} />
            {shifts.length === 0 && <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">No hay turnos activos; crea uno con “Nuevo turno”.</p>}
          </div>

          {chosen.length > 1 && (
            <div className={`rounded-xl border p-2.5 text-xs ${overLimit || overlaps.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <p className="font-semibold">Jornada partida · {chosen.length} tramos · {formatHoursValue(totalNetHours(chosen))}</p>
              {overLimit && <p className="mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Máximo {maxShiftsPerDay} turnos por día.</p>}
              {overlaps.map(([a, b]) => (
                <p key={`${a}-${b}`} className="mt-1 flex items-center gap-1"><AlertTriangle size={12} /> «{a}» se encima con «{b}».</p>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="assign-start">Desde</label>
              <input id="assign-start" type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="assign-end">Hasta</label>
              <input id="assign-end" type="date" className={inputClass} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{repeat.repeats ? 'Vacío = sin fin' : 'Vacío = solo ese día'}</p>
            </div>
          </div>

          <RepeatFields value={repeat} onChange={setRepeat} weekdayOrder={weekdayOrder} />
          {repeat.repeats && repeat.weekdays.length > 0 && (
            <p className="-mt-2 text-xs text-[var(--unilabor-neutral)]">
              {describeWeekdays(repeat.weekdays)}{repeat.weekInterval > 1 ? ` · cada ${repeat.weekInterval} semanas` : ''}
            </p>
          )}

          {!repeat.repeats && !isRest && (existing !== false) && (
            <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <legend className="px-1 text-xs font-semibold text-amber-800">
                {existing ? 'Ese día ya tiene turnos' : 'Si ese día ya tiene turnos'}
              </legend>
              <label className="flex items-center gap-2"><input type="radio" checked={keepExisting} onChange={() => setKeepExisting(true)} /> Agregar a los turnos del día</label>
              <label className="mt-1 flex items-center gap-2"><input type="radio" checked={!keepExisting} onChange={() => setKeepExisting(false)} /> Reemplazar los turnos del día</label>
            </fieldset>
          )}

          <div>
            <label className={labelClass} htmlFor="assign-notes">Notas</label>
            <input id="assign-notes" className={inputClass} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>

          {chosen.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Turnos elegidos">
              {chosen.map((s) => (
                <span key={s.id} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: s.color_hex, color: readableTextColor(s.color_hex) }}>{s.name}</span>
              ))}
            </div>
          )}

          {conflicts && <ConflictList message={conflicts.message} conflicts={conflicts.details} />}
        </div>
      </ModalShell>

      <DrawerShell open={creating} title="Nuevo turno" onClose={() => setCreating(false)}>
        <ShiftForm
          shift={null}
          onCancel={() => setCreating(false)}
          onSaved={(shift) => {
            setCreating(false);
            onShiftCreated(shift);
            setSelection((prev) => [...prev.filter((x) => x !== REST), shift.id]);
          }}
        />
      </DrawerShell>
    </>
  );
};
