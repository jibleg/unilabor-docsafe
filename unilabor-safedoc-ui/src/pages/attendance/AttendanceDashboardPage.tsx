import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service.parsers';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import { getLiveBoard, type LiveBoard } from '../../api/service.api-attendance-boards';
import { addDaysIso, formatDate, todayIso } from '../../components/attendance/shared/format';
import { isIsoDate } from '../../components/attendance/board/boardHelpers';
import { ErrorBlock, LoadingBlock } from '../../components/attendance/board/BoardParts';
import { LiveKpis } from '../../components/attendance/board/LiveKpis';
import { LivePeopleTable } from '../../components/attendance/board/LivePeopleTable';
import { AbsencesPanel, DevicesPanel, MonthRanking } from '../../components/attendance/board/LiveSidePanels';
import { LiveTrend } from '../../components/attendance/board/TrendChart';
import { ghostButtonClass, inputClass, labelClass } from '../../components/attendance/board/boardStyles';

const REFRESH_MS = 60_000;

const AlertsBanner = ({ alerts }: { alerts: LiveBoard['alerts'] }) => {
  const items = [
    { count: alerts.without_schedule, text: 'sin horario vigente' },
    { count: alerts.without_device_number, text: 'sin número de reloj' },
    { count: alerts.pending_sync, text: 'por sincronizar' },
  ].filter((item) => item.count > 0);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#d98b0055] bg-[#d98b001a] px-4 py-3 text-sm text-[var(--unilabor-ink)]" role="status">
      <AlertTriangle size={18} className="text-[#d98b00]" aria-hidden="true" />
      <span className="font-semibold">Colaboradores pendientes:</span>
      {items.map((item) => (
        <Link key={item.text} to="/attendance/employees" className="font-semibold text-[var(--color-brand-700)] underline-offset-2 hover:underline">
          {item.count} {item.text}
        </Link>
      ))}
    </div>
  );
};

export const AttendanceDashboardPage = () => {
  const [params, setParams] = useSearchParams();
  const rawDate = params.get('date');
  const date = isIsoDate(rawDate) ? rawDate : todayIso();
  const branchId = params.get('branch_id') ?? '';
  const isToday = date === todayIso();

  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const data = await getLiveBoard({ date, branch_id: branchId });
      if (id !== requestId.current) return;
      setBoard(data);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (id !== requestId.current) return;
      // Un refresco automatico fallido no tapa el tablero ya cargado.
      if (!silent) setError(getApiErrorMessage(err, 'No se pudo cargar el tablero en vivo.'));
    } finally {
      if (id === requestId.current && !silent) setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isToday) return undefined;
    const handle = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(handle);
  }, [isToday, load]);

  useEffect(() => {
    listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Control de asistencias</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--color-brand-700)]">
            <Activity size={28} aria-hidden="true" /> Hoy en vivo
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            {formatDate(date)}{isToday ? ' · se actualiza cada minuto' : ''}
            {updatedAt ? ` · actualizado ${updatedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className={labelClass}>Fecha</span>
            <div className="mt-1 flex items-center gap-1">
              <button type="button" aria-label="Día anterior" className={`${ghostButtonClass} !px-2`} onClick={() => updateParam('date', addDaysIso(date, -1))}>
                <ChevronLeft size={16} />
              </button>
              <input type="date" aria-label="Fecha" value={date} onChange={(e) => updateParam('date', e.target.value === todayIso() ? '' : e.target.value)} className={`${inputClass} !w-auto`} />
              <button type="button" aria-label="Día siguiente" className={`${ghostButtonClass} !px-2`} onClick={() => updateParam('date', addDaysIso(date, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <label className="block">
            <span className={labelClass}>Sucursal</span>
            <select value={branchId} onChange={(e) => updateParam('branch_id', e.target.value)} className={`${inputClass} mt-1 !w-auto min-w-[10rem]`}>
              <option value="">Todas</option>
              {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </label>
          {!isToday && (
            <button type="button" className={ghostButtonClass} onClick={() => updateParam('date', '')}>Hoy</button>
          )}
          <button type="button" className={ghostButtonClass} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {loading && !board ? (
        <LoadingBlock label="Cargando tablero en vivo" />
      ) : error && !board ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : board ? (
        <>
          {error && <ErrorBlock message={error} onRetry={() => void load()} />}
          <AlertsBanner alerts={board.alerts} />
          <LiveKpis board={board} branchId={branchId} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
            <LivePeopleTable board={board} />
            <div className="space-y-5">
              <AbsencesPanel board={board} />
              <DevicesPanel board={board} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <LiveTrend days={board.trend_14_days} />
            <MonthRanking board={board} />
          </div>
        </>
      ) : null}
    </div>
  );
};
