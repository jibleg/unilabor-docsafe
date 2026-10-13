import { useState } from 'react';
import { Moon, Save } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  createShift,
  updateShift,
  type AttendanceShift,
  type ShiftType,
} from '../../../api/service.api-attendance-schedule';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import {
  DEFAULT_PUNCH_WINDOWS, formatHoursValue, grossMinutes, HEX_COLOR, netHours, PALETTE, crossesMidnight, readableTextColor, windowRange,
} from './scheduleHelpers';
import { inputClass, labelClass, primaryButton, secondaryButton } from './ui';

interface ShiftFormProps {
  /** Turno a editar; null = alta. */
  shift: AttendanceShift | null;
  /** Alta pre-llenada con los datos de otro turno (duplicar); se ignora si hay `shift`. */
  template?: AttendanceShift | null;
  onSaved: (shift: AttendanceShift) => void;
  onCancel: () => void;
}

/** Formulario reutilizable de turno (catalogo y alta rapida del calendario). */
export const ShiftForm = ({ shift, template = null, onSaved, onCancel }: ShiftFormProps) => {
  const source = shift ?? template;
  const isCopy = !shift && !!template;
  const [name, setName] = useState(shift ? shift.name : template ? `${template.name} (copia)`.slice(0, 80) : '');
  const [start, setStart] = useState(source?.start_time.slice(0, 5) ?? '08:00');
  const [end, setEnd] = useState(source?.end_time.slice(0, 5) ?? '17:00');
  const [breakMinutes, setBreakMinutes] = useState(source?.break_minutes ?? 0);
  const [shiftType, setShiftType] = useState<ShiftType>(source?.shift_type ?? 'fixed');
  const [color, setColor] = useState(source?.color_hex ?? PALETTE[0] ?? '#034898');
  const [active, setActive] = useState(source?.is_active ?? true);
  const [entryBefore, setEntryBefore] = useState(source?.entry_before_min ?? DEFAULT_PUNCH_WINDOWS.entry_before_min);
  const [entryAfter, setEntryAfter] = useState(source?.entry_after_min ?? DEFAULT_PUNCH_WINDOWS.entry_after_min);
  const [exitBefore, setExitBefore] = useState(source?.exit_before_min ?? DEFAULT_PUNCH_WINDOWS.exit_before_min);
  const [exitAfter, setExitAfter] = useState(source?.exit_after_min ?? DEFAULT_PUNCH_WINDOWS.exit_after_min);
  const [saving, setSaving] = useState(false);

  const gross = grossMinutes(start, end);
  const net = netHours(start, end, breakMinutes);
  const invalidWindow = [entryBefore, entryAfter, exitBefore, exitAfter].some((value) => !Number.isInteger(value) || value < 0 || value > 720);
  const invalidBreak = breakMinutes < 0 || breakMinutes > 480 || breakMinutes >= gross;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const trimmed = name.trim();
    if (trimmed.length < 2) return notifyWarning('El nombre debe tener al menos 2 caracteres.');
    if (!start || !end) return notifyWarning('Indica la entrada y la salida.');
    if (!HEX_COLOR.test(color)) return notifyWarning('El color debe tener el formato #RRGGBB.');
    if (invalidBreak) return notifyWarning('El descanso debe ser de 0 a 480 min y menor que la jornada.');
    if (invalidWindow) return notifyWarning('Las ventanas de checada deben ser de 0 a 720 min.');
    setSaving(true);
    try {
      const payload = {
        name: trimmed, start_time: start, end_time: end, break_minutes: breakMinutes, shift_type: shiftType, color_hex: color,
        entry_before_min: entryBefore, entry_after_min: entryAfter, exit_before_min: exitBefore, exit_after_min: exitAfter,
      };
      const saved = shift
        ? await updateShift(shift.id, { ...payload, is_active: active })
        : await createShift(payload);
      notifySuccess(shift ? 'Turno actualizado.' : isCopy ? 'Turno duplicado.' : 'Turno creado.');
      onSaved(saved);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el turno.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="shift-name">Nombre</label>
        <input id="shift-name" className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ej. Matutino" autoFocus />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass} htmlFor="shift-start">Entrada</label>
          <input id="shift-start" type="time" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="shift-end">Salida</label>
          <input id="shift-end" type="time" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="shift-break">Descanso (min)</label>
          <input id="shift-break" type="number" min={0} max={480} className={inputClass} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} />
        </div>
      </div>

      <div>
        <span className={labelClass}>Tipo</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['fixed', 'Fijo', 'Se evalúa retardo y salida anticipada contra el horario.'],
            ['flexible', 'Flexible', 'Solo cuenta horas: sin retardo ni salida anticipada.'],
          ] as const).map(([value, label, help]) => (
            <label key={value} className={`cursor-pointer rounded-xl border p-2.5 text-sm transition ${shiftType === value ? 'border-[var(--color-brand-500)] bg-[rgba(191,212,230,0.25)]' : 'border-[rgba(0,65,106,0.12)] bg-white'}`}>
              <span className="flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                <input type="radio" name="shift-type" checked={shiftType === value} onChange={() => setShiftType(value)} />
                {label}
              </span>
              <span className="mt-1 block text-xs text-[var(--unilabor-neutral)]">{help}</span>
            </label>
          ))}
        </div>
      </div>

      {shiftType === 'fixed' && (
        <div>
          <span className={labelClass}>Ventana de checada (minutos)</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['Entrada', start, entryBefore, setEntryBefore, entryAfter, setEntryAfter, 'entry'],
              ['Salida', end, exitBefore, setExitBefore, exitAfter, setExitAfter, 'exit'],
            ] as const).map(([label, time, before, setBefore, after, setAfter, key]) => (
              <fieldset key={key} className="rounded-xl border border-[rgba(0,65,106,0.12)] p-3">
                <legend className="px-1 text-xs font-semibold text-[var(--color-brand-700)]">{label}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--unilabor-neutral)]" htmlFor={`shift-${key}-before`}>Antes</label>
                    <input id={`shift-${key}-before`} type="number" min={0} max={720} className={inputClass} value={before} onChange={(e) => setBefore(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--unilabor-neutral)]" htmlFor={`shift-${key}-after`}>Después</label>
                    <input id={`shift-${key}-after`} type="number" min={0} max={720} className={inputClass} value={after} onChange={(e) => setAfter(Number(e.target.value))} />
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-[var(--unilabor-neutral)]">
                  Válida de <span className="font-mono font-semibold text-[var(--unilabor-ink)]">{windowRange(time, before, after)}</span>
                </p>
              </fieldset>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--unilabor-neutral)]">
            La primera checada en la ventana de entrada es la entrada; la última en la ventana de salida es la salida. Fuera de ellas no cuentan.
          </p>
        </div>
      )}

      <div>
        <span className={labelClass}>Color</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="color" aria-label="Elegir color" value={HEX_COLOR.test(color) ? color : '#034898'} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-[rgba(0,65,106,0.12)] bg-white p-0.5" />
          {PALETTE.map((swatch) => (
            <button key={swatch} type="button" aria-label={`Color ${swatch}`} onClick={() => setColor(swatch)} className={`h-7 w-7 rounded-full border-2 transition ${color.toLowerCase() === swatch.toLowerCase() ? 'scale-110 border-[var(--unilabor-ink)]' : 'border-white shadow'}`} style={{ backgroundColor: swatch }} />
          ))}
        </div>
      </div>

      {shift && (
        <label className="flex items-center gap-2 text-sm text-[var(--unilabor-ink)]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Turno activo (los inactivos no se pueden programar ni cuentan en la asistencia)
        </label>
      )}

      <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.2)] bg-[rgba(248,251,253,0.8)] p-3">
        <span className={labelClass}>Vista previa</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: color, color: readableTextColor(color) }}>
            {start}-{end} · {formatHoursValue(net)} · {name.trim() || 'Nuevo turno'}
          </span>
          {crossesMidnight(start, end) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              <Moon size={12} /> Cruza medianoche: la salida es al día siguiente
            </span>
          )}
        </div>
        {invalidBreak && <p className="mt-2 text-xs font-semibold text-red-700">El descanso debe estar entre 0 y 480 min y ser menor que la jornada ({Math.round(gross)} min).</p>}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className={primaryButton} disabled={saving}>
          <Save size={15} /> {saving ? (isCopy ? 'Creando copia…' : 'Guardando…') : isCopy ? 'Crear copia' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};
