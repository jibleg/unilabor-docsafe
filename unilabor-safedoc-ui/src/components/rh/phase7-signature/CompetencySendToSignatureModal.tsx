import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { getCompetencySuggestedSigners, sendCompetencyToSignature } from '../../../api/service.api-rh-competency';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { RhCompetencyEvaluation } from '../../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { buttonClass, labelClass, primaryButtonClass } from '../supervision/supervision-ui';
import { useEmployeeOptions } from '../supervision/useEmployeeOptions';

interface CompetencySendToSignatureModalProps {
  evaluation: RhCompetencyEvaluation;
  onClose: () => void;
  onSent: (updated: RhCompetencyEvaluation) => void;
}

const idText = (value: number | null | undefined): string => (value ? String(value) : '');

/**
 * Envía el REH-REG-003 al Buzón de firmas: RH elige (o confirma los sugeridos)
 * coordinador del área, coordinador de RH y Director General. La evaluación
 * queda bloqueada y los cinco firman desde su propia sesión.
 */
export const CompetencySendToSignatureModal = ({ evaluation, onClose, onSent }: CompetencySendToSignatureModalProps) => {
  const [areaId, setAreaId] = useState(idText(evaluation.area_signatory_employee_id));
  const [rhId, setRhId] = useState(idText(evaluation.rh_signatory_employee_id));
  const [directorId, setDirectorId] = useState(idText(evaluation.director_signatory_employee_id));
  const [sending, setSending] = useState(false);
  const employeeOptions = useEmployeeOptions();
  // El evaluado nunca firma otro rol de su propio registro.
  const signerOptions = useMemo(() => employeeOptions.filter((option) => option.value !== String(evaluation.employee_id)), [employeeOptions, evaluation.employee_id]);

  useEffect(() => {
    getCompetencySuggestedSigners(evaluation.id)
      .then((suggested) => {
        setAreaId((current) => current || idText(suggested.area_employee_id));
        setRhId((current) => current || idText(suggested.rh_employee_id));
        setDirectorId((current) => current || idText(suggested.director_employee_id));
      })
      .catch(() => undefined);
  }, [evaluation.id]);

  const submit = async () => {
    if (!areaId || !rhId || !directorId) return notifyWarning('Elige al coordinador del área, al coordinador de RH y al Director General.');
    setSending(true);
    try {
      const result = await sendCompetencyToSignature(evaluation.id, {
        area_employee_id: Number(areaId),
        rh_employee_id: Number(rhId),
        director_employee_id: Number(directorId),
      });
      notifySuccess(result.message);
      onSent(result.evaluation);
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo enviar la evaluación a firma.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">REH-REG-003 · {evaluation.employee_name}</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
              <Send size={18} /> Enviar a firma
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
            La evaluación queda bloqueada y llega al Buzón de firmas de los cinco firmantes, que firman en cualquier orden. Con la quinta firma se
            cierra sola: sella los resultados y archiva el PDF en el expediente. Para corregir algo después, cancela el envío.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={labelClass}>Colaborador evaluado</p>
              <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{evaluation.employee_name}</p>
            </div>
            <div>
              <p className={labelClass}>Evaluador técnico</p>
              <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{evaluation.evaluator_name || '—'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Coordinador del área</label>
              <SearchableSelect value={areaId} options={signerOptions} onChange={setAreaId} placeholder="Elige al coordinador" searchPlaceholder="Buscar colaborador..." />
            </div>
            <div>
              <label className={labelClass}>Coordinador de RH</label>
              <SearchableSelect value={rhId} options={signerOptions} onChange={setRhId} placeholder="Elige al coordinador de RH" searchPlaceholder="Buscar colaborador..." />
            </div>
            <div>
              <label className={labelClass}>Director General</label>
              <SearchableSelect value={directorId} options={signerOptions} onChange={setDirectorId} placeholder="Elige al director" searchPlaceholder="Buscar colaborador..." />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={sending} className={buttonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => void submit()} disabled={sending} className={primaryButtonClass}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar a firma
          </button>
        </div>
      </div>
    </div>
  );
};
