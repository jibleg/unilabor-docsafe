import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { getAttendanceEmployee, type AttendanceEmployee } from '../../api/service.api-attendance-employees';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../api/service.parsers';
import { useHasPermission } from '../../utils/permissions';
import { AttendanceDataCard } from '../../components/attendance/employees/AttendanceDataCard';
import { RecentActivityCard } from '../../components/attendance/employees/RecentActivityCard';
import { ScheduleCard } from '../../components/attendance/employees/ScheduleCard';
import { VacationsCard } from '../../components/attendance/employees/VacationsCard';
import { secondaryButtonClass } from '../../components/attendance/employees/ui';

export const AttendanceEmployeeDetailPage = () => {
  const { id } = useParams();
  const employeeId = Number(id);
  const canWrite = useHasPermission('ATTENDANCE.SCHEDULES.WRITE');
  const canDevices = useHasPermission('ATTENDANCE.DEVICES.MANAGE');
  const canAuthorize = useHasPermission('ATTENDANCE.INCIDENTS.AUTHORIZE');
  const [employee, setEmployee] = useState<AttendanceEmployee | null>(null);
  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setError('Colaborador no válido.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setEmployee(await getAttendanceEmployee(employeeId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar al colaborador.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const back = (
    <Link to="/attendance/employees" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-brand-700)] hover:underline">
      <ArrowLeft size={15} aria-hidden="true" /> Colaboradores
    </Link>
  );

  if (loading && !employee) {
    return (
      <div className="space-y-4">
        {back}
        <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando ficha…</p>
      </div>
    );
  }
  if (error || !employee) {
    return (
      <div className="space-y-4">
        {back}
        <p className="flex items-center gap-2 text-sm text-red-800"><AlertTriangle size={16} /> {error || 'No se encontró al colaborador.'}</p>
        <button type="button" className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h1 className="text-xl font-bold text-[var(--color-brand-700)]">{employee.full_name}</h1>
        <p className="text-sm text-[var(--unilabor-neutral)]">
          {[employee.employee_code, employee.branch_name, employee.area, employee.position].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AttendanceDataCard employee={employee} branches={branches} canWrite={canWrite} canDevices={canDevices} onChanged={setEmployee} />
        <VacationsCard employeeId={employee.id} canAuthorize={canAuthorize} reloadKey={employee.hire_date} />
      </div>
      <ScheduleCard employeeId={employee.id} />
      <RecentActivityCard employeeId={employee.id} employeeName={employee.full_name} />
    </div>
  );
};
