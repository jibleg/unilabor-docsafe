import { Ban, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { IncidentStatus } from '../../../api/service.api-attendance-incidents';
import { STATUS_BADGE_CLASS, STATUS_LABEL } from './incidentFormat';

const ICONS = { captured: Clock, authorized: CheckCircle2, rejected: XCircle, cancelled: Ban } as const;

export const IncidentStatusBadge = ({ status }: { status: IncidentStatus }) => {
  const Icon = ICONS[status];
  return (
    <span className={`badge badge-sm gap-1 whitespace-nowrap ${STATUS_BADGE_CLASS[status]}`}>
      <Icon size={12} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
};
