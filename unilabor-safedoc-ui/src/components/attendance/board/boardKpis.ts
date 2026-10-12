import { Timer, Clock3, Hourglass, LogOut, ShieldAlert, UserCheck, UserX, type LucideIcon } from 'lucide-react';
import type { CommitmentBoard, CommitmentTeam } from '../../../api/service.api-attendance-boards';
import { BAD_COLOR, formatMinutes, formatNumber, formatPercent, percentColor, WARN_COLOR, GOOD_COLOR } from './boardHelpers';

export interface Kpi {
  label: string;
  icon: LucideIcon;
  value: string;
  sub: string;
  color: string;
  bar?: number | null;
}

export const buildKpis = (team: CommitmentTeam, weights: CommitmentBoard['weights']): Kpi[] => [
  { label: 'Asistencia', icon: UserCheck, value: formatPercent(team.pct_attendance), sub: `${formatNumber(team.attendances, 1)} de ${team.expected} días esperados`, color: percentColor(team.pct_attendance, weights), bar: team.pct_attendance },
  { label: 'Puntualidad', icon: Clock3, value: formatPercent(team.pct_punctuality), sub: `${team.punctual} días puntuales`, color: percentColor(team.pct_punctuality, weights), bar: team.pct_punctuality },
  { label: 'Salidas completas', icon: LogOut, value: formatPercent(team.pct_exits), sub: `${team.complete_exits} de ${team.present} con salida`, color: percentColor(team.pct_exits, weights), bar: team.pct_exits },
  { label: 'Retardos', icon: Hourglass, value: String(team.lates), sub: formatMinutes(team.late_minutes) + ' acumulados', color: team.lates === 0 ? GOOD_COLOR : WARN_COLOR },
  { label: 'Faltas', icon: UserX, value: String(team.absences), sub: `${team.partial_absences} parciales`, color: team.absences === 0 ? GOOD_COLOR : BAD_COLOR },
  { label: 'Incidencias', icon: ShieldAlert, value: String(team.incidents), sub: 'días con incidencia', color: '#7c3aed' },
  { label: 'Horas trabajadas', icon: Timer, value: formatNumber(team.hours, 1), sub: `${formatNumber(team.overtime_hours, 1)} h extra`, color: '#034898' },
];

