import { Power, PowerOff, Pencil, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { formatDate } from '../shared/format';
import { ReadinessIcons } from './ReadinessIcons';
import { iconButtonClass, thClass } from './ui';

interface Props {
  employees: AttendanceEmployee[];
  canWrite: boolean;
  onToggle: (employee: AttendanceEmployee) => void;
  onEdit: (employee: AttendanceEmployee) => void;
}

export const EmployeesTable = ({ employees, canWrite, onToggle, onEdit }: Props) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[820px] text-left">
      <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
        <tr>
          <th className={thClass}>Colaborador</th>
          <th className={thClass}>Sucursal</th>
          <th className={thClass}>N.º reloj</th>
          <th className={thClass}>Ingreso</th>
          <th className={thClass}>Listo para checar</th>
          <th className={`${thClass} text-right`}>Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
        {employees.map((employee) => (
          <tr key={employee.id} className={`align-top hover:bg-[rgba(191,212,230,0.12)] ${employee.is_enabled ? '' : 'opacity-75'}`}>
            <td className="px-4 py-3">
              <Link to={`/attendance/employees/${employee.id}`} className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline">
                {employee.full_name}
              </Link>
              <p className="text-xs text-[var(--unilabor-neutral)]">
                {[employee.employee_code, employee.area, employee.position].filter(Boolean).join(' · ')}
              </p>
              {!employee.is_enabled ? <span className="badge badge-ghost badge-xs mt-1">No habilitado</span> : null}
            </td>
            <td className="px-4 py-3 text-sm">{employee.branch_name ?? <span className="text-[var(--unilabor-neutral)]">—</span>}</td>
            <td className="px-4 py-3 text-sm font-mono">{employee.device_employee_number ?? <span className="text-[var(--unilabor-neutral)]">—</span>}</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm">{formatDate(employee.hire_date)}</td>
            <td className="px-4 py-3">
              {employee.is_enabled ? <ReadinessIcons employee={employee} /> : <span className="text-xs text-[var(--unilabor-neutral)]">Sin habilitar</span>}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-1">
                <Link to={`/attendance/employees/${employee.id}`} className={iconButtonClass} aria-label={`Ficha de ${employee.full_name}`}>
                  <UserRound size={15} />
                </Link>
                {canWrite ? (
                  <>
                    <button type="button" className={iconButtonClass} aria-label={`Editar ${employee.full_name}`} onClick={() => onEdit(employee)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={employee.is_enabled ? `Deshabilitar a ${employee.full_name}` : `Habilitar a ${employee.full_name}`}
                      onClick={() => onToggle(employee)}
                    >
                      {employee.is_enabled ? <PowerOff size={15} /> : <Power size={15} />}
                    </button>
                  </>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
