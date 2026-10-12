import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, Info } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service.parsers';
import { getCommitmentBoard, type CommitmentBoard, type CommitmentQuery } from '../../api/service.api-attendance-boards';
import { formatDate } from '../../components/attendance/shared/format';
import { isIsoDate, parsePeriod } from '../../components/attendance/board/boardHelpers';
import { ErrorBlock, LoadingBlock } from '../../components/attendance/board/BoardParts';
import { CommitmentFilters } from '../../components/attendance/board/CommitmentFilters';
import { CommitmentHighlights } from '../../components/attendance/board/CommitmentHighlights';
import { CommitmentKpis } from '../../components/attendance/board/CommitmentKpis';
import { CommitmentRanking } from '../../components/attendance/board/CommitmentRanking';
import { EmployeeDetail } from '../../components/attendance/board/EmployeeDetail';

const KEYS = ['period', 'anchor', 'from', 'to', 'branch_id', 'employee_id'] as const;

export const AttendanceCommitmentPage = () => {
  const [params, setParams] = useSearchParams();
  const query = useMemo<CommitmentQuery>(() => ({
    period: parsePeriod(params.get('period')),
    anchor: isIsoDate(params.get('anchor')) ? params.get('anchor')! : undefined,
    from: isIsoDate(params.get('from')) ? params.get('from')! : undefined,
    to: isIsoDate(params.get('to')) ? params.get('to')! : undefined,
    branch_id: params.get('branch_id') ?? undefined,
    employee_id: params.get('employee_id') ?? undefined,
  }), [params]);

  const [board, setBoard] = useState<CommitmentBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await getCommitmentBoard(JSON.parse(queryKey) as CommitmentQuery);
      if (id !== requestId.current) return;
      setBoard(data);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(getApiErrorMessage(err, 'No se pudo cargar el tablero de compromiso.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = (patch: Partial<CommitmentQuery>) => {
    const next = new URLSearchParams(params);
    for (const key of KEYS) {
      if (key in patch) {
        const value = patch[key];
        if (value) next.set(key, value);
        else next.delete(key);
      }
    }
    // Un cambio de periodo o de rango personalizado invalida el rango previo.
    if ('period' in patch && patch.period !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  const selectEmployee = (id: number) => onChange({ employee_id: String(id) });
  const detailing = !!query.employee_id;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Control de asistencias</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--color-brand-700)]">
          <Award size={28} aria-hidden="true" /> Compromiso por periodo
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Asistencia, puntualidad y salidas completas del equipo. Solo cuentan días ya cerrados.
        </p>
      </div>

      <CommitmentFilters query={query} board={board} onChange={onChange} />

      {board && board.closed_through === null && !loading && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#0284c755] bg-[#0284c71a] px-4 py-3 text-sm" role="status">
          <Info size={18} className="text-[#0284c7]" aria-hidden="true" />
          Este periodo todavía no cierra su primer día; los indicadores aparecerán mañana.
        </div>
      )}
      {board && board.closed_through && !loading && (
        <p className="text-xs text-[var(--unilabor-neutral)]">Datos cerrados hasta el {formatDate(board.closed_through)}.</p>
      )}

      {loading && !board ? (
        <LoadingBlock label="Cargando compromiso" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : board ? (
        <div className={loading ? 'pointer-events-none opacity-60 transition' : 'transition'} aria-busy={loading}>
          {detailing && board.detail ? (
            <EmployeeDetail board={board} onBack={() => onChange({ employee_id: '' })} />
          ) : (
            <div className="space-y-5">
              <CommitmentKpis board={board} />
              <CommitmentHighlights board={board} onSelect={selectEmployee} />
              <CommitmentRanking board={board} onSelect={(person) => selectEmployee(person.employee_id)} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
