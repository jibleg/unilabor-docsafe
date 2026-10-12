import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, TimerOff, Users, type LucideIcon } from 'lucide-react';
import type { LiveBoard } from '../../../api/service.api-attendance-boards';
import { BAD_COLOR, GOOD_COLOR, LIVE_STATUS_META, WARN_COLOR, clampPercent } from './boardHelpers';
import { ProgressRing } from './BoardParts';
import { cardClass } from './boardStyles';

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  to: string;
  hint: string;
}

const KpiCard = ({ label, value, icon: Icon, color, to, hint }: KpiCardProps) => (
  <Link to={to} aria-label={`${label}: ${value}. ${hint}`}
    className={`${cardClass} group flex items-center gap-3 !p-4 transition hover:-translate-y-0.5 hover:border-[var(--color-brand-300)]`}>
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${color}1f`, color }}>
      <Icon size={22} />
    </span>
    <span className="min-w-0">
      <span className="block text-3xl font-black leading-none text-[var(--color-brand-700)]">{value}</span>
      <span className="mt-1 block truncate text-xs text-[var(--unilabor-neutral)]">{label}</span>
    </span>
  </Link>
);

export const LiveKpis = ({ board, branchId }: { board: LiveBoard; branchId: string }) => {
  const { kpis } = board;
  const branchQuery = branchId ? `&branch_id=${branchId}` : '';
  const peopleLink = (status: string) => `/attendance/days?from=${board.date}&to=${board.date}&result=${status}${branchQuery}`;
  const cards: KpiCardProps[] = [
    { label: 'Esperados', value: kpis.expected, icon: Users, color: '#034898', to: `/attendance/days?from=${board.date}&to=${board.date}${branchQuery}`, hint: 'Ver días' },
    { label: 'Presentes', value: kpis.present, icon: CheckCircle2, color: GOOD_COLOR, to: peopleLink('present'), hint: 'Ver presentes' },
    { label: 'Tarde', value: kpis.late, icon: Clock, color: WARN_COLOR, to: peopleLink('late'), hint: 'Ver retardos' },
    { label: 'Sin checar', value: kpis.missing, icon: TimerOff, color: BAD_COLOR, to: peopleLink('absent'), hint: 'Ver faltas' },
    { label: 'Incidencia', value: kpis.incident, icon: AlertTriangle, color: '#7c3aed', to: peopleLink('incident'), hint: 'Ver incidencias' },
    { label: 'En revisión', value: kpis.pending_review, icon: ClipboardCheck, color: '#0284c7', to: '/attendance/punches?review=pending', hint: 'Revisar checadas' },
  ];
  const pct = clampPercent(board.progress_percent);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className={`${cardClass} flex items-center gap-4 !p-4`}>
        <ProgressRing value={pct} color={pct >= 95 ? GOOD_COLOR : pct >= 70 ? WARN_COLOR : BAD_COLOR}
          size={96} label={`${pct}%`} sub="llegaron" />
        <div className="min-w-[10rem]">
          <p className="text-sm font-semibold text-[var(--color-brand-700)]">
            {kpis.present} de {kpis.expected} esperados
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(0,65,106,0.1)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--color-brand-500)]" style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
          </div>
          <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
            {board.by_status.map((item) => `${item.count} ${(LIVE_STATUS_META[item.status]?.label ?? item.status).toLowerCase()}`).join(' · ') || 'Sin movimientos'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </div>
    </div>
  );
};
