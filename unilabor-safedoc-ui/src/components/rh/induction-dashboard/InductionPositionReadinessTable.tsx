import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getInductionPositionReadiness } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionPositionPhaseReadiness, InductionPositionReadinessRow } from '../../../types/models';
import { EVALUATION_STATE_META } from '../../../utils/inductionDashboard';
import { notifyError } from '../../../utils/notify';

interface InductionPositionReadinessTableProps {
  refreshKey: number;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const totalWaiting = (row: InductionPositionReadinessRow) => row.phase5.waiting + row.phase6.waiting + row.phase7.waiting;

const Ok = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle2 size={14} className="text-emerald-600" aria-label="Listo" /> : <CircleDashed size={14} className="text-amber-600" aria-label="Pendiente" />;

const Waiting = ({ waiting, ready }: { waiting: number; ready: number }) =>
  waiting > 0 ? (
    <p className={`text-[11px] font-semibold ${ready < waiting ? 'text-rose-600' : 'text-emerald-700'}`}>
      {waiting} esperan{ready < waiting ? ` · ${waiting - ready} bloqueados` : ''}
    </p>
  ) : null;

const PhaseCell = ({ phase, label, showQuestions }: { phase: InductionPositionPhaseReadiness; label: string; showQuestions: boolean }) => {
  if (!phase.enabled) {
    return (
      <td className="px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1 text-rose-600">
          <CircleDashed size={14} /> No habilitado
        </span>
        <Waiting waiting={phase.waiting} ready={phase.ready} />
      </td>
    );
  }
  const state = phase.evaluation_state ?? 'MISSING';
  return (
    <td className="px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <Ok ok={phase.ok} />
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${EVALUATION_STATE_META[state].className}`}>
          {label} {EVALUATION_STATE_META[state].label.toLowerCase()}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--unilabor-neutral)]">
        {showQuestions ? `${phase.question_count} preguntas · ` : ''}
        {phase.certificate_signatures} firmas · {phase.enrolled} inscritos
      </p>
      <Waiting waiting={phase.waiting} ready={phase.ready} />
    </td>
  );
};

/**
 * Preparación por puesto de las Fases 5-7: qué le falta a cada puesto para
 * recibir colaboradores y cuántos esperan por él. Ordenada por quienes esperan
 * para que RH configure primero lo que más gente detiene.
 */
export const InductionPositionReadinessTable = ({ refreshKey }: InductionPositionReadinessTableProps) => {
  const [rows, setRows] = useState<InductionPositionReadinessRow[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInductionPositionReadiness()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((error) => {
        if (!cancelled) notifyError(getApiErrorMessage(error, 'No se pudo cargar la preparación por puesto.'));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const visible = useMemo(() => {
    const search = normalize(q.trim());
    return (rows ?? [])
      .filter((row) => row.employees_active > 0 || totalWaiting(row) > 0)
      .filter((row) => !search || normalize(`${row.position_code} ${row.position_name}`).includes(search))
      .filter((row) => !onlyPending || !(row.phase5.ok && row.phase6.ok && row.phase7.ok))
      .sort((a, b) => totalWaiting(b) - totalWaiting(a) || b.employees_active - a.employees_active || a.position_code.localeCompare(b.position_code));
  }, [rows, q, onlyPending]);

  const summary = useMemo(() => {
    const list = (rows ?? []).filter((row) => row.employees_active > 0);
    return {
      positions: list.length,
      f5: list.filter((row) => row.phase5.ok).length,
      f6: list.filter((row) => row.phase6.ok).length,
      f7: list.filter((row) => row.phase7.ok).length,
    };
  }, [rows]);

  if (!rows) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-[var(--unilabor-neutral)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-[var(--unilabor-neutral)]">
          De {summary.positions} puestos con colaboradores: <strong className="text-[var(--color-brand-700)]">{summary.f5}</strong> listos para Fase 5,{' '}
          <strong className="text-[var(--color-brand-700)]">{summary.f6}</strong> para Fase 6 y <strong className="text-[var(--color-brand-700)]">{summary.f7}</strong>{' '}
          con competencias para Fase 7.
        </p>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand-700)]">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Solo con pendientes
        </label>
        <label className="relative w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar puesto"
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-1.5 pl-9 pr-3 text-sm focus:border-[var(--color-brand-300)] focus:outline-none"
          />
        </label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgba(248,251,253,0.9)] text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <tr>
              <th className="px-3 py-2">Puesto</th>
              <th className="px-3 py-2">Colab.</th>
              <th className="px-3 py-2">Documentos</th>
              <th className="px-3 py-2">Fase 5 · cuestionario</th>
              <th className="px-3 py-2">Fase 6 · práctica</th>
              <th className="px-3 py-2">Fase 7 · competencias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-[var(--unilabor-neutral)]">
                  Sin puestos que coincidan.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.position_id} className="align-top">
                  <td className="px-3 py-2">
                    <Link
                      to={`/rh/positions?position=${row.position_id}`}
                      className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand-700)] hover:underline"
                    >
                      <span className="rounded bg-slate-100 px-1 font-mono text-[10px]">{row.position_code}</span>
                      <ExternalLink size={11} />
                    </Link>
                    <p className="max-w-[220px] text-[11px] text-[var(--unilabor-neutral)]">{row.position_name}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--unilabor-ink)]">{row.employees_active}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={row.documents_total > 0 ? 'text-[var(--unilabor-ink)]' : 'font-semibold text-rose-600'}>{row.documents_total}</span>
                  </td>
                  <PhaseCell phase={row.phase5} label="Cuestionario" showQuestions />
                  <PhaseCell phase={row.phase6} label="Práctica" showQuestions={false} />
                  <td className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Ok ok={row.phase7.ok} />
                      <span className={row.competencies_total > 0 ? 'text-[var(--unilabor-ink)]' : 'font-semibold text-rose-600'}>
                        {row.competencies_total} competencias
                      </span>
                    </div>
                    {row.phase7.started > 0 ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.phase7.started} en evaluación</p> : null}
                    <Waiting waiting={row.phase7.waiting} ready={row.phase7.ready} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
