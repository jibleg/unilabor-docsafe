import { useState } from 'react';
import { Fingerprint, Loader2, Pencil, ScanFace } from 'lucide-react';
import { enrollEmployee, type AttendanceEmployee, type EnrollMode } from '../../../api/service.api-attendance-employees';
import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { formatDate, formatDateTime } from '../shared/format';
import { AttendanceDataForm } from './AttendanceDataForm';
import { FacePhotoSection } from './FacePhotoSection';
import { ReadinessIcons } from './ReadinessIcons';
import { SYNC_LABEL, syncBadgeClass } from './readiness';
import { cardClass, iconButtonClass, secondaryButtonClass } from './ui';

interface Props {
  employee: AttendanceEmployee;
  branches: AttendanceBranch[];
  canWrite: boolean;
  canDevices: boolean;
  onChanged: (employee: AttendanceEmployee) => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</dt>
    <dd className="mt-0.5 text-sm text-[var(--unilabor-ink)]">{children || '—'}</dd>
  </div>
);

export const AttendanceDataCard = ({ employee, branches, canWrite, canDevices, onChanged }: Props) => {
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState<EnrollMode | null>(null);
  const synced = employee.device_sync_status === 'synced';

  const handleEnroll = async (mode: EnrollMode) => {
    setEnrolling(mode);
    try {
      await enrollEmployee(employee.id, mode);
      notifySuccess(
        mode === 'fingerprint'
          ? 'Orden enviada: pídele que coloque el dedo en el reloj.'
          : 'Orden enviada: pídele que se ubique frente al reloj.',
      );
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo enviar la orden de captura.'));
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-brand-700)]">Datos de asistencia</h2>
        {canWrite && !editing ? (
          <button type="button" className={iconButtonClass} aria-label="Editar datos de asistencia" onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </button>
        ) : null}
      </div>

      {editing ? (
        <AttendanceDataForm
          employee={employee}
          branches={branches}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            onChanged(saved);
          }}
        />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            <Row label="Habilitado">
              <span className={`badge badge-sm ${employee.is_enabled ? 'badge-success' : 'badge-ghost'}`}>{employee.is_enabled ? 'Sí' : 'No'}</span>
            </Row>
            <Row label="Sucursal">{employee.branch_name}</Row>
            <Row label="Número de empleado"><span className="font-mono">{employee.device_employee_number}</span></Row>
            <Row label="Ingreso">{employee.hire_date ? formatDate(employee.hire_date) : null}</Row>
          </dl>
          {employee.is_enabled ? <ReadinessIcons employee={employee} showLabel /> : null}

          <FacePhotoSection employee={employee} canWrite={canWrite} onChanged={onChanged} />

          <div className="rounded-xl border border-[rgba(0,65,106,0.1)] p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-[var(--unilabor-ink)]">Reloj:</span>
              <span className={`badge badge-sm ${syncBadgeClass(employee.device_sync_status)}`}>{SYNC_LABEL[employee.device_sync_status]}</span>
              {employee.device_synced_at ? <span className="text-xs text-[var(--unilabor-neutral)]">{formatDateTime(employee.device_synced_at)}</span> : null}
            </p>
            {employee.device_sync_error ? <p className="mt-1 text-xs text-red-700">{employee.device_sync_error}</p> : null}
            {canDevices ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} disabled={!synced || enrolling !== null} onClick={() => void handleEnroll('fingerprint')}>
                    {enrolling === 'fingerprint' ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} aria-hidden="true" />} Capturar huella
                  </button>
                  <button type="button" className={secondaryButtonClass} disabled={!synced || enrolling !== null} onClick={() => void handleEnroll('face')}>
                    {enrolling === 'face' ? <Loader2 size={15} className="animate-spin" /> : <ScanFace size={15} aria-hidden="true" />} Capturar rostro
                  </button>
                </div>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {synced
                    ? 'El reloj de la sucursal abrirá la captura; el colaborador debe estar frente a él.'
                    : 'Requiere que el colaborador esté sincronizado con el reloj (con sucursal, número y agente activo).'}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
};
