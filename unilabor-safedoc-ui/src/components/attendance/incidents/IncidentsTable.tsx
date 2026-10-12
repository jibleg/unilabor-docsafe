import { Check, Eye, Paperclip, Slash, X } from 'lucide-react';
import type { Incident } from '../../../api/service.api-attendance-incidents';
import { ActionsMenu, type ActionMenuItem } from '../../ActionsMenu';
import { formatDate } from '../shared/format';
import { iconButtonClass, thClass } from '../employees/ui';
import { availableActions, formatIncidentDuration } from './incidentFormat';
import { IncidentStatusBadge } from './IncidentStatusBadge';

interface Props {
  incidents: Incident[];
  canAuthorize: boolean;
  onOpen: (incident: Incident) => void;
  onAuthorize: (incident: Incident) => void;
  onReject: (incident: Incident) => void;
  onCancel: (incident: Incident) => void;
}

export const IncidentsTable = ({ incidents, canAuthorize, onOpen, onAuthorize, onReject, onCancel }: Props) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[860px] text-left">
      <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
        <tr>
          <th className={thClass}>Colaborador</th>
          <th className={thClass}>Incidencia</th>
          <th className={thClass}>Periodo</th>
          <th className={thClass}>Duración</th>
          <th className={thClass}>Estado</th>
          <th className={thClass}>Captura → decisión</th>
          <th className={`${thClass} text-right`}>Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
        {incidents.map((incident) => {
          const actions = availableActions(incident.status);
          const items: ActionMenuItem[] = [];
          if (canAuthorize && actions.canAuthorize) items.push({ key: 'authorize', label: 'Autorizar', icon: <Check size={14} />, onClick: () => onAuthorize(incident) });
          if (canAuthorize && actions.canReject) items.push({ key: 'reject', label: 'Rechazar', icon: <X size={14} />, onClick: () => onReject(incident), danger: true });
          if (canAuthorize && actions.canCancel) items.push({ key: 'cancel', label: 'Cancelar', icon: <Slash size={14} />, onClick: () => onCancel(incident), danger: true });
          const dim = incident.status === 'cancelled' ? 'opacity-60' : '';
          return (
            <tr key={incident.id} className={`align-top hover:bg-[rgba(191,212,230,0.12)] ${dim}`}>
              <td className="px-4 py-3">
                <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{incident.employee.full_name}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {[incident.employee.employee_code, incident.employee.branch_name].filter(Boolean).join(' · ')}
                </p>
              </td>
              <td className="px-4 py-3 text-sm">
                <p className="font-semibold text-[var(--unilabor-ink)]">{incident.type.name}</p>
                {incident.imss_folio ? <p className="text-xs text-[var(--unilabor-neutral)]">Folio IMSS {incident.imss_folio}</p> : null}
                {incident.reason ? <p className="max-w-[240px] truncate text-xs text-[var(--unilabor-neutral)]" title={incident.reason}>{incident.reason}</p> : null}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                {formatDate(incident.start_date)}
                {incident.end_date !== incident.start_date ? <><br />{formatDate(incident.end_date)}</> : null}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">{formatIncidentDuration(incident)}</td>
              <td className="px-4 py-3"><IncidentStatusBadge status={incident.status} /></td>
              <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                {incident.captured_by_name ?? '—'}
                {incident.authorized_by_name ? <> → {incident.authorized_by_name}</> : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {incident.attachments_count > 0 ? (
                    <button type="button" className={`${iconButtonClass} w-auto gap-1 px-2 text-xs`} aria-label={`${incident.attachments_count} comprobante(s): ver`} onClick={() => onOpen(incident)}>
                      <Paperclip size={14} /> {incident.attachments_count}
                    </button>
                  ) : null}
                  <button type="button" className={iconButtonClass} aria-label="Ver detalle" onClick={() => onOpen(incident)}>
                    <Eye size={15} />
                  </button>
                  {items.length > 0 ? <ActionsMenu items={items} /> : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
