import { useState } from 'react';
import { AlertTriangle, Loader2, Save, Wand2 } from 'lucide-react';
import {
  patchAttendanceEmployee,
  type AttendanceEmployee,
} from '../../../api/service.api-attendance-employees';
import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifySuccess } from '../../../utils/notify';
import { isValidDeviceNumber } from './readiness';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './ui';

interface Props {
  employee: AttendanceEmployee;
  branches: AttendanceBranch[];
  onSaved: (employee: AttendanceEmployee) => void;
  onCancel: () => void;
}

/** Formulario de datos de asistencia (habilitado, numero de reloj, sucursal, ingreso). */
export const AttendanceDataForm = ({ employee, branches, onSaved, onCancel }: Props) => {
  const [isEnabled, setIsEnabled] = useState(employee.is_enabled);
  const [deviceNumber, setDeviceNumber] = useState(employee.device_employee_number ?? '');
  const [branchId, setBranchId] = useState(employee.branch_id !== null ? String(employee.branch_id) : '');
  const [hireDate, setHireDate] = useState(employee.hire_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const numberInvalid = deviceNumber.trim() !== '' && !isValidDeviceNumber(deviceNumber);

  const handleSave = async () => {
    if (numberInvalid) return setError('El número de reloj admite letras, números y guion (hasta 20).');
    if (isEnabled && (!branchId || !deviceNumber.trim())) {
      return setError('Para habilitar necesitas sucursal y número de reloj.');
    }
    setSaving(true);
    setError('');
    try {
      const saved = await patchAttendanceEmployee(employee.id, {
        is_enabled: isEnabled,
        device_employee_number: deviceNumber.trim() || null,
        branch_id: branchId ? Number(branchId) : null,
        hire_date: hireDate || null,
      });
      notifySuccess('Datos de asistencia guardados.');
      onSaved(saved);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron guardar los datos.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--unilabor-ink)]">
        <input type="checkbox" className="toggle toggle-sm" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
        Habilitado para checar
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`ad-branch-${employee.id}`}>Sucursal</label>
          <select id={`ad-branch-${employee.id}`} className={inputClass} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Sin sucursal</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`ad-hire-${employee.id}`}>Fecha de ingreso</label>
          <input id={`ad-hire-${employee.id}`} type="date" className={inputClass} value={hireDate} onChange={(event) => setHireDate(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`ad-num-${employee.id}`}>Número de reloj</label>
          <div className="flex gap-2">
            <input
              id={`ad-num-${employee.id}`}
              className={`${inputClass} ${numberInvalid ? 'border-red-400' : ''}`}
              maxLength={20}
              aria-invalid={numberInvalid}
              value={deviceNumber}
              onChange={(event) => setDeviceNumber(event.target.value)}
            />
            {employee.suggested_device_number && deviceNumber !== employee.suggested_device_number ? (
              <button type="button" className={secondaryButtonClass} onClick={() => setDeviceNumber(employee.suggested_device_number ?? '')}>
                <Wand2 size={15} aria-hidden="true" /> Usar {employee.suggested_device_number}
              </button>
            ) : null}
          </div>
          <p className={`mt-1 text-xs ${numberInvalid ? 'text-red-700' : 'text-[var(--unilabor-neutral)]'}`}>
            Letras, números y guion, hasta 20 caracteres. No se repite entre colaboradores.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="button" className={primaryButtonClass} onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} aria-hidden="true" />} Guardar
        </button>
      </div>
    </div>
  );
};
