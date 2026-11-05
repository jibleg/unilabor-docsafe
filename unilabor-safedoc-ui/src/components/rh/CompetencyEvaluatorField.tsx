import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { getCompetencyProposedEvaluator, updateCompetencyEvaluation } from '../../api/service.api-rh-competency';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhCompetencyEvaluation } from '../../types/models';
import { notifyError, notifySuccess } from '../../utils/notify';
import { SearchableSelect } from '../SearchableSelect';
import { useEmployeeOptions } from './supervision/useEmployeeOptions';

interface CompetencyEvaluatorFieldProps {
  evaluation: RhCompetencyEvaluation;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}

const iconButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.12)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';

const EvaluatorEditor = ({ evaluation, onChanged, onClose }: CompetencyEvaluatorFieldProps & { onClose: () => void }) => {
  // Colaboradores activos; nunca el propio evaluado.
  const options = useEmployeeOptions().filter((option) => option.value !== String(evaluation.employee_id));
  const [selectedId, setSelectedId] = useState(evaluation.evaluator_employee_id ? String(evaluation.evaluator_employee_id) : '');
  const [proposedName, setProposedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getCompetencyProposedEvaluator(evaluation.id)
      .then((proposed) => {
        const candidate = proposed.evaluator;
        if (!alive || !candidate?.employee_id) return;
        setProposedName(candidate.name);
        // Sin evaluador elegido se propone al coordinador del área.
        setSelectedId((current) => current || String(candidate.employee_id));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [evaluation.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateCompetencyEvaluation(evaluation.id, { evaluator_employee_id: Number(selectedId) });
      notifySuccess('Evaluador actualizado.');
      onChanged(updated);
      onClose();
    } catch (error) {
      // Incluye la regla de la Fase 7: el supervisor de la Fase 6 del puesto no puede evaluar.
      notifyError(getApiErrorMessage(error, 'No se pudo cambiar el evaluador.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 max-w-md">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            value={selectedId}
            options={options}
            onChange={setSelectedId}
            placeholder="Elige al evaluador"
            searchPlaceholder="Buscar colaborador..."
            clearable={false}
          />
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={saving || !selectedId} className={iconButtonClass} title="Guardar evaluador" aria-label="Guardar evaluador">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className={iconButtonClass} title="Cancelar" aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-[var(--unilabor-neutral)]">
        {proposedName ? `Coordinador del área propuesto: ${proposedName}. ` : ''}
        {evaluation.evaluation_type === 'INICIAL' ? 'No puede ser quien supervisó la Fase 6 de este puesto.' : ''}
      </p>
    </div>
  );
};

/**
 * Evaluador del REH-REG-003 en la cabecera de la evaluación. En borrador se
 * puede cambiar (lista de colaboradores con buscador, proponiendo al
 * coordinador del área); una evaluación abierta automáticamente sin evaluador
 * lo pide aquí. Cerrada es de solo lectura.
 */
export const CompetencyEvaluatorField = ({ evaluation, onChanged }: CompetencyEvaluatorFieldProps) => {
  const [editing, setEditing] = useState(false);
  const editable = evaluation.status === 'DRAFT';
  const missing = !evaluation.evaluator_name.trim();

  if (editable && editing) {
    return <EvaluatorEditor evaluation={evaluation} onChanged={onChanged} onClose={() => setEditing(false)} />;
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--unilabor-neutral)]">
      <span className={missing ? 'font-semibold text-amber-700' : undefined}>Evaluador: {missing ? 'sin asignar' : evaluation.evaluator_name}</span>
      {editable ? (
        <button type="button" onClick={() => setEditing(true)} className={iconButtonClass} title={missing ? 'Asignar evaluador' : 'Cambiar evaluador'} aria-label={missing ? 'Asignar evaluador' : 'Cambiar evaluador'}>
          <Pencil size={13} />
        </button>
      ) : null}
    </p>
  );
};
