import { useState } from 'react';
import { Loader2, PenLine } from 'lucide-react';
import { createManualPunch, type AttendanceEmployeeOption } from '../../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../../api/service';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { todayIso } from '../shared/format';
import { EmployeePicker } from './EmployeePicker';
import { ModalShell } from './ModalShell';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './formStyles';
import { MAX_JUSTIFICATION, describeRecalculation, validateManualPunch } from './punchHelpers';

interface ManualPunchModalProps {
  onClose: () => void;
  onDone: () => void;
  /** Precarga desde una fila de Dias (colaborador y fecha fijos). */
  preset?: { employee: AttendanceEmployeeOption; date: string };
}

export const ManualPunchModal = ({ onClose, onDone, preset }: ManualPunchModalProps) => {
  const [employeeId, setEmployeeId] = useState(preset ? String(preset.employee.id) : '');
  const [date, setDate] = useState(preset?.date ?? '');
  const [time, setTime] = useState('');
  const [type, setType] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const validation = validateManualPunch({ employeeId, date, time, reason });

  const submit = async () => {
    setTouched(true);
    if (validation) return;
    setSaving(true);
    try {
      const result = await createManualPunch({
        employee_id: Number(employeeId),
        work_date: date,
        time,
        punch_type: type,
        justification: reason.trim(),
      });
      notifySuccess(`Checada manual registrada. ${describeRecalculation(result.recalculation)}`);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la checada manual.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Checada manual"
      subtitle="Queda registrada con tu usuario y el motivo; no se puede editar ni borrar."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButtonClass} disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
            Registrar
          </button>
        </>
      }
    >
      <div>
        <span className={labelClass}>Colaborador</span>
        {preset ? (
          <p className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)]">{preset.employee.full_name}</p>
        ) : (
          <EmployeePicker value={employeeId} onChange={setEmployeeId} emptyLabel="" placeholder="Busca un colaborador" />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className={labelClass}>Fecha</span>
          <input type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Hora</span>
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Tipo</span>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}>
            <option value="in">Entrada</option>
            <option value="out">Salida</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Motivo (mín. 5 caracteres)</span>
        <textarea className={inputClass} rows={3} maxLength={MAX_JUSTIFICATION} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {touched && validation ? <p role="alert" className={`text-xs font-semibold text-[#d03b3b]`}>{validation}</p> : null}
    </ModalShell>
  );
};
