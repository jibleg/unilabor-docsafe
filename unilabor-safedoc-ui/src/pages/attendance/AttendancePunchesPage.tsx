import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Fingerprint, Info, Loader2, PenLine, RefreshCw } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import {
  listAttendancePunches,
  reviewAttendancePunch,
  type AttendancePunch,
  type PunchesResponse,
} from '../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../api/service';
import { confirmAction } from '../../utils/confirm';
import { notifyError, notifySuccess } from '../../utils/notify';
import { useHasPermission } from '../../utils/permissions';
import { PunchesFilters, type PunchesFilterValues } from '../../components/attendance/punches/PunchesFilters';
import { PunchesTable } from '../../components/attendance/punches/PunchesTable';
import { LinkPunchModal, RejectPunchModal } from '../../components/attendance/punches/PunchModals';
import { ManualPunchModal } from '../../components/attendance/punches/ManualPunchModal';
import { primaryButtonClass, secondaryButtonClass } from '../../components/attendance/punches/formStyles';
import { defaultPunchesRange, PAGE_SIZE, validateRange } from '../../components/attendance/days/dayHelpers';
import {
  describeRecalculation, normalizeReviewParam, normalizeSourceParam,
} from '../../components/attendance/punches/punchHelpers';

export const AttendancePunchesPage = () => {
  const [params, setParams] = useSearchParams();
  const canAuthorize = useHasPermission('ATTENDANCE.INCIDENTS.AUTHORIZE');
  const defaults = useMemo(() => defaultPunchesRange(), []);

  const values: PunchesFilterValues = {
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    branch: params.get('branch') ?? '',
    employee: params.get('employee') ?? '',
    source: normalizeSourceParam(params.get('source')),
    review: normalizeReviewParam(params.get('review')),
    q: params.get('q') ?? '',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const rangeError = validateRange(values.from, values.to);

  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [response, setResponse] = useState<PunchesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<AttendancePunch | null>(null);
  const [linking, setLinking] = useState<AttendancePunch | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [qInput, setQInput] = useState(values.q);

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

  // La busqueda de texto se aplica a la URL con debounce.
  useEffect(() => {
    if (qInput === values.q) return;
    const handle = window.setTimeout(() => updateParams({ q: qInput.trim() }), 350);
    return () => window.clearTimeout(handle);
  }, [qInput, values.q, updateParams]);

  const handleFilterChange = (patch: Partial<PunchesFilterValues>) => {
    if ('q' in patch) {
      setQInput(patch.q ?? '');
      return;
    }
    updateParams(patch as Record<string, string>);
  };

  useEffect(() => {
    void listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const { from, to, branch, employee, source, review, q } = values;
  useEffect(() => {
    if (validateRange(from, to)) return;
    let active = true;
    setLoading(true);
    setError(null);
    listAttendancePunches({
      from, to, page, limit: PAGE_SIZE,
      ...(branch ? { branch_id: branch } : {}),
      ...(employee ? { employee_id: employee } : {}),
      ...(source ? { source } : {}),
      ...(review ? { review_status: review } : {}),
      ...(q ? { search: q } : {}),
    })
      .then((data) => active && setResponse(data))
      .catch((err) => active && setError(getApiErrorMessage(err, 'No se pudieron cargar las checadas.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [from, to, branch, employee, source, review, q, page, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const approve = async (punch: AttendancePunch) => {
    const ok = await confirmAction(
      'Aprobar checada',
      `La checada de ${punch.employee?.full_name ?? `empleado ${punch.device_employee_number ?? '—'}`} se tomará en cuenta para el cálculo del día.`,
      'Aprobar',
      'primary',
    );
    if (!ok) return;
    setBusyId(punch.id);
    try {
      const result = await reviewAttendancePunch(punch.id, 'approve');
      notifySuccess(`Checada aprobada. ${describeRecalculation(result.recalculation)}`);
      reload();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo aprobar la checada.'));
    } finally {
      setBusyId(null);
    }
  };

  const punches = response?.data ?? [];
  const pagination = response?.pagination;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] px-6 py-6 shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Control de asistencias</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--color-brand-700)]">
              <Fingerprint size={28} aria-hidden /> Checadas
            </h1>
            <p className="mt-2 flex max-w-3xl items-start gap-2 text-sm text-[var(--unilabor-neutral)]">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
              Las checadas no se editan ni se borran: las correcciones se hacen con checadas manuales justificadas o con incidencias.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAuthorize ? (
              <button type="button" className={primaryButtonClass} onClick={() => setManualOpen(true)}>
                <PenLine size={16} /> Checada manual
              </button>
            ) : null}
            <button type="button" aria-label="Recargar" title="Recargar" className={secondaryButtonClass} onClick={reload}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <PunchesFilters values={{ ...values, q: qInput }} branches={branches} rangeError={rangeError} onChange={handleFilterChange} />

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <AlertTriangle size={28} className="text-[#d03b3b]" aria-hidden />
            <p className="text-sm text-[var(--unilabor-ink)]">{error}</p>
            <button type="button" className={secondaryButtonClass} onClick={reload}><RefreshCw size={16} /> Reintentar</button>
          </div>
        ) : loading && !response ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={18} className="animate-spin" /> Cargando checadas…
          </div>
        ) : rangeError ? (
          <p className="px-5 py-12 text-center text-sm text-[var(--unilabor-neutral)]">Corrige el rango de fechas para consultar.</p>
        ) : punches.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[var(--unilabor-neutral)]">No hay checadas para los filtros seleccionados.</p>
        ) : (
          <div className={loading ? 'opacity-60 transition' : 'transition'}>
            <PunchesTable punches={punches} canAuthorize={canAuthorize} busyId={busyId} onApprove={(p) => void approve(p)} onReject={setRejecting} onLink={setLinking} />
          </div>
        )}
        {pagination && punches.length > 0 ? (
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

      {rejecting ? <RejectPunchModal punch={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload(); }} /> : null}
      {linking ? <LinkPunchModal punch={linking} onClose={() => setLinking(null)} onDone={() => { setLinking(null); reload(); }} /> : null}
      {manualOpen ? <ManualPunchModal onClose={() => setManualOpen(false)} onDone={() => { setManualOpen(false); reload(); }} /> : null}
    </div>
  );
};
