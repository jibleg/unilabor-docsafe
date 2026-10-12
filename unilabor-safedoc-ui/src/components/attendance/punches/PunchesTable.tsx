import { Link } from 'react-router-dom';
import { Camera, Check, Link2, X } from 'lucide-react';
import type { AttendancePunch } from '../../../api/service.api-attendance-days';
import { openAttendanceFile } from '../../../api/service.api-attendance-common';
import { notifyError } from '../../../utils/notify';
import { formatDateTime } from '../shared/format';
import { deviceTimeDiffers, methodLabel, punchTypeLabel } from './punchHelpers';

const thClass = 'whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const AMBER = '#b97300';

/** dd mmm HH:MM:SS en la zona del navegador. */
const formatMoment = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  const time = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${day} ${time}`;
};

const clockOnly = (value: string): string =>
  new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const Badge = ({ color, text }: { color: string; text: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}>
    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
    {text}
  </span>
);

const ReviewCell = ({ punch }: { punch: AttendancePunch }) => {
  if (punch.review_status === 'pending') {
    return (
      <span title={punch.review_reason ?? 'Pendiente de revisión'}>
        <Badge color={AMBER} text="Pendiente" />
        {punch.review_reason ? <p className="mt-1 max-w-[16rem] text-[11px] text-[var(--unilabor-neutral)]">{punch.review_reason}</p> : null}
      </span>
    );
  }
  if (punch.review_status === 'approved' || punch.review_status === 'rejected') {
    const approved = punch.review_status === 'approved';
    return (
      <div>
        <Badge color={approved ? '#0ca30c' : '#d03b3b'} text={approved ? 'Aprobada' : 'Rechazada'} />
        <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
          {[punch.reviewed_by_name, punch.reviewed_at ? formatDateTime(punch.reviewed_at) : ''].filter(Boolean).join(' · ')}
        </p>
        {!approved && punch.review_reason ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{punch.review_reason}</p> : null}
      </div>
    );
  }
  return <span className="text-xs text-[var(--unilabor-neutral)]">—</span>;
};

interface PunchesTableProps {
  punches: AttendancePunch[];
  canAuthorize: boolean;
  busyId: number | null;
  onApprove: (punch: AttendancePunch) => void;
  onReject: (punch: AttendancePunch) => void;
  onLink: (punch: AttendancePunch) => void;
}

export const PunchesTable = ({ punches, canAuthorize, busyId, onApprove, onReject, onLink }: PunchesTableProps) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
        <tr>
          <th className={thClass}>Colaborador</th>
          <th className={thClass}>Momento</th>
          <th className={thClass}>Tipo</th>
          <th className={thClass}>Origen</th>
          <th className={thClass}>Método</th>
          <th className={`${thClass} text-center`}>Foto</th>
          <th className={thClass}>Revisión</th>
          {canAuthorize ? <th className={`${thClass} text-center`}>Acciones</th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
        {punches.map((punch) => {
          const pending = punch.review_status === 'pending';
          return (
            <tr key={punch.id} className={`align-top ${pending ? 'bg-[rgba(217,139,0,0.07)]' : ''}`}>
              <td className="px-3 py-3">
                {punch.employee ? (
                  <>
                    <Link to={`/attendance/employees/${punch.employee.id}`} className="font-semibold text-[var(--color-brand-700)] hover:underline">
                      {punch.employee.full_name}
                    </Link>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{punch.employee.code ?? ''}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold" style={{ color: AMBER }}>Desconocido</p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">Reloj {punch.device_employee_number ?? '—'}</p>
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-[var(--unilabor-ink)]">
                <p>{formatMoment(punch.punched_at)}</p>
                {deviceTimeDiffers(punch.punched_at, punch.device_reported_at) && punch.device_reported_at ? (
                  <p className="text-[11px]" style={{ color: AMBER }}>reloj {clockOnly(punch.device_reported_at)}</p>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-[var(--unilabor-ink)]">{punchTypeLabel(punch.punch_type)}</td>
              <td className="px-3 py-3">
                <p className="text-[var(--unilabor-ink)]">{punch.source === 'manual' ? 'Manual' : 'Reloj'}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {punch.source === 'manual'
                    ? [punch.registered_by_name, punch.manual_justification].filter(Boolean).join(' · ')
                    : [punch.terminal?.name, punch.branch?.name].filter(Boolean).join(' · ')}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-[var(--unilabor-ink)]">{methodLabel(punch.verification_method)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-center">
                {punch.has_photo ? (
                  <button
                    type="button"
                    aria-label="Ver foto de la checada"
                    title="Ver foto"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.12)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                    onClick={() => {
                      openAttendanceFile(`/attendance/punches/${punch.id}/photo`).catch(() => notifyError('No se pudo abrir la foto.'));
                    }}
                  >
                    <Camera size={15} />
                  </button>
                ) : (
                  <span className="text-[var(--unilabor-neutral)]">—</span>
                )}
              </td>
              <td className="px-3 py-3"><ReviewCell punch={punch} /></td>
              {canAuthorize ? (
                <td className="whitespace-nowrap px-3 py-3 text-center">
                  {pending ? (
                    <div className="inline-flex items-center gap-1">
                      {punch.employee === null ? (
                        <button type="button" title="Vincular a colaborador" aria-label="Vincular a colaborador" disabled={busyId === punch.id} onClick={() => onLink(punch)}
                          className="rounded-lg p-1.5 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)] disabled:opacity-40">
                          <Link2 size={17} />
                        </button>
                      ) : null}
                      <button type="button" title="Aprobar" aria-label="Aprobar checada" disabled={busyId === punch.id} onClick={() => onApprove(punch)}
                        className="rounded-lg p-1.5 text-[#0a8a0a] transition hover:bg-[rgba(12,163,12,0.12)] disabled:opacity-40">
                        <Check size={17} />
                      </button>
                      <button type="button" title="Rechazar" aria-label="Rechazar checada" disabled={busyId === punch.id} onClick={() => onReject(punch)}
                        className="rounded-lg p-1.5 text-[#d03b3b] transition hover:bg-[rgba(208,59,59,0.12)] disabled:opacity-40">
                        <X size={17} />
                      </button>
                    </div>
                  ) : (
                    <span title="Solo las checadas pendientes se revisan" className="text-[var(--unilabor-neutral)]">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
