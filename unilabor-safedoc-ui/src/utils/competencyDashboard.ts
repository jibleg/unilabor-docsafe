import {
  AlertOctagon,
  CircleDashed,
  Clock3,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import type {
  CompetencyDashboard,
  CompetencyDashboardEmployee,
  CompetencyDashboardEvaluation,
  CompetencyStanding,
} from '../types/competencyDashboard';

/** Presentación, filtros y agregados del Tablero de evaluación de competencia. */

export interface StandingMeta {
  label: string;
  description: string;
  color: string;
  soft: string;
  text: string;
  icon: LucideIcon;
}

/** Orden de lectura: de lo que exige acción a lo que está en regla. */
export const STANDING_ORDER: CompetencyStanding[] = [
  'VENCIDA',
  'NO_COMPETENTE',
  'PENDIENTE_AUTORIZACION',
  'POR_VENCER',
  'EN_CAPTURA',
  'SIN_EVALUACION',
  'VIGENTE',
];

export const STANDING_META: Record<CompetencyStanding, StandingMeta> = {
  VIGENTE: {
    label: 'Competente vigente',
    description: 'Autorizado y con vigencia mayor a 60 días',
    color: '#059669',
    soft: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    icon: ShieldCheck,
  },
  POR_VENCER: {
    label: 'Por vencer',
    description: 'La autorización vence en 60 días o menos',
    color: '#d97706',
    soft: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: Clock3,
  },
  VENCIDA: {
    label: 'Vencida',
    description: 'La autorización ya venció: requiere reevaluación',
    color: '#e11d48',
    soft: 'bg-rose-50 border-rose-200',
    text: 'text-rose-700',
    icon: ShieldAlert,
  },
  PENDIENTE_AUTORIZACION: {
    label: 'Pendiente de autorizar',
    description: 'Evaluación cerrada en espera de RH o Dirección',
    color: '#7c3aed',
    soft: 'bg-violet-50 border-violet-200',
    text: 'text-violet-700',
    icon: Stamp,
  },
  EN_CAPTURA: {
    label: 'En captura',
    description: 'Evaluación en borrador, aún sin cerrar',
    color: '#0284c7',
    soft: 'bg-sky-50 border-sky-200',
    text: 'text-sky-700',
    icon: PenLine,
  },
  NO_COMPETENTE: {
    label: 'No competente',
    description: 'Dictamen no competente o no autorizado',
    color: '#9f1239',
    soft: 'bg-rose-100 border-rose-300',
    text: 'text-rose-900',
    icon: AlertOctagon,
  },
  SIN_EVALUACION: {
    label: 'Sin evaluación',
    description: 'Con puesto asignado y sin REH-REG-003',
    color: '#94a3b8',
    soft: 'bg-slate-50 border-slate-200',
    text: 'text-slate-600',
    icon: CircleDashed,
  },
};

export const EVALUATION_TYPE_LABELS: Record<string, string> = {
  INICIAL: 'Inicial',
  PERIODICA: 'Periódica',
  REEVALUACION: 'Reevaluación',
  CAMBIO_PUESTO: 'Cambio de puesto',
  POST_CAPACITACION: 'Post capacitación',
};

export const DICTAMEN_ORDER = [
  'COMPETENTE_Y_AUTORIZADO',
  'COMPETENTE_CON_OBSERVACIONES',
  'COMPETENTE_BAJO_SUPERVISION',
  'NO_COMPETENTE',
] as const;

export const DICTAMEN_COLORS: Record<string, string> = {
  COMPETENTE_Y_AUTORIZADO: '#059669',
  COMPETENTE_CON_OBSERVACIONES: '#0d9488',
  COMPETENTE_BAJO_SUPERVISION: '#d97706',
  NO_COMPETENTE: '#e11d48',
};

/** Las tres secciones del REH-REG-003 con su peso en la calificación final. */
export const SECTION_META = [
  { key: 'competency_pct', label: 'Competencia técnica', weight: 50, color: '#0069a6' },
  { key: 'performance_pct', label: 'Desempeño laboral', weight: 20, color: '#7c3aed' },
  { key: 'knowledge_pct', label: 'Conocimiento', weight: 30, color: '#0d9488' },
] as const;

export type SectionKey = (typeof SECTION_META)[number]['key'];

export interface CompetencyFilters {
  search: string;
  branch: string;
  area: string;
  positionId: string;
  standings: CompetencyStanding[];
  evaluationType: string;
  year: string;
}

export const EMPTY_FILTERS: CompetencyFilters = {
  search: '',
  branch: '',
  area: '',
  positionId: '',
  standings: [...STANDING_ORDER],
  evaluationType: '',
  year: '',
};

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const evaluationMatches = (evaluation: CompetencyDashboardEvaluation, filters: CompetencyFilters): boolean =>
  (!filters.evaluationType || evaluation.evaluation_type === filters.evaluationType) &&
  (!filters.year || evaluation.evaluation_date.startsWith(filters.year)) &&
  (!filters.positionId || String(evaluation.position_id) === filters.positionId);

export const hasEvaluationFilters = (filters: CompetencyFilters): boolean => Boolean(filters.evaluationType || filters.year);

export interface FilteredDashboard {
  employees: CompetencyDashboardEmployee[];
  evaluations: CompetencyDashboardEvaluation[];
}

/**
 * Aplica los filtros a colaboradores y evaluaciones. Los filtros de evaluación
 * (tipo, año) dejan fuera a los colaboradores sin evaluaciones que coincidan.
 */
export const applyFilters = (dashboard: CompetencyDashboard, filters: CompetencyFilters): FilteredDashboard => {
  const term = normalize(filters.search.trim());
  const byEmployee = new Map<number, CompetencyDashboardEvaluation[]>();
  for (const evaluation of dashboard.evaluations) {
    if (!evaluationMatches(evaluation, filters)) continue;
    const list = byEmployee.get(evaluation.employee_id) ?? [];
    list.push(evaluation);
    byEmployee.set(evaluation.employee_id, list);
  }
  const evaluationFilter = hasEvaluationFilters(filters);
  const employees = dashboard.employees.filter((employee) => {
    if (!filters.standings.includes(employee.standing)) return false;
    if (filters.branch && employee.branch_name !== filters.branch) return false;
    if (filters.area && employee.area !== filters.area) return false;
    if (
      filters.positionId &&
      !employee.positions.some((position) => String(position.id) === filters.positionId) &&
      !byEmployee.has(employee.employee_id)
    ) {
      return false;
    }
    if (evaluationFilter && !byEmployee.has(employee.employee_id)) return false;
    if (term) {
      const haystack = normalize(
        [employee.full_name, employee.employee_code, employee.area ?? '', ...employee.positions.map((p) => p.name)].join(' '),
      );
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
  const visible = new Set(employees.map((employee) => employee.employee_id));
  const evaluations = [...byEmployee.values()].flat().filter((evaluation) => visible.has(evaluation.employee_id));
  return { employees, evaluations };
};

export const countByStanding = (employees: CompetencyDashboardEmployee[]): Record<CompetencyStanding, number> => {
  const counts = Object.fromEntries(STANDING_ORDER.map((standing) => [standing, 0])) as Record<CompetencyStanding, number>;
  for (const employee of employees) counts[employee.standing] += 1;
  return counts;
};

const average = (values: number[]): number | null =>
  values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;

export const sectionAverages = (evaluations: CompetencyDashboardEvaluation[]): Record<SectionKey | 'final_pct', number | null> => {
  const closed = evaluations.filter((evaluation) => evaluation.status === 'CLOSED');
  const pick = (key: SectionKey | 'final_pct') =>
    average(closed.map((evaluation) => evaluation[key]).filter((value): value is number => value !== null));
  return {
    competency_pct: pick('competency_pct'),
    performance_pct: pick('performance_pct'),
    knowledge_pct: pick('knowledge_pct'),
    final_pct: pick('final_pct'),
  };
};

export const countByDictamen = (evaluations: CompetencyDashboardEvaluation[]): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(DICTAMEN_ORDER.map((dictamen) => [dictamen, 0]));
  for (const evaluation of evaluations) {
    if (evaluation.status === 'CLOSED' && evaluation.dictamen) counts[evaluation.dictamen] = (counts[evaluation.dictamen] ?? 0) + 1;
  }
  return counts;
};

export interface PositionCoverage {
  position_id: number;
  position_name: string;
  total: number;
  counts: Record<CompetencyStanding, number>;
}

/** Cobertura por puesto: cuántos colaboradores del puesto hay en cada estado. */
export const coverageByPosition = (employees: CompetencyDashboardEmployee[]): PositionCoverage[] => {
  const map = new Map<number, PositionCoverage>();
  for (const employee of employees) {
    for (const position of employee.positions) {
      const entry =
        map.get(position.id) ??
        ({
          position_id: position.id,
          position_name: position.name,
          total: 0,
          counts: countByStanding([]),
        } satisfies PositionCoverage);
      entry.total += 1;
      entry.counts[employee.standing] += 1;
      map.set(position.id, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.position_name.localeCompare(b.position_name));
};

export interface MonthBucket {
  month: string;
  closed: number;
  drafts: number;
  expiring: number;
}

const monthKey = (date: Date): string => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Línea de tiempo de 18 meses (6 atrás, actual y 11 adelante): evaluaciones
 * realizadas (cerradas / en borrador) por fecha de evaluación y vencimientos
 * de autorización por mes.
 */
export const monthlyTimeline = (
  evaluations: CompetencyDashboardEvaluation[],
  employees: CompetencyDashboardEmployee[],
  today: string,
): MonthBucket[] => {
  const base = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const buckets: MonthBucket[] = [];
  for (let offset = -6; offset <= 11; offset += 1) {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    buckets.push({ month: monthKey(date), closed: 0, drafts: 0, expiring: 0 });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.month, i]));
  for (const evaluation of evaluations) {
    const i = index.get(evaluation.evaluation_date.slice(0, 7));
    if (i === undefined) continue;
    if (evaluation.status === 'CLOSED') buckets[i].closed += 1;
    else buckets[i].drafts += 1;
  }
  for (const employee of employees) {
    if (!employee.valid_until || !['VIGENTE', 'POR_VENCER', 'VENCIDA'].includes(employee.standing)) continue;
    const i = index.get(employee.valid_until.slice(0, 7));
    if (i !== undefined) buckets[i].expiring += 1;
  }
  return buckets;
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const formatMonth = (month: string): string => {
  const [year, value] = month.split('-');
  return `${MONTHS[Number(value) - 1] ?? value} ${year.slice(2)}`;
};

export const formatDateTime = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Color de calificación (escala del dictamen: ≥90, 80-89, 70-79, <70). */
export const scoreColor = (value: number | null): string => {
  if (value === null) return '#cbd5e1';
  if (value >= 90) return '#059669';
  if (value >= 80) return '#0d9488';
  if (value >= 70) return '#d97706';
  return '#e11d48';
};

export const uniqueSorted = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
