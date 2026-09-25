import { useMemo } from 'react';
import {
  Award,
  BookOpen,
  Coffee,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
  Square,
  StepForward,
  Trash2,
  UserPen,
} from 'lucide-react';
import { ActionsMenu, type ActionMenuItem } from '../../ActionsMenu';
import { MultiSelectFilter } from '../../MultiSelectFilter';
import { Pagination } from '../../Pagination';
import type { InductionAction, InductionAlert, InductionRosterPage, InductionRosterRow, InductionStage } from '../../../types/models';
import {
  ACTION_META,
  ALERT_META,
  ALERT_ORDER,
  ALERT_SEVERITY_CLASS,
  ORIGIN_META,
  STAGE_META,
  STAGE_ORDER,
  formatDate,
  formatDateTime,
  formatRelative,
} from '../../../utils/inductionDashboard';

export interface RosterFilters {
  q: string;
  stages: InductionStage[];
  alerts: InductionAlert[];
  page: number;
  limit: number;
}

interface InductionRosterTableProps {
  roster: InductionRosterPage | null;
  loading: boolean;
  filters: RosterFilters;
  onFiltersChange: (next: RosterFilters) => void;
  selected: Set<number>;
  onToggleSelect: (enrollmentId: number) => void;
  onToggleSelectAll: (rows: InductionRosterRow[]) => void;
  onOpenEmployee: (row: InductionRosterRow) => void;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
  onBulkReopen: () => void;
}

const ACTION_ICON: Record<InductionAction, React.ReactNode> = {
  REOPEN_READING: <BookOpen size={14} />,
  EXTEND_READING: <BookOpen size={14} />,
  RESEND_NOTICE: <MessageSquare size={14} />,
  RESET_ATTEMPT: <RotateCcw size={14} />,
  AUTHORIZE_RETRY: <RotateCcw size={14} />,
  GRADE: <ClipboardCheck size={14} />,
  ADVANCE: <StepForward size={14} />,
  ISSUE_CERTIFICATE: <Award size={14} />,
  COMPLETE_DATA: <UserPen size={14} />,
  START_NOW: <Coffee size={14} />,
  UNENROLL: <Trash2 size={14} />,
};

const ReadingCell = ({ row }: { row: InductionRosterRow }) => {
  if (row.reading_total === 0) {
    if (row.stage === 'EN_DESCANSO') {
      return (
        <span className="text-xs text-violet-700">
          Descanso · lecturas {formatRelative(row.readings_start_at)}
          <span className="block text-[11px] text-[var(--unilabor-neutral)]">{formatDateTime(row.readings_start_at)}</span>
        </span>
      );
    }
    return <span className="text-xs text-[var(--unilabor-neutral)]">{row.phase_published ? 'Sin lecturas' : 'En espera'}</span>;
  }
  const pagesPct = row.reading_pages_total > 0 ? Math.min(100, Math.round((row.reading_pages_seen / row.reading_pages_total) * 100)) : 0;
  const expired = row.stage === 'LECTURA_VENCIDA';
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--unilabor-ink)]">
          {row.reading_signed}/{row.reading_total} firmados
        </span>
        <span className="text-[var(--unilabor-neutral)]">{pagesPct} % pág.</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
        <div className={`h-full rounded-full ${row.reading_completed_at ? 'bg-emerald-500' : 'bg-[#0069a6]'}`} style={{ width: `${pagesPct}%` }} />
      </div>
      <p className={`mt-0.5 text-[11px] ${expired ? 'font-semibold text-rose-600' : 'text-[var(--unilabor-neutral)]'}`}>
        {row.reading_completed_at
          ? `Completa ${formatRelative(row.reading_completed_at)}`
          : row.reading_deadline_at
            ? `${expired ? 'Venció' : 'Vence'} ${formatRelative(row.reading_deadline_at)}`
            : 'Sin límite'}
      </p>
    </div>
  );
};

const EvaluationCell = ({ row }: { row: InductionRosterRow }) => {
  if (!row.evaluation_assignment_id) {
    return <span className="text-xs text-[var(--unilabor-neutral)]">—</span>;
  }
  const deadlineSoon = row.alerts.includes('EVALUACION_POR_VENCER');
  return (
    <div className="min-w-[140px] text-xs">
      <p className="font-semibold text-[var(--unilabor-ink)]">
        {row.evaluation_percentage !== null ? `${row.evaluation_percentage} %` : 'Sin calificar'}
        <span className="ml-1 font-normal text-[var(--unilabor-neutral)]">· intento #{row.evaluation_attempt_no ?? 1}</span>
      </p>
      {row.evaluation_status === 'passed' || row.evaluation_status === 'failed' ? (
        <p className="text-[11px] text-[var(--unilabor-neutral)]">{formatDateTime(row.evaluation_submitted_at)}</p>
      ) : row.evaluation_deadline_at ? (
        <p className={`text-[11px] ${deadlineSoon ? 'font-semibold text-amber-600' : 'text-[var(--unilabor-neutral)]'}`}>
          Vence {formatRelative(row.evaluation_deadline_at)}
        </p>
      ) : null}
      {row.evaluation_status === 'in_progress' || row.evaluation_status === 'authorized_late' ? (
        <p className="text-[11px] text-[var(--unilabor-neutral)]">
          {row.evaluation_response_count}/{row.evaluation_question_count} respuestas
        </p>
      ) : null}
    </div>
  );
};

/** Tabla de inscritos de la fase con filtros por etapa/alerta, búsqueda, selección en lote y acciones. */
export const InductionRosterTable = ({
  roster,
  loading,
  filters,
  onFiltersChange,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onOpenEmployee,
  onAction,
  onBulkReopen,
}: InductionRosterTableProps) => {
  const stageOptions = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        value: stage,
        label: `${STAGE_META[stage].label}${roster ? ` (${roster.stage_counts[stage] ?? 0})` : ''}`,
      })),
    [roster],
  );
  const alertOptions = useMemo(() => ALERT_ORDER.map((alert) => ({ value: alert, label: ALERT_META[alert].label })), []);
  const rows = roster?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.enrollment_id));
  const selectableForReopen = rows.filter((row) => row.actions.includes('REOPEN_READING') || row.actions.includes('EXTEND_READING'));
  const selectedReopenable = selectableForReopen.filter((row) => selected.has(row.enrollment_id)).length;

  const chip = (stage: InductionStage) => {
    const active = filters.stages.length === 1 && filters.stages[0] === stage;
    const count = roster?.stage_counts[stage] ?? 0;
    if (count === 0 && !active) return null;
    return (
      <button
        key={stage}
        type="button"
        onClick={() => onFiltersChange({ ...filters, stages: active ? [] : [stage], page: 1 })}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${active ? 'bg-[var(--color-brand-700)] text-white' : STAGE_META[stage].className}`}
      >
        {STAGE_META[stage].short} · {count}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{STAGE_ORDER.map(chip)}</div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value, page: 1 })}
            placeholder="Buscar por nombre, código, correo, área, unidad o puesto"
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2 pl-9 pr-3 text-sm focus:border-[var(--color-brand-300)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
          />
        </label>
        <MultiSelectFilter
          values={filters.stages.length > 0 ? filters.stages : STAGE_ORDER}
          defaultValues={STAGE_ORDER}
          options={stageOptions}
          onChange={(values) => onFiltersChange({ ...filters, stages: values.length >= STAGE_ORDER.length ? [] : (values as InductionStage[]), page: 1 })}
          allLabel="Todas las etapas"
        />
        <MultiSelectFilter
          values={filters.alerts.length > 0 ? filters.alerts : ALERT_ORDER}
          defaultValues={ALERT_ORDER}
          options={alertOptions}
          onChange={(values) => onFiltersChange({ ...filters, alerts: values.length >= ALERT_ORDER.length ? [] : (values as InductionAlert[]), page: 1 })}
          allLabel="Todas las alertas"
        />
        <select
          value={filters.limit}
          onChange={(e) => onFiltersChange({ ...filters, limit: Number(e.target.value), page: 1 })}
          className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2 py-2 text-xs"
        >
          {[30, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
        {selectedReopenable > 0 ? (
          <button
            type="button"
            onClick={onBulkReopen}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            <BookOpen size={14} /> Mandar a lectura ({selectedReopenable})
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgba(248,251,253,0.9)] text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <tr>
              <th className="w-8 px-3 py-2">
                <button type="button" onClick={() => onToggleSelectAll(selectableForReopen)} aria-label="Seleccionar todos" className="text-[var(--color-brand-700)]">
                  {allSelected && rows.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="min-w-[240px] px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Lectura</th>
              <th className="px-3 py-2">Evaluación</th>
              <th className="px-3 py-2">Alertas</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--unilabor-neutral)]">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--unilabor-neutral)]">
                  Ningún inscrito coincide con los filtros.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const canSelect = row.actions.includes('REOPEN_READING') || row.actions.includes('EXTEND_READING');
                const items: ActionMenuItem[] = row.actions.map((action) => ({
                  key: action,
                  label: ACTION_META[action].label,
                  icon: ACTION_ICON[action],
                  danger: ACTION_META[action].tone === 'danger',
                  onClick: () => onAction(action, row),
                }));
                const primary = row.actions.find((action) => action !== 'UNENROLL' && action !== 'COMPLETE_DATA');
                return (
                  <tr key={row.enrollment_id} className={`border-t border-[rgba(0,65,106,0.06)] ${selected.has(row.enrollment_id) ? 'bg-[rgba(191,212,230,0.18)]' : ''}`}>
                    <td className="px-3 py-2.5 align-top">
                      {canSelect ? (
                        <button type="button" onClick={() => onToggleSelect(row.enrollment_id)} className="text-[var(--color-brand-700)]" aria-label="Seleccionar">
                          {selected.has(row.enrollment_id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <button type="button" onClick={() => onOpenEmployee(row)} className="text-left">
                        <p className="font-semibold text-[var(--color-brand-700)] hover:underline">{row.employee_name}</p>
                        <p className="text-[11px] text-[var(--unilabor-neutral)]">
                          {row.employee_code}
                          {row.branch_name ? ` · ${row.branch_name}` : ''}
                          {row.position_name ? ` · ${row.position_name}` : ''}
                        </p>
                        <span className={`mt-1 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ORIGIN_META[row.origin]?.className ?? ORIGIN_META.MANUAL.className}`}>
                          {ORIGIN_META[row.origin]?.label ?? row.origin} · {formatDate(row.enrolled_at)}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STAGE_META[row.stage].className}`}>
                        {STAGE_META[row.stage].short}
                      </span>
                      {row.checklist_total > 0 ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--unilabor-neutral)]">
                          <ClipboardList size={11} /> Checklist {row.checklist_completed}/{row.checklist_total}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <ReadingCell row={row} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <EvaluationCell row={row} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {row.alerts.length === 0 ? (
                          <span className="text-[11px] text-[var(--unilabor-neutral)]">—</span>
                        ) : (
                          row.alerts.map((alert) => (
                            <span key={alert} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ALERT_SEVERITY_CLASS[ALERT_META[alert].severity]}`}>
                              {ALERT_META[alert].label}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center justify-end gap-1">
                        {primary ? (
                          <button
                            type="button"
                            onClick={() => onAction(primary, row)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                              ACTION_META[primary].tone === 'danger'
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : ACTION_META[primary].tone === 'warning'
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : ACTION_META[primary].tone === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
                            }`}
                          >
                            {ACTION_ICON[primary]} {ACTION_META[primary].label}
                          </button>
                        ) : null}
                        {items.length > 0 ? <ActionsMenu items={items} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {roster ? (
        <Pagination
          page={roster.page}
          totalPages={roster.total_pages}
          total={roster.total}
          pageSize={roster.limit}
          onPageChange={(page) => onFiltersChange({ ...filters, page })}
          loading={loading}
        />
      ) : null}
    </div>
  );
};
