import { Building2, CalendarClock, Fingerprint, Hash, Loader2, type LucideIcon } from 'lucide-react';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { computeReadiness, SYNC_LABEL, type ReadinessKey } from './readiness';

const ICONS: Record<ReadinessKey, LucideIcon> = {
  branch: Building2,
  number: Hash,
  schedule: CalendarClock,
  synced: Fingerprint,
};

/** Iconos "listo para checar": color + tooltip + texto accesible. */
export const ReadinessIcons = ({ employee, showLabel = false }: { employee: AttendanceEmployee; showLabel?: boolean }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {computeReadiness(employee).map((item) => {
      const Icon = item.key === 'synced' && employee.device_sync_status === 'pending' ? Loader2 : ICONS[item.key];
      const warn = item.key === 'synced' && employee.device_sync_status === 'pending';
      const tone = item.ok
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : warn
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-red-300 bg-red-50 text-red-800';
      return (
        <span key={item.key} title={item.detail} className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-semibold ${tone}`}>
          <Icon size={13} aria-hidden="true" />
          <span className={showLabel ? '' : 'sr-only'}>
            {item.key === 'synced' ? SYNC_LABEL[employee.device_sync_status] : `${item.label}: ${item.ok ? 'listo' : 'falta'}`}
          </span>
        </span>
      );
    })}
  </div>
);
