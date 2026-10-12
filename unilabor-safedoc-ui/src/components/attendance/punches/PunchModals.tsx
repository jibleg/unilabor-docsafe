import { useState } from 'react';
import { Link2, Loader2, XCircle } from 'lucide-react';
import { linkPunchToEmployee, reviewAttendancePunch, type AttendancePunch } from '../../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../../api/service';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { formatDateTime } from '../shared/format';
import { EmployeePicker } from './EmployeePicker';
import { ModalShell } from './ModalShell';
import { dangerButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './formStyles';
import { describeRecalculation, isReasonValid } from './punchHelpers';

interface PunchModalProps {
  punch: AttendancePunch;
  onClose: () => void;
  onDone: () => void;
}

/** Rechazo de una checada pendiente: motivo obligatorio (>= 5 caracteres). */
export const RejectPunchModal = ({ punch, onClose, onDone }: PunchModalProps) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const invalid = !isReasonValid(reason);

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      const result = await reviewAttendancePunch(punch.id, 'reject', reason.trim());
      notifySuccess(`Checada rechazada. ${describeRecalculation(result.recalculation)}`);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo rechazar la checada.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Rechazar checada"
      subtitle={`${punch.employee?.full_name ?? `Reloj ${punch.device_employee_number ?? '—'}`} · ${formatDateTime(punch.punched_at)}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className={dangerButtonClass} disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} Rechazar
          </button>
        </>
      }
    >
      <label className="block">
        <span className={labelClass}>Motivo (mín. 5 caracteres)</span>
        <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {touched && invalid ? <p role="alert" className="text-xs font-semibold text-[#d03b3b]">El motivo debe tener al menos 5 caracteres.</p> : null}
    </ModalShell>
  );
};

/** Vincula una checada de numero desconocido a un colaborador (una sola vez). */
export const LinkPunchModal = ({ punch, onClose, onDone }: PunchModalProps) => {
  const [employeeId, setEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const result = await linkPunchToEmployee(punch.id, Number(employeeId));
      notifySuccess(`Checada vinculada. ${describeRecalculation(result.recalculation)}`);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo vincular la checada.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Vincular a colaborador"
      subtitle={`Reloj ${punch.device_employee_number ?? '—'} · ${formatDateTime(punch.punched_at)}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButtonClass} disabled={saving || !employeeId} onClick={() => void submit()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Vincular
          </button>
        </>
      }
    >
      <p className="text-xs text-[var(--unilabor-neutral)]">La vinculación se hace una sola vez y recalcula el día del colaborador.</p>
      <div>
        <span className={labelClass}>Colaborador</span>
        <EmployeePicker value={employeeId} onChange={setEmployeeId} emptyLabel="" placeholder="Busca un colaborador" />
      </div>
    </ModalShell>
  );
};
