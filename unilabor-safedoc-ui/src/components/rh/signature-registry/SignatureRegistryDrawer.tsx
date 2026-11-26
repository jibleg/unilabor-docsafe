import { useEffect, useState } from 'react';
import { FileText, Loader2, Save, Wand2 } from 'lucide-react';
import { proposeSigningScope, saveSignatureAuthorization } from '../../../api/service.api-rh-signature-registry';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { RhDiscipline, SignatureAuthorizationPayload, SignatureRegistryRow } from '../../../types/models';
import { formatDateOnly } from '../../../utils/competency';
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../../../utils/notify';
import { STATUS_TONE_CLASS } from '../../../utils/signatureRegistry';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';
import { SpecimenField } from './SpecimenField';

interface SignatureRegistryDrawerProps {
  row: SignatureRegistryRow | null;
  disciplines: RhDiscipline[];
  onClose: () => void;
  /** Se llama tras guardar o cambiar un espécimen, para refrescar el registro. */
  onChanged: () => void;
}

const INPUT =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:opacity-60';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const ACTION =
  'inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';

const draftOf = (row: SignatureRegistryRow): SignatureAuthorizationPayload => ({
  discipline_id: row.discipline_id,
  is_discipline_responsible: row.is_discipline_responsible,
  signing_scope_text: row.signing_scope_text,
  notes: row.notes,
});

/**
 * Fila del REH-REG-027: lo que SafeDoc ya sabe (puesto, carta, evaluación,
 * estado) de solo lectura; captura de disciplina, responsable, alcance (con la
 * propuesta desde la carta REH-REG-008) y notas; y los especímenes de firma y
 * rúbrica. Las filas históricas solo se consultan.
 */
interface DraftState {
  /** Fila a la que pertenece la captura (`empleado:puesto`). */
  key: string | null;
  draft: SignatureAuthorizationPayload | null;
}

export const SignatureRegistryDrawer = ({ row, disciplines, onClose, onChanged }: SignatureRegistryDrawerProps) => {
  const [draftState, setDraftState] = useState<DraftState>({ key: null, draft: null });
  const [saving, setSaving] = useState(false);
  const [proposing, setProposing] = useState(false);
  const rowKey = row ? `${row.employee_id}:${row.position_id}` : null;

  // Estado derivado de la fila abierta: al cambiar de fila se reinicia la captura (sin efecto).
  if (draftState.key !== rowKey) setDraftState({ key: rowKey, draft: row ? draftOf(row) : null });
  const draft = draftState.key === rowKey ? draftState.draft : null;
  const setDraft = (next: SignatureAuthorizationPayload) => setDraftState({ key: rowKey, draft: next });

  const propose = async (target: SignatureRegistryRow, silentWhenEmpty: boolean) => {
    const targetKey = `${target.employee_id}:${target.position_id}`;
    setProposing(true);
    try {
      const proposal = await proposeSigningScope(target.employee_id, target.position_id);
      if (!proposal.text) {
        if (!silentWhenEmpty) notifyWarning(proposal.letter_folio ? `La carta ${proposal.letter_folio} no autoriza actividades que dejen firma.` : 'El puesto aún no tiene carta REH-REG-008.');
        return;
      }
      // Solo se aplica si la fila sigue abierta (la propuesta llega en diferido).
      setDraftState((state) => (state.key === targetKey && state.draft ? { ...state, draft: { ...state.draft, signing_scope_text: proposal.text } } : state));
      notifyInfo(`Alcance propuesto desde ${proposal.letter_folio ?? 'la carta REH-REG-008'}${proposal.letter_status === 'DRAFT' ? ' (en borrador)' : ''}. Revísalo y guarda.`);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo proponer el alcance desde la carta.'));
    } finally {
      setProposing(false);
    }
  };

  // Al abrir una fila vigente sin alcance, se propone solo desde la carta.
  useEffect(() => {
    if (row && !row.retired && !row.signing_scope_text) void propose(row, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  const save = async () => {
    if (!row || !draft) return;
    setSaving(true);
    try {
      notifySuccess(await saveSignatureAuthorization(row.employee_id, row.position_id, { ...draft, signing_scope_text: draft.signing_scope_text?.trim() || null, notes: draft.notes?.trim() || null }));
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la fila del registro.'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(row?.retired);
  const fact = (label: string, value: string, hint?: string) => (
    <div>
      <span className={LABEL}>{label}</span>
      <span className="text-sm text-[var(--unilabor-ink)]" title={hint}>
        {value || '—'}
      </span>
    </div>
  );

  return (
    <DrawerShell open={row !== null} onClose={onClose} busy={saving} title={row?.full_name ?? ''} subtitle={row ? `REH-REG-027 · ${row.position_name} · ${row.branch_name ?? ''}` : undefined} widthClass="max-w-2xl">
      {row && draft ? (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.95)] p-3">
            {fact('Fecha de alta', row.start_date ? formatDateOnly(row.start_date) : 'Sin carta REH-REG-008 cerrada', row.letter_folio ?? undefined)}
            {fact('Última evaluación (REH-REG-003)', row.last_evaluation_date ? formatDateOnly(row.last_evaluation_date) : '', row.valid_until ? `Vigente hasta ${formatDateOnly(row.valid_until)}` : undefined)}
            {fact(row.end_or_change_kind === 'CAMBIO_ALCANCE' ? 'Cambio de alcance' : 'Fecha de baja', row.end_or_change_date ? formatDateOnly(row.end_or_change_date) : '')}
            <div>
              <span className={LABEL}>Estado</span>
              <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE_CLASS[row.status_tone]}`}>{row.status_label}</span>
              {row.missing.length > 0 ? <span className="mt-1 block text-[11px] text-rose-700">Falta: {row.missing.join(', ')}.</span> : null}
              {row.days_remaining !== null && row.status !== 'DADA_DE_BAJA' ? <span className="mt-1 block text-[11px] text-[var(--unilabor-neutral)]">{row.days_remaining} días de vigencia</span> : null}
            </div>
            {row.retired ? (
              <p className="col-span-2 text-[11px] text-[var(--unilabor-neutral)]">
                Fila histórica ({row.employee_active ? 'puesto terminado' : 'colaborador dado de baja'}): se conserva para la trazabilidad de lo que firmó; no se edita.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <label>
                <span className={LABEL}>Disciplina o área</span>
                <select
                  value={draft.discipline_id ?? ''}
                  onChange={(event) => setDraft({ ...draft, discipline_id: event.target.value ? Number(event.target.value) : null })}
                  disabled={readOnly}
                  className={INPUT}
                >
                  <option value="">— Sin asignar —</option>
                  {disciplines
                    .filter((discipline) => discipline.is_active || discipline.id === draft.discipline_id)
                    .map((discipline) => (
                      <option key={discipline.id} value={discipline.id}>
                        {discipline.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className={`inline-flex items-center gap-2 pb-2 text-sm font-semibold text-[var(--color-brand-700)] ${readOnly ? 'opacity-60' : 'cursor-pointer'}`} title="¿Es responsable de la disciplina?">
                <span className={`relative h-5 w-9 rounded-full transition ${draft.is_discipline_responsible ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={draft.is_discipline_responsible}
                    disabled={readOnly}
                    onChange={(event) => setDraft({ ...draft, is_discipline_responsible: event.target.checked })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Responsable de disciplina"
                  />
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${draft.is_discipline_responsible ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
                Responsable
              </label>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`${LABEL} mb-0`}>Actividades y documentos que está autorizada a firmar</span>
                {readOnly ? null : (
                  <button type="button" onClick={() => void propose(row, false)} disabled={proposing || saving} title="Proponer el texto con los Sí de la carta REH-REG-008 del puesto (sustituye lo escrito; no guarda)" className={ACTION}>
                    {proposing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Proponer desde la carta
                  </button>
                )}
              </div>
              <textarea
                value={draft.signing_scope_text ?? ''}
                onChange={(event) => setDraft({ ...draft, signing_scope_text: event.target.value })}
                rows={5}
                maxLength={2000}
                disabled={readOnly}
                placeholder="Qué firma, no el puesto: p. ej. validación técnica y liberación de resultados de química clínica; informes de resultados."
                className={`${INPUT} resize-none`}
              />
            </div>

            <label className="block">
              <span className={LABEL}>Notas</span>
              <textarea value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} maxLength={1000} disabled={readOnly} className={`${INPUT} resize-none`} />
            </label>

            {readOnly ? null : (
              <div className="flex justify-end">
                <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                </button>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-brand-700)]">
              <FileText size={14} /> Especímenes
            </h3>
            <SpecimenField employeeId={row.employee_id} kind="FIRMA" specimen={row.signature_specimen} readOnly={readOnly} onChanged={onChanged} />
            <SpecimenField employeeId={row.employee_id} kind="RUBRICA" specimen={row.initials_specimen} readOnly={readOnly} onChanged={onChanged} />
            <p className="text-[11px] text-[var(--unilabor-neutral)]">Los especímenes son del colaborador: valen para todas sus filas. Cargar uno nuevo retira el anterior; nada se borra.</p>
          </section>
        </div>
      ) : null}
    </DrawerShell>
  );
};
