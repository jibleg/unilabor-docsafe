import { useState } from 'react';
import { AlertTriangle, Award, BookOpenCheck, CheckCircle2, ChevronRight, Clock, FileText, Gauge, Layers, Loader2, Lock, StepForward } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { defaultOpenPhase, useInductionEmployee360 } from '../../../hooks/useInductionEmployee360';
import { InductionAuditLog } from './InductionAuditLog';
import { InductionPhaseDetail } from './InductionPhaseDetail';
import type { InductionAction, InductionEmployee360, InductionRosterRow, InductionTransitionTarget } from '../../../types/models';
import { STAGE_META, TRANSITION_REASON_META, formatDate, formatDuration, formatHours, percent } from '../../../utils/inductionDashboard';
import { buildProgramTrack, type ProgramTrackPhase } from '../../../utils/inductionProgramTrack';

interface InductionCollaboratorSummaryProps {
  employeeId: number;
  refreshKey: number;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
  onTransition: (target: InductionTransitionTarget, employee: InductionEmployee360['employee']) => void;
}

const sum = (values: number[]): number => values.reduce((acc, value) => acc + value, 0);

/** Indicadores globales del colaborador en las 7 fases. */
const summarize = (detail: InductionEmployee360, track: ProgramTrackPhase[]) => {
  const { enrollments, attempts } = detail;
  const approved = enrollments.filter((row) => row.stage === 'APROBADA');
  const scores = approved.map((row) => row.evaluation_percentage).filter((value): value is number => value !== null);
  return {
    approved: track.filter((phase) => phase.state === 'done').length,
    phases: track.length,
    signed: sum(enrollments.map((row) => row.reading_signed)),
    readingTotal: sum(enrollments.map((row) => row.reading_total)),
    readingSeconds: sum(enrollments.map((row) => row.reading_active_seconds)),
    attempts: attempts.length,
    averageScore: scores.length > 0 ? sum(scores) / scores.length : null,
    certificates: enrollments.filter((row) => row.certificate_document_id !== null).length,
  };
};

const Kpi = ({ icon: Icon, label, value, hint }: { icon: typeof Award; label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--unilabor-neutral)]">
      <Icon size={11} /> {label}
    </p>
    <p className="mt-0.5 text-lg font-bold text-[var(--color-brand-700)]">{value}</p>
    {hint ? <p className="text-[10px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
  </div>
);

/**
 * Resumen de la inducción de un colaborador en el tablero: datos, indicadores
 * globales, tabla de las Fases 1-4 y detalle completo de la fase elegida
 * (lecturas, intentos, constancia y acciones), más la bitácora de RH.
 */
export const InductionCollaboratorSummary = ({ employeeId, refreshKey, onAction, onTransition }: InductionCollaboratorSummaryProps) => {
  const navigate = useNavigate();
  const { detail, loading } = useInductionEmployee360(employeeId, refreshKey);
  const [openPhase, setOpenPhase] = useState<number | null>(null);

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-16">
        {loading ? <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" /> : <p className="text-sm text-[var(--unilabor-neutral)]">Sin información del colaborador.</p>}
      </div>
    );
  }

  const shownPhase = openPhase ?? defaultOpenPhase(detail);
  const track = buildProgramTrack(detail);
  const stats = summarize(detail, track);
  const { employee } = detail;

  return (
    <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Resumen de inducción</p>
          <h2 className="mt-0.5 text-xl font-bold text-[var(--color-brand-700)]">{employee.full_name}</h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            {employee.employee_code}
            {employee.position_name ? ` · ${employee.position_name}` : ''}
            {employee.branch_name ? ` · ${employee.branch_name}` : ''}
            {employee.area ? ` · ${employee.area}` : ''}
            {employee.email ? ` · ${employee.email}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {!employee.is_active ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">Inactivo</span> : null}
            {!employee.user_linked ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Sin usuario vinculado</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/rh/expedients')}
          className="rounded-lg border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
        >
          Ver expediente RH
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Layers} label="Fases aprobadas" value={`${stats.approved}/${stats.phases}`} />
        <Kpi icon={BookOpenCheck} label="Documentos firmados" value={`${stats.signed}/${stats.readingTotal}`} />
        <Kpi icon={Clock} label="Tiempo de lectura" value={formatDuration(stats.readingSeconds)} />
        <Kpi icon={FileText} label="Intentos" value={String(stats.attempts)} hint="de evaluación, todas las fases" />
        <Kpi icon={Gauge} label="Promedio" value={stats.averageScore !== null ? percent(stats.averageScore) : '—'} hint="fases aprobadas" />
        <Kpi icon={Award} label="Constancias" value={String(stats.certificates)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[rgba(0,65,106,0.08)]">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[rgba(191,212,230,0.28)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-brand-700)]">
            <tr>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Inicio</th>
              <th className="px-3 py-2">Lectura</th>
              <th className="px-3 py-2">Evaluación</th>
              <th className="px-3 py-2">Constancia</th>
              <th className="px-3 py-2">Tiempo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.06)] bg-white">
            {track.map((phase) => {
              const row = phase.row;
              const selectable = Boolean(row) || Boolean(phase.competency) || phase.state === 'ready' || phase.state === 'blocked';
              const active = phase.phase_number === shownPhase;
              const readingPct = row && row.reading_total > 0 ? Math.round((row.reading_signed / row.reading_total) * 100) : 0;
              return (
                <tr
                  key={phase.phase_number}
                  onClick={selectable ? () => setOpenPhase(phase.phase_number) : undefined}
                  className={`${selectable ? 'cursor-pointer hover:bg-[rgba(191,212,230,0.18)]' : ''} ${active ? 'bg-[rgba(191,212,230,0.28)]' : ''}`}
                >
                  <td className="px-3 py-2">
                    <p className="font-bold text-[var(--color-brand-700)]">
                      Fase {phase.phase_number}
                      {phase.scope === 'POSITION' ? <span className="ml-1 text-[9px] font-semibold uppercase text-[var(--color-brand-500)]">puesto</span> : null}
                    </p>
                    <p className="max-w-[180px] truncate text-[10px] text-[var(--unilabor-neutral)]">{phase.phase_name}</p>
                  </td>
                  {row ? (
                    <>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[row.stage].className}`}>
                          {STAGE_META[row.stage].short}
                        </span>
                        {row.alerts.length > 0 ? <p className="mt-0.5 text-[10px] text-rose-600">{row.alerts.length} alerta(s)</p> : null}
                      </td>
                      <td className="px-3 py-2 text-[var(--unilabor-ink)]">{formatDate(row.enrolled_at)}</td>
                      <td className="px-3 py-2">
                        {row.evaluation_mode === 'practical' ? (
                          <span className="text-[var(--unilabor-neutral)]">Sin lectura (práctica)</span>
                        ) : (
                          <>
                            <p className="text-[var(--unilabor-ink)]">
                              {row.reading_signed}/{row.reading_total} firmados
                            </p>
                            <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                              <div className={`h-full ${readingPct === 100 ? 'bg-emerald-500' : 'bg-[#0069a6]'}`} style={{ width: `${readingPct}%` }} />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--unilabor-ink)]">
                        {row.evaluation_percentage !== null ? percent(row.evaluation_percentage) : '—'}
                        <p className="text-[10px] text-[var(--unilabor-neutral)]">
                          {row.evaluation_mode === 'practical' ? 'práctica' : `${row.attempts_total} intento(s)`}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {row.certificate_document_id ? (
                          <CheckCircle2 size={15} className="text-emerald-600" aria-label="Emitida" />
                        ) : (
                          <span className="text-[var(--unilabor-neutral)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--unilabor-ink)]">{formatHours(row.elapsed_hours)}</td>
                    </>
                  ) : phase.competency && phase.stage ? (
                    <>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[phase.stage].className}`}>
                          {STAGE_META[phase.stage].short}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--unilabor-ink)]">{formatDate(phase.competency.evaluation_date)}</td>
                      <td className="px-3 py-2 text-[var(--unilabor-neutral)]">REH-REG-003</td>
                      <td className="px-3 py-2 text-[var(--unilabor-ink)]">{percent(phase.competency.final_pct)}</td>
                      <td className="px-3 py-2 text-[var(--unilabor-neutral)]">—</td>
                      <td className="px-3 py-2 text-[var(--unilabor-neutral)]">—</td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          phase.state === 'blocked' ? 'font-semibold text-rose-600' : phase.state === 'ready' ? 'font-semibold text-emerald-700' : 'text-[var(--unilabor-neutral)]'
                        }`}
                      >
                        {phase.state === 'blocked' ? <AlertTriangle size={12} /> : phase.state === 'ready' ? <StepForward size={12} /> : <Lock size={12} />}
                        {phase.state === 'blocked' ? `Bloqueado: ${phase.blocks.map((block) => TRANSITION_REASON_META[block.reason].label).join(', ')}` : phase.label}
                        {!phase.published && phase.phase_number < 7 && phase.state === 'locked' ? ' · fase en borrador' : ''}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {selectable ? <ChevronRight size={15} className={active ? 'text-[var(--color-brand-500)]' : 'text-[var(--unilabor-neutral)]'} /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shownPhase !== null ? (
        <InductionPhaseDetail detail={detail} phaseNumber={shownPhase} onAction={onAction} onTransition={(target) => onTransition(target, employee)} />
      ) : (
        <p className="text-xs text-[var(--unilabor-neutral)]">El colaborador aún no está inscrito en ninguna fase.</p>
      )}

      <InductionAuditLog audit={detail.audit} />
    </div>
  );
};
