import { ArrowRight, CheckCircle2, CircleDashed, Clock3, Users } from 'lucide-react';
import type { InductionPhaseOverview } from '../../../types/models';
import { ALERT_META, ALERT_ORDER, ALERT_SEVERITY_CLASS, formatHours, percent } from '../../../utils/inductionDashboard';

interface InductionPhaseCardProps {
  phase: InductionPhaseOverview;
  onOpen: (phaseId: number) => void;
}

const ReadinessDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
    {ok ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
    {label}
  </span>
);

/** Tarjeta resumen de una fase en el panorama. */
export const InductionPhaseCard = ({ phase, onOpen }: InductionPhaseCardProps) => {
  const passed = phase.stage_counts.APROBADA ?? 0;
  const progressPct = phase.enrolled > 0 ? Math.round((passed / phase.enrolled) * 100) : 0;
  const alerts = ALERT_ORDER.filter((alert) => (phase.alert_counts[alert] ?? 0) > 0).slice(0, 3);
  return (
    <div className="flex flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm shadow-[rgba(0,65,106,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">Fase {phase.phase_number}</p>
          <h3 className="mt-0.5 text-base font-bold leading-tight text-[var(--color-brand-700)]">{phase.name}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            phase.published_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {phase.published_at ? 'Publicada' : 'Borrador'}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 text-[var(--unilabor-neutral)]">
            <Users size={12} /> {phase.enrolled} inscritos
          </span>
          <span className="font-semibold text-emerald-700">{passed} aprobados · {progressPct} %</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[rgba(248,251,253,0.96)] px-2 py-1.5">
          <dt className="text-[10px] uppercase text-[var(--unilabor-neutral)]">Acreditación</dt>
          <dd className="text-sm font-bold text-[var(--color-brand-700)]">{percent(phase.pass_rate)}</dd>
        </div>
        <div className="rounded-lg bg-[rgba(248,251,253,0.96)] px-2 py-1.5">
          <dt className="text-[10px] uppercase text-[var(--unilabor-neutral)]">Promedio</dt>
          <dd className="text-sm font-bold text-[var(--color-brand-700)]">{percent(phase.average_percentage)}</dd>
        </div>
        <div className="rounded-lg bg-[rgba(248,251,253,0.96)] px-2 py-1.5">
          <dt className="inline-flex items-center gap-1 text-[10px] uppercase text-[var(--unilabor-neutral)]">
            <Clock3 size={10} /> Tiempo
          </dt>
          <dd className="text-sm font-bold text-[var(--color-brand-700)]">{formatHours(phase.average_hours_to_pass)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        <ReadinessDot ok={phase.readiness.documents_ok} label={`${phase.documents_total} documentos`} />
        <ReadinessDot ok={phase.readiness.quiz_ok} label="Cuestionario" />
        <ReadinessDot ok={phase.readiness.signatures_ok} label="Firmas" />
        <ReadinessDot ok={phase.readiness.duration_ok} label="Duración" />
      </div>

      {alerts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alerts.map((alert) => (
            <span key={alert} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ALERT_SEVERITY_CLASS[ALERT_META[alert].severity]}`}>
              {phase.alert_counts[alert]} · {ALERT_META[alert].label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--unilabor-neutral)]">Sin alertas pendientes.</p>
      )}

      <button
        type="button"
        onClick={() => onOpen(phase.phase_id)}
        className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
      >
        Gestionar fase <ArrowRight size={14} />
      </button>
    </div>
  );
};
