import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ExternalLink, Loader2, Search, Square, StepForward } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getInductionTransitionQueue } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { Pagination } from '../../Pagination';
import { InductionPositionChips } from './InductionPositionChips';
import { InductionTransitionModal, type TransitionCandidateRef } from './InductionTransitionModal';
import type {
  InductionTransitionBlockReason,
  InductionTransitionQueue,
  InductionTransitionRow,
  InductionTransitionState,
  InductionTransitionTarget,
} from '../../../types/models';
import {
  COMPETENCY_DICTAMEN_LABEL,
  STAGE_META,
  TRANSITION_REASON_META,
  TRANSITION_REASON_ORDER,
  TRANSITION_STATE_META,
  TRANSITION_TARGET_META,
  competencyLink,
  competencyStage,
  formatDate,
  formatHours,
  percent,
} from '../../../utils/inductionDashboard';
import { notifyError } from '../../../utils/notify';

interface InductionTransitionBoardProps {
  target: InductionTransitionTarget;
  refreshKey: number;
  onChanged: () => void;
  onOpenEmployee: (employeeId: number) => void;
}

const PAGE_SIZE = 30;

const StatusCell = ({ row }: { row: InductionTransitionRow }) => {
  if (row.state === 'STARTED' && row.competency) {
    const stage = competencyStage(row.competency);
    return (
      <div className="space-y-1 text-xs">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[stage].className}`}>{STAGE_META[stage].short}</span>
        <p className="text-[11px] text-[var(--unilabor-neutral)]">
          {row.competency.dictamen ? `${COMPETENCY_DICTAMEN_LABEL[row.competency.dictamen] ?? row.competency.dictamen} · ` : ''}
          {row.competency.final_pct !== null ? `${percent(row.competency.final_pct)} · ` : ''}
          Evaluador: {row.competency.evaluator_name || '—'}
        </p>
        <Link to={competencyLink(row.competency.evaluation_id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline">
          Abrir REH-REG-003 <ExternalLink size={11} />
        </Link>
      </div>
    );
  }
  if (row.state === 'READY') {
    return <p className="text-xs text-emerald-700">Cumple todo; puede avanzar ahora.</p>;
  }
  return (
    <ul className="space-y-1">
      {row.blocks.map((block) => (
        <li key={block.reason} className="text-xs">
          <p className="font-semibold text-rose-700">{TRANSITION_REASON_META[block.reason].label}</p>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">{block.detail}</p>
          <Link
            to={TRANSITION_REASON_META[block.reason].path(row.position_id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline"
          >
            {TRANSITION_REASON_META[block.reason].fix} <ExternalLink size={11} />
          </Link>
        </li>
      ))}
    </ul>
  );
};

/**
 * Bandeja de avance de las fases por puesto: quienes aprobaron la fase anterior
 * y aún no están en la siguiente, cada uno LISTO o BLOQUEADO (con su motivo y
 * dónde se resuelve). RH mueve a los listos de uno en uno o en lote.
 */
export const InductionTransitionBoard = ({ target, refreshKey, onChanged, onOpenEmployee }: InductionTransitionBoardProps) => {
  const [queue, setQueue] = useState<InductionTransitionQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<InductionTransitionState | null>(target === 7 ? null : 'READY');
  const [reason, setReason] = useState<InductionTransitionBlockReason | ''>('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, TransitionCandidateRef>>(new Map());
  const [confirming, setConfirming] = useState<TransitionCandidateRef[] | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    getInductionTransitionQueue({
      target,
      state: state ?? undefined,
      reason: reason || undefined,
      q: debouncedQ || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (!cancelled) setQueue(data);
      })
      .catch((error) => {
        if (!cancelled) notifyError(getApiErrorMessage(error, 'No se pudo cargar la bandeja de avance.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, state, reason, debouncedQ, page, refreshKey, localRefresh]);

  const resetPaging = () => {
    setPage(1);
    setLoading(true);
    setSelected(new Map());
  };

  const rows = useMemo(() => queue?.rows ?? [], [queue]);
  const readyRows = useMemo(() => rows.filter((row) => row.state === 'READY'), [rows]);
  const allReadySelected = readyRows.length > 0 && readyRows.every((row) => selected.has(row.employee_id));
  const meta = TRANSITION_TARGET_META[target];

  const toggle = (row: InductionTransitionRow) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.employee_id)) next.delete(row.employee_id);
      else next.set(row.employee_id, { employee_id: row.employee_id, employee_name: row.employee_name, position_code: row.position_code });
      return next;
    });

  const toggleAllReady = () =>
    setSelected(
      allReadySelected
        ? new Map()
        : new Map(readyRows.map((row) => [row.employee_id, { employee_id: row.employee_id, employee_name: row.employee_name, position_code: row.position_code }])),
    );

  const stateTabs: Array<{ value: InductionTransitionState | null; label: string }> = [
    { value: 'READY', label: 'Listos' },
    { value: 'BLOCKED', label: 'Bloqueados' },
    ...(target === 7 ? [{ value: 'STARTED' as const, label: 'En evaluación' }] : []),
    { value: null, label: 'Todos' },
  ];
  const countFor = (value: InductionTransitionState | null) =>
    queue ? (value ? queue.state_counts[value] : queue.state_counts.READY + queue.state_counts.BLOCKED + queue.state_counts.STARTED) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-xs text-[var(--unilabor-neutral)]">
          {meta.hint} Cada colaborador aparece <strong>Listo</strong> o <strong>Bloqueado</strong> con el motivo exacto; al resolverlo pasa solo a Listo.
        </p>
        {queue && target !== 7 ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${queue.phase.published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
          >
            Fase {target} {queue.phase.published ? 'publicada' : 'en borrador'}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stateTabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => {
              setState(tab.value);
              resetPaging();
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              state === tab.value ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
            }`}
          >
            {tab.label}
            {countFor(tab.value) !== null ? <span className="ml-1 opacity-80">{countFor(tab.value)}</span> : null}
          </button>
        ))}
        <select
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as InductionTransitionBlockReason | '');
            resetPaging();
          }}
          className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2 py-1.5 text-xs"
        >
          <option value="">Todos los motivos</option>
          {TRANSITION_REASON_ORDER.filter((item) => (queue?.reason_counts[item] ?? 0) > 0 || item === reason).map((item) => (
            <option key={item} value={item}>
              {TRANSITION_REASON_META[item].label} ({queue?.reason_counts[item] ?? 0})
            </option>
          ))}
        </select>
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPaging();
            }}
            placeholder="Buscar por nombre, clave, puesto o sucursal"
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-1.5 pl-9 pr-3 text-sm focus:border-[var(--color-brand-300)] focus:outline-none"
          />
        </label>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setConfirming([...selected.values()])}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            <StepForward size={14} /> {meta.action} ({selected.size})
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgba(248,251,253,0.9)] text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <tr>
              <th className="w-8 px-3 py-2">
                <button type="button" onClick={toggleAllReady} disabled={readyRows.length === 0} aria-label="Seleccionar los listos de la página" className="disabled:opacity-30">
                  {allReadySelected ? <CheckSquare size={15} className="text-[var(--color-brand-500)]" /> : <Square size={15} />}
                </button>
              </th>
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Puesto</th>
              <th className="px-3 py-2">Aprobó Fase {target - 1}</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Detalle / cómo destrabarlo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className={`divide-y divide-[rgba(0,65,106,0.06)] ${loading ? 'opacity-60' : ''}`}>
            {loading && !queue ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center">
                  <Loader2 size={20} className="mx-auto animate-spin text-[var(--unilabor-neutral)]" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-xs text-[var(--unilabor-neutral)]">
                  {state === 'READY' ? 'No hay colaboradores listos con estos filtros.' : 'Nadie en este estado: no hay colaboradores detenidos aquí.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.employee_id} className="align-top">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => toggle(row)} disabled={row.state !== 'READY'} aria-label="Seleccionar" className="disabled:opacity-25">
                      {selected.has(row.employee_id) ? <CheckSquare size={15} className="text-[var(--color-brand-500)]" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onOpenEmployee(row.employee_id)} className="text-left font-semibold text-[var(--color-brand-700)] hover:underline">
                      {row.employee_name}
                    </button>
                    <p className="text-[11px] text-[var(--unilabor-neutral)]">
                      {row.employee_code}
                      {row.branch_name ? ` · ${row.branch_name}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.positions && row.positions.length > 1 ? (
                      <>
                        <InductionPositionChips positions={row.positions} highlight={row.position_code} />
                        <p className="mt-1 max-w-[220px] text-[11px] text-[var(--unilabor-neutral)]">
                          {row.positions.length} puestos, uno tras otro · {row.state === 'STARTED' ? 'en evaluación' : 'inicia'}: {row.position_code ?? '—'}
                        </p>
                      </>
                    ) : (
                      <>
                        {row.position_code ? <span className="rounded bg-slate-100 px-1 font-mono text-[10px]">{row.position_code}</span> : '—'}
                        <p className="max-w-[200px] text-[11px] text-[var(--unilabor-neutral)]">{row.position_name}</p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p className="text-[var(--unilabor-ink)]">{formatDate(row.previous_passed_at)}</p>
                    <p className="text-[11px] text-[var(--unilabor-neutral)]">
                      {percent(row.previous_percentage)} · espera {formatHours(row.waiting_hours)}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TRANSITION_STATE_META[row.state].className}`}>
                      {TRANSITION_STATE_META[row.state].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusCell row={row} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.state === 'READY' ? (
                      <button
                        type="button"
                        onClick={() => setConfirming([{ employee_id: row.employee_id, employee_name: row.employee_name, position_code: row.position_code }])}
                        className="whitespace-nowrap rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        {meta.action}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {queue && queue.total_pages > 1 ? (
        <Pagination
          page={queue.page}
          totalPages={queue.total_pages}
          total={queue.total}
          pageSize={queue.limit}
          onPageChange={(next) => {
            setPage(next);
            setLoading(true);
          }}
          loading={loading}
        />
      ) : null}

      {confirming ? (
        <InductionTransitionModal
          target={target}
          candidates={confirming}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setSelected(new Map());
            setLocalRefresh((key) => key + 1);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
};
