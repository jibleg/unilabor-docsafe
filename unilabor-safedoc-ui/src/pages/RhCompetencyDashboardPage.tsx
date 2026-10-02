import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Gauge, Loader2, RefreshCw, Stamp, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCompetencyDashboard } from '../api/service.api-rh-competency-dashboard';
import { getApiErrorMessage } from '../api/service.parsers';
import { CompetencyCharts } from '../components/rh/competency-dashboard/CompetencyCharts';
import { CompetencyCollaborators } from '../components/rh/competency-dashboard/CompetencyCollaborators';
import { CompetencyEmployeeDrawer } from '../components/rh/competency-dashboard/CompetencyEmployeeDrawer';
import { CompetencyFiltersBar } from '../components/rh/competency-dashboard/CompetencyFiltersBar';
import { CompetencyHero } from '../components/rh/competency-dashboard/CompetencyHero';
import { CompetencyTimelineCoverage } from '../components/rh/competency-dashboard/CompetencyTimelineCoverage';
import type { CompetencyDashboard, CompetencyDashboardEmployee, CompetencyStanding } from '../types/competencyDashboard';
import { formatDateOnly } from '../utils/competency';
import {
  EMPTY_FILTERS,
  STANDING_META,
  STANDING_ORDER,
  applyFilters,
  uniqueSorted,
  type CompetencyFilters,
} from '../utils/competencyDashboard';
import { notifyError } from '../utils/notify';

/**
 * Tablero de evaluación de competencia (REH-REG-003): panorama global del
 * personal (índice de competencia vigente, estados, resultados por sección,
 * dictámenes, calendario y cobertura por puesto) y detalle por colaborador con
 * la trazabilidad de cada evaluación y sus documentos soporte. Los filtros se
 * aplican en el cliente y atraviesan todo el tablero.
 */
export const RhCompetencyDashboardPage = () => {
  const [dashboard, setDashboard] = useState<CompetencyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CompetencyFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<CompetencyDashboardEmployee | null>(null);
  const closeDrawer = useCallback(() => setSelected(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await getCompetencyDashboard());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el tablero de competencia.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // `scoped` ignora el filtro de estado (alimenta el mosaico y la dona, que
  // sirven para elegir estado); `filtered` aplica todos los filtros.
  const scoped = useMemo(() => (dashboard ? applyFilters(dashboard, { ...filters, standings: [...STANDING_ORDER] }) : null), [dashboard, filters]);
  const filtered = useMemo(() => (dashboard ? applyFilters(dashboard, filters) : null), [dashboard, filters]);
  const evaluationsById = useMemo(() => new Map((dashboard?.evaluations ?? []).map((evaluation) => [evaluation.id, evaluation])), [dashboard]);

  const options = useMemo(() => {
    if (!dashboard) return { branches: [], areas: [], positions: [], years: [] };
    const positions = new Map<number, string>();
    dashboard.employees.forEach((employee) => employee.positions.forEach((position) => positions.set(position.id, position.name)));
    dashboard.evaluations.forEach((evaluation) => positions.set(evaluation.position_id, evaluation.position_name));
    return {
      branches: uniqueSorted(dashboard.employees.map((employee) => employee.branch_name)),
      areas: uniqueSorted(dashboard.employees.map((employee) => employee.area)),
      positions: [...positions.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
      years: uniqueSorted(dashboard.evaluations.map((evaluation) => evaluation.evaluation_date.slice(0, 4))).reverse(),
    };
  }, [dashboard]);

  const singleStanding = filters.standings.length === 1 ? filters.standings[0] : null;
  const focusStanding = (standing: CompetencyStanding | null) =>
    setFilters((current) => ({ ...current, standings: standing ? [standing] : [...STANDING_ORDER] }));
  const pendingAuthorization = scoped?.employees.filter((employee) => employee.standing === 'PENDIENTE_AUTORIZACION').length ?? 0;
  const urgent = scoped ? scoped.employees.filter((employee) => employee.standing === 'VENCIDA' || employee.standing === 'POR_VENCER').length : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            <Gauge size={15} /> Recursos Humanos · ISO 15189
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Tablero de evaluación de competencia</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Panorama del personal y detalle por colaborador: estado de su competencia, resultados del REH-REG-003, trazabilidad de cada
            evaluación y los documentos que la soportan. Haz clic en un indicador, segmento o puesto para enfocar el tablero.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dashboard ? <span className="hidden text-[11px] text-[var(--unilabor-neutral)] md:inline">Corte al {formatDateOnly(dashboard.today)}</span> : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {loading && !dashboard ? (
        <div className="flex items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 py-20 shadow-xl">
          <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : dashboard && scoped && filtered ? (
        <>
          <CompetencyHero employees={scoped.employees} evaluations={scoped.evaluations} activeStandings={filters.standings} onFocusStanding={focusStanding} />

          {(pendingAuthorization > 0 || urgent > 0) && !singleStanding ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-amber-50 px-4 py-3 text-sm text-[var(--unilabor-ink)]" style={{ animation: 'agr-fade .4s ease both' }}>
              <Stamp size={16} className="text-violet-700" />
              <span>
                {pendingAuthorization > 0 ? <><b>{pendingAuthorization}</b> evaluación(es) esperan autorización</> : null}
                {pendingAuthorization > 0 && urgent > 0 ? ' · ' : ''}
                {urgent > 0 ? <><b>{urgent}</b> colaborador(es) con autorización vencida o por vencer</> : null}
              </span>
              <div className="ml-auto flex gap-2">
                {pendingAuthorization > 0 ? (
                  <button type="button" onClick={() => focusStanding('PENDIENTE_AUTORIZACION')} className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700">
                    Ver pendientes
                  </button>
                ) : null}
                {urgent > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, standings: ['VENCIDA', 'POR_VENCER'] }))}
                    className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    Ver vencimientos
                  </button>
                ) : null}
                <Link to="/rh/competency-evaluations" className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1 text-xs font-bold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]">
                  Ir a evaluaciones <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ) : null}

          <CompetencyFiltersBar
            filters={filters}
            onChange={setFilters}
            branches={options.branches}
            areas={options.areas}
            positions={options.positions}
            years={options.years}
            resultCount={filtered.employees.length}
            totalCount={dashboard.employees.length}
          />

          {filters.standings.length < STANDING_ORDER.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" style={{ animation: 'agr-fade .3s ease both' }}>
              <span className="text-[var(--unilabor-neutral)]">Mostrando solo:</span>
              {filters.standings.map((standing) => (
                <span key={standing} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${STANDING_META[standing].soft} ${STANDING_META[standing].text}`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STANDING_META[standing].color }} />
                  {STANDING_META[standing].label}
                </span>
              ))}
              <button type="button" onClick={() => focusStanding(null)} className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,65,106,0.14)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]">
                <X size={12} /> Quitar
              </button>
            </div>
          ) : null}

          <CompetencyCharts employees={scoped.employees} evaluations={filtered.evaluations} activeStanding={singleStanding} onFocusStanding={focusStanding} />
          <CompetencyTimelineCoverage
            evaluations={filtered.evaluations}
            employees={filtered.employees}
            today={dashboard.today}
            activePositionId={filters.positionId}
            onFocusPosition={(positionId) => setFilters((current) => ({ ...current, positionId }))}
          />
          <CompetencyCollaborators employees={filtered.employees} evaluationsById={evaluationsById} onOpen={setSelected} />
          {selected ? <CompetencyEmployeeDrawer key={selected.employee_id} employee={selected} onClose={closeDrawer} /> : null}
        </>
      ) : null}
    </div>
  );
};
