import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, CircleDashed, Coffee, Eye, EyeOff, Loader2, RefreshCw, Settings2, Timer, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  publishInductionPhase,
  unpublishInductionPhase,
  updatePhaseAutoChecklist,
  updatePhaseDuration,
  updatePhaseReadingLimit,
} from '../../../api/service.api-rh-induction';
import {
  reconcilePhaseAdvance,
  updatePhaseAdvanceGrace,
  updatePhaseAutoAdvance,
  updatePhaseEvaluationRules,
} from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionPhaseOverview } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';

interface InductionPhaseRulesPanelProps {
  phase: InductionPhaseOverview;
  /** Inscritos que aún no terminan la lectura (para el recálculo del límite). */
  pendingReaders: number;
  onChanged: () => Promise<void> | void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-1.5 text-sm focus:border-[var(--color-brand-300)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const softButton =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50';

const Toggle = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex w-full items-start gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-left transition hover:border-[var(--color-brand-300)] disabled:opacity-50"
    role="switch"
    aria-checked={checked}
  >
    <span className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
    </span>
    <span>
      <span className="block text-xs font-semibold text-[var(--unilabor-ink)]">{label}</span>
      <span className="block text-[11px] leading-4 text-[var(--unilabor-neutral)]">{hint}</span>
    </span>
  </button>
);

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className={`inline-flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
    {ok ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
    {label}
  </li>
);

/**
 * Reglas y preparación de una fase (1-4): lectura, evaluación, constancia,
 * interruptores de automatización, publicación y sincronización de avances.
 * Todo se edita en sitio contra los endpoints ya existentes + los del tablero.
 */
export const InductionPhaseRulesPanel = ({ phase, pendingReaders, onChanged }: InductionPhaseRulesPanelProps) => {
  const navigate = useNavigate();
  const { rules, readiness } = phase;
  const [readingHours, setReadingHours] = useState('');
  const [applyToEnrolled, setApplyToEnrolled] = useState(true);
  const [durationHours, setDurationHours] = useState('');
  const [windowHours, setWindowHours] = useState('');
  const [attemptMinutes, setAttemptMinutes] = useState('');
  const [passingScore, setPassingScore] = useState('');
  const [graceEnabled, setGraceEnabled] = useState(false);
  const [graceHours, setGraceHours] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const isLastPhase = phase.phase_number >= 4;
  const graceApplies = phase.phase_number >= 2;

  useEffect(() => {
    setReadingHours(rules.reading_time_limit_hours ? String(rules.reading_time_limit_hours) : '');
    setDurationHours(rules.duration_hours ? String(rules.duration_hours) : '');
    setWindowHours(rules.evaluation_window_hours ? String(rules.evaluation_window_hours) : '');
    setAttemptMinutes(rules.attempt_time_limit_minutes ? String(rules.attempt_time_limit_minutes) : '');
    setPassingScore(rules.passing_score !== null ? String(rules.passing_score) : '');
    setGraceEnabled(Boolean(rules.advance_grace_hours && rules.advance_grace_hours > 0));
    setGraceHours(rules.advance_grace_hours ? String(rules.advance_grace_hours) : '24');
  }, [phase.phase_id, rules]);

  const run = async (key: string, fn: () => Promise<string | void>, fallback: string) => {
    setBusy(key);
    try {
      const message = await fn();
      if (message) notifySuccess(message);
      await onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  const handleTogglePublish = async () => {
    if (readiness.published) {
      const ok = await confirmAction(
        'Regresar la fase a borrador',
        'Solo es posible si nadie ha empezado a leer ni tiene evaluación. Las lecturas pendientes se retiran y se reasignan al volver a publicar.',
        'Regresar a borrador',
        'danger',
      );
      if (!ok) return;
      await run('publish', async () => {
        await unpublishInductionPhase(phase.phase_id);
        return 'La fase regresó a borrador.';
      }, 'No se pudo regresar la fase a borrador.');
      return;
    }
    const deadline = rules.reading_time_limit_hours
      ? new Date(Date.now() + rules.reading_time_limit_hours * 3_600_000).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })
      : null;
    const ok = await confirmAction(
      `Publicar la Fase ${phase.phase_number}`,
      `Los ${phase.enrolled} inscritos en espera reciben sus lecturas ahora${deadline ? ` (límite: ${deadline})` : ' (sin límite de lectura)'} y un SMS. Además, quienes ya aprobaron la fase anterior y no estaban inscritos se inscriben automáticamente.`,
      'Publicar fase',
      'primary',
    );
    if (!ok) return;
    await run('publish', async () => {
      const result = await publishInductionPhase(phase.phase_id);
      return result.message;
    }, 'No se pudo publicar la fase.');
  };

  const handleSaveReadingLimit = async () => {
    const value = readingHours.trim() === '' ? null : Number(readingHours);
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      notifyError('El límite de lectura debe ser un número entero de horas mayor a 0 (o vacío para sin límite).');
      return;
    }
    const apply = readiness.published && applyToEnrolled && pendingReaders > 0;
    if (apply) {
      const ok = await confirmAction(
        'Recalcular el plazo de lectura',
        `Se recalculará la fecha límite de ${pendingReaders} inscrito(s) que aún no terminan de leer. Si el nuevo plazo ya venció, su evaluación se abre de inmediato.`,
        'Guardar y aplicar',
        'primary',
      );
      if (!ok) return;
    }
    await run('reading', async () => {
      const result = await updatePhaseReadingLimit(phase.phase_id, value, apply);
      return result.message;
    }, 'No se pudo guardar el límite de lectura.');
  };

  const handleSaveDuration = async () => {
    const value = durationHours.trim() === '' ? null : Number(durationHours);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      notifyError('La duración debe ser un número de horas mayor a 0.');
      return;
    }
    await run('duration', async () => {
      await updatePhaseDuration(phase.phase_id, value);
      return 'Duración de la fase guardada.';
    }, 'No se pudo guardar la duración.');
  };

  const handleSaveEvaluationRules = async () => {
    const window = Number(windowHours);
    const minutes = attemptMinutes.trim() === '' ? null : Number(attemptMinutes);
    const score = Number(passingScore);
    if (!Number.isInteger(window) || window <= 0) {
      notifyError('La ventana para presentar debe ser un entero de horas mayor a 0.');
      return;
    }
    if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) {
      notifyError('Los minutos por intento deben ser un entero mayor a 0 (o vacío para sin cronómetro).');
      return;
    }
    if (!Number.isInteger(score) || score <= 0 || score > 100) {
      notifyError('La calificación mínima debe estar entre 1 y 100.');
      return;
    }
    await run('evaluation', async () => {
      await updatePhaseEvaluationRules(phase.phase_id, { window_hours: window, attempt_time_limit_minutes: minutes, passing_score: score });
      return 'Reglas del cuestionario guardadas. Aplican a los intentos que se abran a partir de ahora.';
    }, 'No se pudieron guardar las reglas del cuestionario.');
  };

  const handleSaveGrace = async () => {
    const value = graceEnabled ? Number(graceHours) : null;
    if (graceEnabled && (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > 720)) {
      notifyError('El descanso debe ser un entero entre 1 y 720 horas.');
      return;
    }
    await run('grace', async () => updatePhaseAdvanceGrace(phase.phase_id, value), 'No se pudo guardar el periodo de descanso.');
  };

  const handleSync = async () => {
    const ok = await confirmAction(
      'Sincronizar avances',
      `Se inscribirá en la Fase ${phase.phase_number} a todo colaborador activo que ya aprobó la Fase ${phase.phase_number - 1} y aún no está inscrito.${
        readiness.published ? ' Recibirán sus lecturas y un SMS de inmediato.' : ' Quedarán en espera hasta publicar la fase.'
      }`,
      'Sincronizar',
      'primary',
    );
    if (!ok) return;
    await run('sync', async () => (await reconcilePhaseAdvance(phase.phase_id)).message, 'No se pudieron sincronizar los avances.');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">Estado de la fase</p>
            <p className="mt-1 text-sm text-[var(--unilabor-ink)]">
              {readiness.published ? 'Publicada: los inscritos leen y presentan a su ritmo.' : 'En borrador: los inscritos esperan la publicación.'}
            </p>
          </div>
          <button type="button" onClick={handleTogglePublish} disabled={busy !== null || (!readiness.published && !readiness.ready)} className={softButton}>
            {busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : readiness.published ? <EyeOff size={14} /> : <Eye size={14} />}
            {readiness.published ? 'Regresar a borrador' : 'Publicar fase'}
          </button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Check ok={readiness.documents_ok} label={`${phase.documents_total} documento(s) obligatorio(s)`} />
          <Check ok={readiness.quiz_ok} label={rules.quiz_published ? `Cuestionario: ${rules.quiz_title}` : 'Cuestionario publicado'} />
          <Check ok={readiness.signatures_ok} label={`${rules.certificate_signatures}/3 firmas de la constancia`} />
          <Check ok={readiness.duration_ok} label="Duración para la constancia" />
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/rh/induction')} className={softButton}>
            <Settings2 size={14} /> Documentos, checklist y contacto
          </button>
          <button type="button" onClick={() => navigate('/rh/trainings')} className={softButton}>
            <BookOpen size={14} /> Cuestionario y firmas
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
          <Workflow size={13} /> Progresión autónoma
        </p>
        <div className="mt-2 space-y-2">
          <Toggle
            checked={rules.auto_advance_on_pass}
            disabled={busy !== null || isLastPhase}
            label={isLastPhase ? 'Última fase institucional' : `Avanzar a la Fase ${phase.phase_number + 1} al aprobar`}
            hint={
              isLastPhase
                ? 'La Fase 4 cierra el bloque institucional; las Fases 5-7 se gestionan por puesto.'
                : 'Al acreditar el cuestionario, el colaborador se inscribe solo en la siguiente fase con su propio plazo de lectura y ventana de examen.'
            }
            onChange={(next) =>
              void run('advance', async () => updatePhaseAutoAdvance(phase.phase_id, next), 'No se pudo cambiar el avance automático.')
            }
          />
          <Toggle
            checked={rules.auto_complete_checklist_on_pass}
            disabled={busy !== null}
            label="Completar checklist al aprobar"
            hint="Al emitir la constancia se marcan todos los contenidos de la fase con la cuenta de RH."
            onChange={async (next) => {
              const ok = await confirmAction(
                next ? 'Encender checklist automático' : 'Apagar checklist automático',
                next
                  ? 'Cada aprobación futura marcará automáticamente el checklist de contenidos.'
                  : 'RH volverá a marcar el checklist a mano.',
                next ? 'Encender' : 'Apagar',
                'primary',
              );
              if (!ok) return;
              await run('checklist', async () => (await updatePhaseAutoChecklist(phase.phase_id, next)).message, 'No se pudo cambiar el interruptor.');
            }}
          />
          {graceApplies ? (
            <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-3 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]">
              <div className="flex items-start justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                  <Coffee size={14} /> Periodo de descanso antes de iniciar esta fase
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={graceEnabled}
                  disabled={busy !== null}
                  onClick={() => setGraceEnabled((prev) => !prev)}
                  className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${graceEnabled ? 'bg-amber-500' : 'bg-slate-300'}`}
                  title={graceEnabled ? 'Aplicar descanso' : 'No aplicar descanso'}
                >
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition ${graceEnabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-amber-900/80">
                {graceEnabled
                  ? `Al avanzar desde la Fase ${phase.phase_number - 1}, la inscripción se crea de inmediato pero las lecturas, el plazo y el SMS se activan cuando termina el descanso.`
                  : `No aplica: al avanzar desde la Fase ${phase.phase_number - 1}, las lecturas y el plazo arrancan en el mismo instante de la aprobación.`}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={graceHours}
                  disabled={!graceEnabled || busy !== null}
                  onChange={(e) => setGraceHours(e.target.value)}
                  className={`${inputClass} w-24 disabled:opacity-50`}
                />
                <span className="text-xs text-amber-900/80">horas</span>
                <div className="ml-auto flex gap-1">
                  {[24, 48, 72].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!graceEnabled || busy !== null}
                      onClick={() => setGraceHours(String(preset))}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40 ${Number(graceHours) === preset ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'}`}
                    >
                      {preset} h
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-900">
                  {rules.advance_grace_hours ? `Vigente: ${rules.advance_grace_hours} h de descanso` : 'Vigente: sin descanso'}
                </span>
                <button
                  type="button"
                  onClick={handleSaveGrace}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy === 'grace' ? <Loader2 size={12} className="animate-spin" /> : null}
                  {graceEnabled ? 'Aplicar descanso' : 'Guardar sin descanso'}
                </button>
              </div>
            </div>
          ) : null}
          {phase.phase_number > 1 ? (
            <button type="button" onClick={handleSync} disabled={busy !== null} className={`${softButton} w-full`}>
              {busy === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sincronizar avances desde la Fase {phase.phase_number - 1}
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
          <Timer size={13} /> Reglas de tiempo
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--unilabor-ink)]">Límite de lectura (horas desde la inscripción)</label>
            <div className="mt-1 flex gap-2">
              <input type="number" min={1} value={readingHours} onChange={(e) => setReadingHours(e.target.value)} placeholder="Sin límite" className={inputClass} />
              <button type="button" onClick={handleSaveReadingLimit} disabled={busy !== null} className={softButton}>
                {busy === 'reading' ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
              </button>
            </div>
            {readiness.published && pendingReaders > 0 ? (
              <label className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--unilabor-neutral)]">
                <input type="checkbox" checked={applyToEnrolled} onChange={(e) => setApplyToEnrolled(e.target.checked)} />
                Aplicar también a los {pendingReaders} inscritos que aún leen
              </label>
            ) : null}
            <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">Al vencer, el cuestionario se abre aunque falten documentos por firmar.</p>
          </div>

          <p className="text-xs font-semibold text-[var(--unilabor-ink)]">Cuestionario: ventana para presentar, cronómetro y calificación mínima</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[var(--unilabor-ink)]">Ventana (h)</label>
              <input type="number" min={1} value={windowHours} onChange={(e) => setWindowHours(e.target.value)} disabled={!rules.quiz_published} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--unilabor-ink)]">Min./intento</label>
              <input type="number" min={1} value={attemptMinutes} onChange={(e) => setAttemptMinutes(e.target.value)} placeholder="Sin cronómetro" disabled={!rules.quiz_published} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--unilabor-ink)]">Mínimo %</label>
              <input type="number" min={1} max={100} value={passingScore} onChange={(e) => setPassingScore(e.target.value)} disabled={!rules.quiz_published} className={`${inputClass} mt-1`} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--unilabor-neutral)]">
              {rules.quiz_published
                ? `${rules.selection_mode === 'random' ? `${rules.random_count} preguntas al azar` : 'Todas las preguntas'} de un banco de ${rules.question_bank_size}.`
                : 'Publica el cuestionario en Capacitaciones para editar estas reglas.'}
            </p>
            <button type="button" onClick={handleSaveEvaluationRules} disabled={busy !== null || !rules.quiz_published} className={softButton}>
              {busy === 'evaluation' ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--unilabor-ink)]">Duración de la fase para la constancia (horas)</label>
            <div className="mt-1 flex gap-2">
              <input type="number" min={0.5} step={0.5} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={inputClass} />
              <button type="button" onClick={handleSaveDuration} disabled={busy !== null} className={softButton}>
                {busy === 'duration' ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm text-xs text-[var(--unilabor-ink)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">Responsable de la fase</p>
        <p className="mt-1 font-semibold">{rules.responsible_name ?? 'Sin capturar'}</p>
        <p className="text-[var(--unilabor-neutral)]">
          {rules.responsible_label}
          {rules.responsible_phone ? ` · WhatsApp ${rules.responsible_phone}` : ''}
        </p>
      </section>
    </div>
  );
};
