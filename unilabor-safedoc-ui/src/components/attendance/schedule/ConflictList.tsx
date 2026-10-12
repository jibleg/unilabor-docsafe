import { AlertTriangle } from 'lucide-react';
import type { ScheduleConflictDetail } from '../../../api/service.api-attendance-schedule';
import { formatDateShort } from '../shared/format';

/** Conflictos 409 del backend, agrupados por colaborador y dia. */
export const ConflictList = ({ message, conflicts }: { message?: string; conflicts: ScheduleConflictDetail[] }) => (
  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
    <p className="flex items-center gap-2 font-semibold">
      <AlertTriangle size={16} /> No se guardó: hay conflictos de horario
    </p>
    {message && conflicts.length === 0 && <p className="mt-1 text-xs">{message}</p>}
    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
      {conflicts.map((detail) => (
        <div key={detail.employee_id} className="rounded-lg bg-white/70 p-2">
          <p className="text-xs font-bold">{detail.employee_name}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {detail.conflicts.map((conflict) => (
              <li key={`${conflict.date}-${conflict.message}`}>
                <span className="font-semibold capitalize">{formatDateShort(conflict.date)}</span>: {conflict.message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </div>
);
