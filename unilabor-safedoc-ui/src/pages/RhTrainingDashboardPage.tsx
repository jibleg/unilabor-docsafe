import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { getApiErrorMessage, getEvaluationDashboard, getTraceabilityReport } from '../api/service';
import type { EvaluationDashboard, TraceabilityRow } from '../types/models';
import { notifyError } from '../utils/notify';
import { EVALUATION_STATUS_META } from '../utils/evaluations';

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'short' }) : '-';

const buildCsv = (rows: TraceabilityRow[]): string => {
  const header = [
    'Colaborador',
    'Codigo',
    'Capacitacion',
    'Evaluacion',
    'Estado',
    'Calificacion',
    'Minimo',
    'Enviada',
    'Calificada',
    'Constancia emision',
    'Constancia vigencia',
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map((row) =>
    [
      row.employee_name,
      row.employee_code,
      row.course_title,
      row.template_title,
      EVALUATION_STATUS_META[row.status].label,
      row.percentage !== null ? `${row.percentage}%` : '',
      `${row.passing_score}%`,
      formatDate(row.submitted_at),
      formatDate(row.graded_at),
      formatDate(row.certificate_issue_date),
      formatDate(row.certificate_expiry_date),
    ]
      .map((value) => escape(String(value)))
      .join(','),
  );
  return [header.map(escape).join(','), ...lines].join('\n');
};

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

  const loadReport = useCallback(async (courseId: number | '') => {
    const result = await getTraceabilityReport(courseId ? { course_id: courseId, limit: 500 } : { limit: 500 });
    setRows(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [dash] = await Promise.all([getEvaluationDashboard(), loadReport('')]);
        if (active) {
          setDashboard(dash);
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudo cargar el panel de capacitacion.'));
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

  const onFilterChange = async (value: number | '') => {
    setCourseFilter(value);
    try {
      await loadReport(value);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo filtrar el reporte.'));
    }
  };

  const downloadCsv = () => {
    const csv = buildCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trazabilidad-capacitacion-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = dashboard?.totals;
  const courses = useMemo(() => dashboard?.courses ?? [], [dashboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Capacitacion - ISO 15189
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <BarChart3 size={24} /> Panel de capacitacion
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Cumplimiento y trazabilidad de las evaluaciones de competencia del personal.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
        >
          <Download size={16} /> Exportar CSV
        </button>
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

          {/* Resumen por capacitacion */}
          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                Por capacitacion
              </h2>
            </div>
            {courses.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--unilabor-neutral)]">Sin datos aun.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  <tr>
                    <th className="px-4 py-2.5">Capacitacion</th>
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
              <select
                value={courseFilter}
                onChange={(event) => void onFilterChange(event.target.value ? Number(event.target.value) : '')}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm outline-none"
              >
                <option value="">Todas las capacitaciones</option>
                {courses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_title}
                  </option>
                ))}
              </select>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--unilabor-neutral)]">Sin registros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    <tr>
                      <th className="px-4 py-2.5">Colaborador</th>
                      <th className="px-4 py-2.5">Capacitacion</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5">Calif.</th>
                      <th className="px-4 py-2.5">Constancia</th>
                      <th className="px-4 py-2.5">Vigencia</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
