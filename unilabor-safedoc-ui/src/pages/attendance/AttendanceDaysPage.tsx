import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Clock, FileSpreadsheet, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import {
  downloadDaysExcel,
  downloadOvertimeExcel,
  listAttendanceDays,
  readBlobErrorMessage,
  type AttendanceDay,
  type DaysResponse,
} from '../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../api/service';
import { useHasPermission } from '../../utils/permissions';
import { notifyError } from '../../utils/notify';
import { DaysFilters, type DaysFilterValues } from '../../components/attendance/days/DaysFilters';
import { DaysTable } from '../../components/attendance/days/DaysTable';
import { JustifyModal } from '../../components/attendance/days/JustifyModal';
import { RecalculateModal } from '../../components/attendance/days/RecalculateModal';
import { ManualPunchModal } from '../../components/attendance/punches/ManualPunchModal';
import { secondaryButtonClass } from '../../components/attendance/punches/formStyles';
import {
  PAGE_SIZE, defaultDaysRange, exportResultParam, formatSummary, isFutureOrToday, resultFilterToQuery, validateRange,
} from '../../components/attendance/days/dayHelpers';

export const AttendanceDaysPage = () => {
  const [params, setParams] = useSearchParams();
  const canAuthorize = useHasPermission('ATTENDANCE.INCIDENTS.AUTHORIZE');
  const defaults = useMemo(() => defaultDaysRange(), []);

  const values: DaysFilterValues = {
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    branch: params.get('branch') ?? '',
    employee: params.get('employee') ?? '',
    result: params.get('result') ?? '',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const rangeError = validateRange(values.from, values.to);

  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [response, setResponse] = useState<DaysResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState<'days' | 'overtime' | null>(null);
  const [justifyDay, setJustifyDay] = useState<AttendanceDay | null>(null);
  const [manualDay, setManualDay] = useState<AttendanceDay | null>(null);
  const [recalcOpen, setRecalcOpen] = useState(false);

  const updateParams = useCallback(
    (patch: Record<string, string>, keepPage = false) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        if (!keepPage) next.delete('page');
        return next;
      }, { replace: true });
    },
    [setParams],
  );

  const handleFilterChange = (patch: Partial<DaysFilterValues>) => updateParams(patch as Record<string, string>);

  useEffect(() => {
    void listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const { from, to, branch, employee, result } = values;
  useEffect(() => {
    if (validateRange(from, to)) return;
    let active = true;
    setLoading(true);
    setError(null);
    listAttendanceDays({
      from, to, page, limit: PAGE_SIZE,
      ...(branch ? { branch_id: branch } : {}),
      ...(employee ? { employee_id: employee } : {}),
      ...resultFilterToQuery(result),
    })
      .then((data) => active && setResponse(data))
      .catch((err) => active && setError(getApiErrorMessage(err, 'No se pudieron cargar los días.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [from, to, branch, employee, result, page, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const exportFile = async (kind: 'days' | 'overtime') => {
    if (rangeError) return;
    setExporting(kind);
    try {
      if (kind === 'days') {
        await downloadDaysExcel({
          from, to,
          ...(branch ? { branch_id: branch } : {}),
          ...(employee ? { employee_id: employee } : {}),
          ...(exportResultParam(result) ? { result: exportResultParam(result) } : {}),
        });
      } else {
        await downloadOvertimeExcel({ from, to, ...(branch ? { branch_id: branch } : {}) });
      }
    } catch (err) {
      const fallback = getApiErrorMessage(err, 'No se pudo generar el Excel.');
      const message = await readBlobErrorMessage(err, fallback);
      notifyError(
        /5000/.test(message)
          ? 'La exportación excede 5,000 filas. Acota el rango o aplica filtros (sucursal, colaborador o resultado).'
          : message,
      );
    } finally {
      setExporting(null);
    }
  };

  const summary = response?.summary;
  const days = response?.data ?? [];
  const pagination = response?.pagination;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] px-6 py-6 shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Control de asistencias</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--color-brand-700)]">
              <CalendarDays size={28} aria-hidden /> Días
            </h1>
            <p className="mt-2 text-sm font-semibold text-[var(--unilabor-ink)]" aria-live="polite">
              {summary ? formatSummary(summary) : 'Calculando resumen…'}
              {summary && summary.partial_absence + summary.early_departure + summary.pending_review > 0 ? (
                <span className="ml-2 font-normal text-[var(--unilabor-neutral)]">
                  · {summary.partial_absence} faltas parciales · {summary.early_departure} salidas anticipadas · {summary.pending_review} en revisión
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} disabled={Boolean(rangeError) || exporting !== null} onClick={() => void exportFile('days')}>
              {exporting === 'days' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Excel
            </button>
            <button type="button" className={secondaryButtonClass} disabled={Boolean(rangeError) || exporting !== null} onClick={() => void exportFile('overtime')}>
              {exporting === 'overtime' ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} Horas extra
            </button>
            {canAuthorize ? (
              <button type="button" className={secondaryButtonClass} disabled={Boolean(rangeError)} onClick={() => setRecalcOpen(true)}>
                <RotateCw size={16} /> Recalcular rango
              </button>
            ) : null}
            <button type="button" aria-label="Recargar" title="Recargar" className={secondaryButtonClass} onClick={reload}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <DaysFilters values={values} branches={branches} rangeError={rangeError} onChange={handleFilterChange} />

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <AlertTriangle size={28} className="text-[#d03b3b]" aria-hidden />
            <p className="text-sm text-[var(--unilabor-ink)]">{error}</p>
            <button type="button" className={secondaryButtonClass} onClick={reload}><RefreshCw size={16} /> Reintentar</button>
          </div>
        ) : loading && !response ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={18} className="animate-spin" /> Cargando días…
          </div>
        ) : rangeError ? (
          <p className="px-5 py-12 text-center text-sm text-[var(--unilabor-neutral)]">Corrige el rango de fechas para consultar.</p>
        ) : days.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[var(--unilabor-neutral)]">
            {isFutureOrToday(from)
              ? 'El día de hoy aún no está calculado: cada día se cierra a las 03:30 del día siguiente. Para ver lo que ocurre ahora usa "Hoy en vivo" o Checadas.'
              : 'No hay días para los filtros seleccionados.'}
          </p>
        ) : (
          <div className={loading ? 'opacity-60 transition' : 'transition'}>
            <DaysTable days={days} canAuthorize={canAuthorize} onJustify={setJustifyDay} onManualPunch={setManualDay} />
          </div>
        )}
        {pagination && days.length > 0 ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.limit}
            loading={loading}
            onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : '' }, true)}
          />
        ) : null}
      </div>

      {justifyDay ? (
        <JustifyModal day={justifyDay} onClose={() => setJustifyDay(null)} onDone={() => { setJustifyDay(null); reload(); }} />
      ) : null}
      {manualDay ? (
        <ManualPunchModal
          preset={{
            employee: { id: manualDay.employee.id, employee_code: manualDay.employee.code, full_name: manualDay.employee.full_name, branch_name: manualDay.employee.branch_name, device_employee_number: null },
            date: manualDay.work_date,
          }}
          onClose={() => setManualDay(null)}
          onDone={() => { setManualDay(null); reload(); }}
        />
      ) : null}
      {recalcOpen ? (
        <RecalculateModal from={from} to={to} employeeId={employee || undefined} onClose={() => setRecalcOpen(false)} onDone={() => { setRecalcOpen(false); reload(); }} />
      ) : null}
    </div>
  );
};
