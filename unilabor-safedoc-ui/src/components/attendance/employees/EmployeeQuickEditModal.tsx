import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { AttendanceDataForm } from './AttendanceDataForm';
import { modalBackdropClass, modalPanelClass } from './ui';

interface Props {
  employee: AttendanceEmployee;
  branches: AttendanceBranch[];
  onSaved: (employee: AttendanceEmployee) => void;
  onClose: () => void;
}

export const EmployeeQuickEditModal = ({ employee, branches, onSaved, onClose }: Props) => (
  <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Edición rápida">
    <div className={`${modalPanelClass} max-w-lg`}>
      <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
        <h2 className="text-base font-bold text-[var(--color-brand-700)]">{employee.full_name}</h2>
        <p className="text-xs text-[var(--unilabor-neutral)]">Datos de asistencia</p>
      </div>
      <div className="overflow-y-auto px-5 py-5">
        <AttendanceDataForm employee={employee} branches={branches} onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  </div>
);
