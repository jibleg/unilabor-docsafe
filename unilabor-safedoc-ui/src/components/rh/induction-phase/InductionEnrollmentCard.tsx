import { BookOpen, CheckSquare, ListChecks, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { RhInductionChecklistProgressItem, RhInductionPhaseEnrollmentSummary } from '../../../types/models';
import { SearchableSelect, type SearchableOption } from '../../SearchableSelect';

const formatPercentage = (item: RhInductionPhaseEnrollmentSummary): string =>
  item.evaluation_percentage === null ? 'Sin evaluación' : `${item.evaluation_percentage}%`;

// Solo estos estados admiten "Autorizar nuevo intento" (politica: intento unico,
// RH reabre tras retroalimentacion). El backend valida lo mismo.
const RETRYABLE_EVALUATION_STATUSES = ['failed', 'expired'];

const canAuthorizeRetry = (item: RhInductionPhaseEnrollmentSummary): boolean =>
  item.evaluation_status !== null && RETRYABLE_EVALUATION_STATUSES.includes(item.evaluation_status);

// "Reabrir lectura": lectura incompleta con documentos asignados y sin un
// cuestionario en curso: sin examen, o examen abierto por vencimiento que nadie
// inicio (pending, o expired si ademas se agoto su ventana). El backend
// verifica que siga sin iniciar ni contestar.
const REOPENABLE_EVALUATION_STATUSES: Array<string | null> = [null, 'pending', 'expired'];

const canReopenReading = (item: RhInductionPhaseEnrollmentSummary): boolean =>
  item.reading_total > 0 && !item.reading_completed_at && REOPENABLE_EVALUATION_STATUSES.includes(item.evaluation_status);

// "Reabrir firmas pendientes": aprobo la fase sin terminar de firmar (el examen
// se abrio por vencimiento). Solo se reactivan los acuses sin firmar.
const hasPendingSignatures = (item: RhInductionPhaseEnrollmentSummary): boolean =>
  item.evaluation_status === 'passed' && item.reading_total > item.reading_signed;

const isReadingExpired = (item: RhInductionPhaseEnrollmentSummary): boolean =>
  Boolean(item.reading_deadline_at) && new Date(item.reading_deadline_at as string) < new Date();

interface InductionEnrollmentCardProps {
  item: RhInductionPhaseEnrollmentSummary;
  employeeOptions: SearchableOption[];
  editingSupervisor: boolean;
  supervisorSelection: string;
  expanded: boolean;
  loadingChecklist: boolean;
  checklistProgress: RhInductionChecklistProgressItem[];
  onSupervisorSelectionChange: (value: string) => void;
  onStartEditSupervisor: () => void;
  onSaveSupervisor: () => void;
  onToggleExpand: () => void;
  onToggleChecklistItem: (checklistItemId: number, completed: boolean) => void;
  onCompleteData: () => void;
  onReopenReading: () => void;
  onAuthorizeRetry: () => void;
  onRemove: () => void;
}

/** Tarjeta de un inscrito en la fase: avance de lectura/evaluación, supervisor, checklist y acciones. */
export const InductionEnrollmentCard = ({
  item,
  employeeOptions,
  editingSupervisor,
  supervisorSelection,
  expanded,
  loadingChecklist,
  checklistProgress,
  onSupervisorSelectionChange,
  onStartEditSupervisor,
  onSaveSupervisor,
  onToggleExpand,
  onToggleChecklistItem,
  onCompleteData,
  onReopenReading,
  onAuthorizeRetry,
  onRemove,
}: InductionEnrollmentCardProps) => {
  const readingExpired = isReadingExpired(item);
  return (
    <div className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-[var(--color-brand-700)]">{item.employee_name}</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            {item.employee_code}
            {item.position_code ? (
              <>
                {' · '}
                <span className="rounded bg-slate-100 px-1 font-mono text-[10px]">
                  {item.position_sequence ? `${item.position_sequence}. ` : ''}
                  {item.position_code}
                </span>
                {item.queue_status === 'QUEUED' ? <span className="ml-1 font-semibold text-slate-500">· en cola</span> : null}
              </>
            ) : null}
          </p>
          {item.missing_branch || item.missing_position ? (
            <button
              type="button"
              onClick={onCompleteData}
              title="Capturar los datos faltantes de la constancia sin salir de esta pantalla"
              className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-700"
            >
              <span className="rounded-full bg-amber-50 px-2 py-0.5 ring-1 ring-amber-200">
                Constancia: falta{' '}
                {[item.missing_branch ? 'sucursal' : null, item.missing_position ? 'puesto' : null].filter(Boolean).join(' y ')}
              </span>
              <span className="underline underline-offset-2">Completar datos</span>
            </button>
          ) : null}
        </div>
        <div className="text-right text-xs text-[var(--unilabor-neutral)]">
          <p>
            Lectura: {item.reading_signed}/{item.reading_total}
          </p>
          {item.reading_deadline_at && !item.reading_completed_at ? (
            <p className={readingExpired ? 'text-rose-500' : ''}>
              {readingExpired ? 'Lectura vencida: ' : 'Lectura vence: '}
              {new Date(item.reading_deadline_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          ) : null}
          <p>
            Evaluación: {item.evaluation_status ?? 'Pendiente'} ({formatPercentage(item)})
            {item.evaluation_attempt_no && item.evaluation_attempt_no > 1 ? ` · intento #${item.evaluation_attempt_no}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,65,106,0.08)] pt-2 text-xs">
        {editingSupervisor ? (
          <div className="flex flex-1 items-center gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={supervisorSelection}
                onChange={onSupervisorSelectionChange}
                options={employeeOptions}
                placeholder="Supervisor..."
                emptyLabel="Sin supervisor"
                searchPlaceholder="Buscar por nombre o código..."
              />
            </div>
            <button type="button" onClick={onSaveSupervisor} className="font-semibold text-[var(--color-brand-700)] underline">
              Guardar
            </button>
          </div>
        ) : (
          <button type="button" onClick={onStartEditSupervisor} className="text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]">
            Supervisor: <span className="font-semibold">{item.supervisor_name ?? 'No asignado'}</span>
          </button>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
          >
            <ListChecks size={12} />
            Checklist: {item.checklist_completed}/{item.checklist_total}
          </button>
          {hasPendingSignatures(item) ? (
            <button
              type="button"
              onClick={onReopenReading}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              title="Aprobó la fase con documentos sin firmar: reabrirlos para que los lea y firme (evidencia para la acreditación)"
            >
              <BookOpen size={12} />
              Reabrir firmas pendientes ({item.reading_total - item.reading_signed})
            </button>
          ) : null}
          {canReopenReading(item) ? (
            <button
              type="button"
              onClick={onReopenReading}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 transition ${
                readingExpired ? 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100' : 'bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100'
              }`}
              title={
                readingExpired
                  ? 'El plazo de lectura venció: dar horas adicionales para terminar de leer antes del cuestionario'
                  : 'Ampliar el plazo de lectura de este colaborador'
              }
            >
              <BookOpen size={12} />
              {readingExpired ? 'Reabrir lectura' : 'Ampliar lectura'}
            </button>
          ) : null}
          {canAuthorizeRetry(item) ? (
            <button
              type="button"
              onClick={onAuthorizeRetry}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              title="Abrir un nuevo intento del cuestionario tras la retroalimentación"
            >
              <RotateCcw size={12} />
              Autorizar nuevo intento
            </button>
          ) : null}
          {/* Ruta por puesto: la inscripción no se elimina; se retira dando de baja el puesto. */}
          {item.position_code ? null : (
            <button
              type="button"
              onClick={onRemove}
              className="text-rose-500 transition hover:text-rose-700"
              title="Eliminar inscripción (solo si la fase no está aprobada)"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-1 rounded-lg bg-white/80 p-2">
          {loadingChecklist ? (
            <p className="text-xs text-[var(--unilabor-neutral)]">Cargando...</p>
          ) : (
            checklistProgress.map((progressItem) => (
              <button
                type="button"
                key={progressItem.checklist_item_id}
                onClick={() => onToggleChecklistItem(progressItem.checklist_item_id, !progressItem.completed_at)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.2)]"
              >
                {progressItem.completed_at ? (
                  <CheckSquare size={13} className="text-emerald-600" />
                ) : (
                  <Square size={13} className="text-[var(--unilabor-neutral)]" />
                )}
                {progressItem.item_text}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
