import { CheckSquare, ListChecks, Loader2, Square, Trash2 } from 'lucide-react';
import type { RhInductionChecklistItem, RhInductionPhase } from '../../../types/models';
import { buttonClass, inputClass, rowClass, sectionTitleClass } from './styles';

interface InductionPhaseChecklistTabProps {
  phase: RhInductionPhase;
  items: RhInductionChecklistItem[];
  newText: string;
  saving: boolean;
  togglingAuto: boolean;
  onNewTextChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (checklistItemId: number) => void;
  onToggleAuto: () => void;
}

/** Pestaña "Checklist": contenidos de la fase + interruptor de marcado automático al aprobar. */
export const InductionPhaseChecklistTab = ({
  phase,
  items,
  newText,
  saving,
  togglingAuto,
  onNewTextChange,
  onAdd,
  onRemove,
  onToggleAuto,
}: InductionPhaseChecklistTabProps) => (
  <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
      <p className="max-w-md text-xs text-[var(--unilabor-neutral)]">
        {phase.auto_complete_checklist_on_pass
          ? 'Activo: al aprobar la evaluación se marcan todos los contenidos (autor: Recursos Humanos).'
          : 'Inactivo: el checklist de contenidos se marca a mano por inscrito (pestaña Inscripción de colaboradores).'}
      </p>
      <button
        type="button"
        onClick={onToggleAuto}
        disabled={togglingAuto}
        className={
          phase.auto_complete_checklist_on_pass
            ? 'inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60'
            : 'inline-flex items-center gap-2 rounded-xl border border-[rgba(191,212,230,0.8)] bg-white px-3 py-2 text-xs font-semibold text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.2)] disabled:opacity-60'
        }
        title="Al aprobar la evaluación de la fase, el sistema marca todos los contenidos del checklist"
      >
        {togglingAuto ? (
          <Loader2 size={14} className="animate-spin" />
        ) : phase.auto_complete_checklist_on_pass ? (
          <CheckSquare size={14} />
        ) : (
          <Square size={14} />
        )}
        Completar checklist al aprobar
      </button>
    </div>

    <div>
      <h3 className={sectionTitleClass}>
        <ListChecks size={14} />
        Checklist de contenidos ({items.length})
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className={rowClass}>
            <span className="text-[var(--unilabor-ink)]">{item.item_text}</span>
            <button type="button" onClick={() => onRemove(item.id)} className="text-rose-500 hover:text-rose-700" title="Quitar contenido">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
            Sin contenidos en el checklist todavía.
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={newText} onChange={(event) => onNewTextChange(event.target.value)} placeholder="Nuevo contenido del checklist" className={inputClass} />
        <button type="button" onClick={onAdd} disabled={saving} className={buttonClass}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Agregar'}
        </button>
      </div>
    </div>
  </div>
);
