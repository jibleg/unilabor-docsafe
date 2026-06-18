import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, Loader2 } from 'lucide-react';
import { getApiErrorMessage, getEvaluationDashboard, getTraceabilityReport } from '../api/service';
import type { EvaluationDashboard, TraceabilityRow } from '../types/models';
import { notifyError } from '../utils/notify';
import { EVALUATION_STATUS_META } from '../utils/evaluations';
import { EvaluationResponsesModal } from '../components/rh/EvaluationResponsesModal';
import { Pagination } from '../components/Pagination';

/** Estados cuyas evaluaciones ya tienen respuestas registradas para consultar. */
const ANSWERED_STATUSES = new Set(['submitted', 'grading', 'passed', 'failed']);

const TRACEABILITY_PAGE_SIZE = 10;

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'short' }) : '-';

const StatCard = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 px-4 py-3">
    <p className={`text-2xl font-black ${accent ?? 'text-[var(--color-brand-700)]'}`}>{value}</p>
    <p className="text-xs text-[var(--unilabor-neutral)]">{label}</p>
  </div>
);

export const RhTrainingDashboardPage = () => {
  const [dashboard, setDashboard] = useState<EvaluationDashboard | null>(null);
  const [rows, setRows] = useState<TraceabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingReport, setLoadingReport] = useState(false);
  const [responsesAssignmentId, setResponsesAssignmentId] = useState<number | null>(null);

  const loadReport = useCallback(async (courseId: number | '', status: string, targetPage: number) => {
    setLoadingReport(true);
    try {
      const result = await getTraceabilityReport({
        page: targetPage,
        limit: TRACEABILITY_PAGE_SIZE,
        ...(courseId ? { course_id: courseId } : {}),
        ...(status ? { status } : {}),
      });
      setRows(result.data);
      setPage(result.pagination.page);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [dash] = await Promise.all([getEvaluationDashboard(), loadReport('', '', 1)]);
        if (active) {
          setDashboard(dash);
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudo cargar el panel de capacitación.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [loadReport]);

  const onCourseChange = async (value: number | '') => {
    setCourseFilter(value);
    try {
      await loadReport(value, statusFilter, 1);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo filtrar el reporte.'));
    }
  };

  const onStatusChange = async (value: string) => {
    setStatusFilter(value);
    try {
      await loadReport(courseFilter, value, 1);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo filtrar el reporte.'));
    }
  };

  const onPageChange = async (targetPage: number) => {
    try {
      await loadReport(courseFilter, statusFilter, targetPage);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cambiar de página.'));
    }
  };

  const totals = dashboard?.totals;
  const courses = useMemo(() => dashboard?.courses ?? [], [dashboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Capacitación - ISO 15189
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <BarChart3 size={24} /> Panel de capacitación
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Cumplimiento y trazabilidad de las evaluaciones de competencia del personal.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando panel...
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Total" value={totals.total} />
              <StatCard label="Acreditados" value={totals.passed} accent="text-emerald-600" />
              <StatCard label="% Cumplimiento" value={`${totals.compliance_pct}%`} accent="text-emerald-600" />
              <StatCard label="En proceso" value={totals.pending + totals.in_progress} accent="text-sky-600" />
              <StatCard label="Por revisar" value={totals.grading} accent="text-violet-600" />
              <StatCard label="Vencidos" value={totals.expired} accent="text-slate-500" />
            </div>
          )}

          {/* Resumen por capacitación */}
          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                Por capacitación
              </h2>
            </div>
            {courses.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--unilabor-neutral)]">Sin datos aún.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  <tr>
                    <th className="px-4 py-2.5">Capacitación</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Acreditados</th>
                    <th className="px-4 py-2.5">No acred.</th>
                    <th className="px-4 py-2.5">Proceso</th>
                    <th className="px-4 py-2.5">Vencidos</th>
                    <th className="px-4 py-2.5">% Cumpl.</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <tr key={course.course_id} className="border-t border-[rgba(0,65,106,0.06)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--unilabor-ink)]">{course.course_title}</td>
                      <td className="px-4 py-2.5">{course.total}</td>
                      <td className="px-4 py-2.5 text-emerald-700">{course.passed}</td>
                      <td className="px-4 py-2.5 text-red-600">{course.failed}</td>
                      <td className="px-4 py-2.5 text-sky-700">{course.pending + course.in_progress + course.grading}</td>
                      <td className="px-4 py-2.5 text-slate-500">{course.expired}</td>
                      <td className="px-4 py-2.5 font-semibold text-[var(--color-brand-700)]">{course.compliance_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Trazabilidad */}
          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
            <div className="flex flex-col gap-2 border-b border-[rgba(0,65,106,0.08)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                Trazabilidad (evidencia ISO)
              </h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={courseFilter}
                  onChange={(event) => void onCourseChange(event.target.value ? Number(event.target.value) : '')}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm outline-none"
                >
                  <option value="">Todas las capacitaciones</option>
                  {courses.map((course) => (
                    <option key={course.course_id} value={course.course_id}>
                      {course.course_title}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => void onStatusChange(event.target.value)}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm outline-none"
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(EVALUATION_STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--unilabor-neutral)]">Sin registros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    <tr>
                      <th className="px-4 py-2.5">Colaborador</th>
                      <th className="px-4 py-2.5">Capacitación</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5">Calif.</th>
                      <th className="px-4 py-2.5">Constancia</th>
                      <th className="px-4 py-2.5">Vigencia</th>
                      <th className="px-4 py-2.5 text-right">Respuestas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.assignment_id} className="border-t border-[rgba(0,65,106,0.06)]">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-[var(--unilabor-ink)]">{row.employee_name}</span>
                          <span className="block text-xs text-[var(--unilabor-neutral)]">{row.employee_code}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">{row.course_title}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${EVALUATION_STATUS_META[row.status].className}`}>
                            {EVALUATION_STATUS_META[row.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{row.percentage !== null ? `${row.percentage}%` : '-'}</td>
                        <td className="px-4 py-2.5 text-xs">{formatDate(row.certificate_issue_date)}</td>
                        <td className="px-4 py-2.5 text-xs">{formatDate(row.certificate_expiry_date)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {ANSWERED_STATUSES.has(row.status) ? (
                            <button
                              type="button"
                              onClick={() => setResponsesAssignmentId(row.assignment_id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.35)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                            >
                              <Eye size={13} /> Ver
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--unilabor-neutral)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {total > 0 && (
              <div className="border-t border-[rgba(0,65,106,0.06)]">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={TRACEABILITY_PAGE_SIZE}
                  onPageChange={(target) => void onPageChange(target)}
                  loading={loadingReport}
                />
              </div>
            )}
          </div>
        </>
      )}

      {responsesAssignmentId !== null && (
        <EvaluationResponsesModal
          assignmentId={responsesAssignmentId}
          onClose={() => setResponsesAssignmentId(null)}
        />
      )}
    </div>
  );
};
