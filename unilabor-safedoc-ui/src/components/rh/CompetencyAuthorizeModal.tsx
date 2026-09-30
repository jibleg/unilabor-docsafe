import { useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { authorizeCompetencyEvaluation, type CompetencyAuthorizationDecision } from '../../api/service.api-rh-competency';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhCompetencyEvaluation } from '../../types/models';
import { DICTAMEN_UI } from '../../utils/competency';

interface CompetencyAuthorizeModalProps {
  evaluation: RhCompetencyEvaluation;
  onClose: () => void;
  onAuthorized: (updated: RhCompetencyEvaluation) => void;
}

const DECISIONS: Array<{ value: CompetencyAuthorizationDecision; label: string; hint: string; tone: string }> = [
  {
    value: 'AUTORIZADO',
    label: 'Autorizado',
    hint: 'El colaborador queda autorizado para las actividades del puesto. Vigencia de 12 meses y constancia de competencia.',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  {
    value: 'AUTORIZADO_CON_SEGUIMIENTO',
    label: 'Autorizado con seguimiento',
    hint: 'Autorizado, pero con el plan de acciones en seguimiento. Vigencia de 12 meses y constancia de competencia.',
    tone: 'border-sky-300 bg-sky-50 text-sky-800',
  },
  {
    value: 'NO_AUTORIZADO',
    label: 'No autorizado',
    hint: 'RH o Dirección General deciden no autorizar pese al dictamen. Sin vigencia ni constancia; queda registrado con la nota.',
    tone: 'border-rose-300 bg-rose-50 text-rose-800',
  },
];

/**
 * Autorización del REH-REG-003: paso propio posterior al cierre, ejecutado por
 * RH o Dirección General (sin firma autógrafa). Registra decisión, nota, quién y
 * cuándo; el backend regenera el registro en el expediente y emite la constancia.
 */
export const CompetencyAuthorizeModal = ({ evaluation, onClose, onAuthorized }: CompetencyAuthorizeModalProps) => {
  const [decision, setDecision] = useState<CompetencyAuthorizationDecision>('AUTORIZADO');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const dictamenUi = evaluation.results.dictamen ? DICTAMEN_UI[evaluation.results.dictamen] : null;

  const handleSubmit = async () => {
    if (decision === 'NO_AUTORIZADO' && !note.trim()) {
      toast.warning('Para "No autorizado" captura el motivo en la nota.');
      return;
    }
    setSaving(true);
    try {
      const result = await authorizeCompetencyEvaluation(evaluation.id, { decision, note: note.trim() || null });
      toast.success(result.message);
      onAuthorized(result.evaluation);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo registrar la autorización.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.35)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Autorizar evaluación de competencia">
      <div className="w-full max-w-xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">REH-REG-003 · Autorización</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{evaluation.employee_name}</h2>
            <p className="text-sm text-[var(--unilabor-neutral)]">
              {evaluation.position_name} · Resultado final {evaluation.results.final_pct ?? '—'}%{' '}
              {dictamenUi ? <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${dictamenUi.className}`}>{dictamenUi.label}</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.3)]" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">
          El dictamen ya está sellado. Esta acción registra la decisión de RH o Dirección General con tu usuario, fecha y hora; el registro se
          actualiza en el expediente y la versión del cierre queda en su historial.
        </p>

        <div className="space-y-2">
          {DECISIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                decision === option.value ? option.tone : 'border-[rgba(0,65,106,0.12)] bg-white hover:bg-[rgba(191,212,230,0.18)]'
              }`}
            >
              <input type="radio" name="competency-authorization" value={option.value} checked={decision === option.value} onChange={() => setDecision(option.value)} className="mt-1" />
              <span>
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="block text-xs opacity-80">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Nota {decision === 'NO_AUTORIZADO' ? '(obligatoria)' : '(opcional)'}
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Observación de la autorización (se imprime en el registro)"
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Registrar decisión
          </button>
        </div>
      </div>
    </div>
  );
};
