import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, ChevronsLeft, ChevronsRight, Link2, X } from 'lucide-react';
import type { AttendancePunch } from '../../../api/service.api-attendance-days';
import { openAttendanceFile } from '../../../api/service.api-attendance-common';
import { notifyError } from '../../../utils/notify';
import { formatDateTime } from '../shared/format';
import { deviceTimeDiffers, groupPunchesByDay, methodLabel, punchTypeLabel } from './punchHelpers';

const thClass = 'whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const AMBER = '#b97300';

const clockOnly = (value: string): string =>
  new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const Badge = ({ color, text }: { color: string; text: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}>
    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
    {text}
  </span>
);

/** dd mmm en la zona del navegador. */
const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const unique = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((v): v is string => !!v))];

const PunchChip = ({ item }: { item: AttendancePunch }) => {
  const rejected = item.review_status === 'rejected';
  const pending = item.review_status === 'pending';
  return (
    <span
      title={[punchTypeLabel(item.punch_type), methodLabel(item.verification_method), pending ? 'pendiente' : rejected ? 'rechazada' : '']
        .filter(Boolean)
        .join(' · ')}
      className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-[var(--unilabor-ink)] ${rejected ? 'line-through opacity-60' : ''}`}
      style={{ borderColor: pending ? AMBER : 'rgba(0,65,106,0.18)' }}
    >
      {clockOnly(item.punched_at)}
    </span>
  );
};

/** Primera y ultima checada del dia; si hay mas, un indicador "+N" despliega las intermedias. */
const DayPunches = ({ list }: { list: AttendancePunch[] }) => {
  const [expanded, setExpanded] = useState(false);
  const middle = list.slice(1, -1);
  const visible = expanded || middle.length === 0 ? list : [list[0]!, list[list.length - 1]!];
  return (
    <div className="flex max-w-[18rem] flex-wrap items-center gap-1">
      {visible.map((item, index) => (
        <Fragment key={item.id}>
          <PunchChip item={item} />
          {!expanded && middle.length > 0 && index === 0 ? (
            <button
              type="button"
              aria-expanded={false}
              aria-label={`Ver ${middle.length} checada${middle.length === 1 ? '' : 's'} intermedia${middle.length === 1 ? '' : 's'}`}
              title={`Ver ${middle.length} checada${middle.length === 1 ? '' : 's'} más`}
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-brand-500)] bg-[rgba(191,212,230,0.4)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.7)]"
            >
              <ChevronsRight size={12} aria-hidden="true" /> +{middle.length}
            </button>
          ) : null}
        </Fragment>
      ))}
      {expanded ? (
        <button
          type="button"
          aria-expanded
          aria-label="Ocultar checadas intermedias"
          title="Ocultar checadas intermedias"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center rounded-full border border-[rgba(0,65,106,0.18)] p-0.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.4)]"
        >
          <ChevronsLeft size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};

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

const iconBtn = 'rounded-lg p-1.5 transition disabled:opacity-40';

/** Un renglon por colaborador y dia; las acciones de revision van por cada checada pendiente. */
export const PunchesTable = ({ punches, canAuthorize, busyId, onApprove, onReject, onLink }: PunchesTableProps) => {
  const groups = [...groupPunchesByDay(punches).entries()];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
          <tr>
            <th className={thClass}>Colaborador</th>
            <th className={thClass}>Fecha</th>
            <th className={thClass}>Checadas</th>
            <th className={thClass}>Origen</th>
            <th className={thClass}>Método</th>
            <th className={`${thClass} text-center`}>Foto</th>
            <th className={thClass}>Revisión</th>
            {canAuthorize ? <th className={`${thClass} text-center`}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
          {groups.map(([key, list]) => {
            const first = list[0]!;
            const pendingList = list.filter((punch) => punch.review_status === 'pending');
            const reviewed = list.filter((punch) => punch.review_status !== 'none' && punch.review_status !== 'pending');
            const withPhoto = list.filter((punch) => punch.has_photo);
            const origins = unique(
              list.map((punch) => (punch.source === 'manual' ? 'Manual' : [punch.terminal?.name, punch.branch?.name].filter(Boolean).join(' · ') || 'Reloj')),
            );
            return (
              <tr key={key} className={`align-top ${pendingList.length > 0 ? 'bg-[rgba(217,139,0,0.07)]' : ''}`}>
                <td className="px-3 py-3">
                  {first.employee ? (
                    <>
                      <Link to={`/attendance/employees/${first.employee.id}`} className="font-semibold text-[var(--color-brand-700)] hover:underline">
                        {first.employee.full_name}
                      </Link>
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {first.employee.code ?? ''}
                        {first.device_employee_number ? (
                          <span title="Número de empleado" className="ml-1.5 rounded bg-[rgba(191,212,230,0.4)] px-1.5 py-0.5 font-mono font-semibold text-[var(--color-brand-700)]">
                            {first.device_employee_number}
                          </span>
                        ) : null}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold" style={{ color: AMBER }}>Desconocido</p>
                      <p className="text-xs text-[var(--unilabor-neutral)]">Empleado {first.device_employee_number ?? '—'}</p>
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--unilabor-ink)]">{formatDay(first.punched_at)}</td>
                <td className="px-3 py-3">
                  <DayPunches list={list} />
                  {list.some((punch) => deviceTimeDiffers(punch.punched_at, punch.device_reported_at)) ? (
                    <p className="mt-1 text-[11px]" style={{ color: AMBER }}>Hay horas distintas a las del reloj</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-xs text-[var(--unilabor-ink)]">
                  {origins.map((origin) => <p key={origin}>{origin}</p>)}
                </td>
                <td className="px-3 py-3 text-[var(--unilabor-ink)]">
                  {unique(list.map((punch) => methodLabel(punch.verification_method))).join(', ')}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-center">
                  {withPhoto.length > 0 ? (
                    <div className="inline-flex gap-1">
                      {withPhoto.map((punch) => (
                        <button
                          key={punch.id}
                          type="button"
                          aria-label="Ver foto de la checada"
                          title={`Ver foto de ${clockOnly(punch.punched_at)}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.12)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                          onClick={() => {
                            openAttendanceFile(`/attendance/punches/${punch.id}/photo`).catch(() => notifyError('No se pudo abrir la foto.'));
                          }}
                        >
                          <Camera size={15} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[var(--unilabor-neutral)]">—</span>
                  )}
                </td>
                <td className="space-y-2 px-3 py-3">
                  {pendingList.length === 0 && reviewed.length === 0 ? <span className="text-xs text-[var(--unilabor-neutral)]">—</span> : null}
                  {[...pendingList, ...reviewed].map((punch) => (
                    <div key={punch.id}>
                      <p className="font-mono text-[11px] text-[var(--unilabor-neutral)]">{clockOnly(punch.punched_at)}</p>
                      <ReviewCell punch={punch} />
                    </div>
                  ))}
                </td>
                {canAuthorize ? (
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    {pendingList.length > 0 ? (
                      <div className="space-y-1">
                        {pendingList.map((punch) => (
                          <div key={punch.id} className="inline-flex w-full items-center justify-center gap-1">
                            <span className="font-mono text-[11px] text-[var(--unilabor-neutral)]">{clockOnly(punch.punched_at)}</span>
                            {punch.employee === null ? (
                              <button type="button" title="Vincular a colaborador" aria-label="Vincular a colaborador" disabled={busyId === punch.id} onClick={() => onLink(punch)}
                                className={`${iconBtn} text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.4)]`}>
                                <Link2 size={17} />
                              </button>
                            ) : null}
                            <button type="button" title="Aprobar" aria-label="Aprobar checada" disabled={busyId === punch.id} onClick={() => onApprove(punch)}
                              className={`${iconBtn} text-[#0a8a0a] hover:bg-[rgba(12,163,12,0.12)]`}>
                              <Check size={17} />
                            </button>
                            <button type="button" title="Rechazar" aria-label="Rechazar checada" disabled={busyId === punch.id} onClick={() => onReject(punch)}
                              className={`${iconBtn} text-[#d03b3b] hover:bg-[rgba(208,59,59,0.12)]`}>
                              <X size={17} />
                            </button>
                          </div>
                        ))}
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
};
