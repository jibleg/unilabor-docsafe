import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Lock, Save, Trash2, X } from 'lucide-react';
import {
  closeAssignmentLetter,
  deleteAssignmentLetterDraft,
  getAssignmentLetterPdfUrl,
  updateAssignmentLetter,
} from '../../../api/service.api-rh-assignment-letter';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AssignmentLetter } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { SearchableSelect } from '../../SearchableSelect';
import { buttonClass, formatDateOnly, inputClass, labelClass, primaryButtonClass } from '../supervision/supervision-ui';
import { useEmployeeOptions } from '../supervision/useEmployeeOptions';
import { AuthorizationGroups } from './AuthorizationGroups';

interface AssignmentLetterEditorProps {
  letter: AssignmentLetter;
  onBack: () => void;
  onChanged: (letter: AssignmentLetter) => void;
  onDeleted: () => void;
}

/**
 * Carta de asignación de puesto REH-REG-008: autorizaciones Sí/No (prellenadas
 * con las del puesto; las generales activadas por defecto), "Otras", firmantes y
 * cierre con las firmas del colaborador, la Coordinación del área y el
 * Director General. Firmada queda de solo consulta.
 */
export const AssignmentLetterEditor = ({ letter, onBack, onChanged, onDeleted }: AssignmentLetterEditorProps) => {
  const readOnly = letter.status !== 'DRAFT';
  const [authorized, setAuthorized] = useState<Record<number, boolean>>({});
  const [letterDate, setLetterDate] = useState(letter.letter_date);
  const [other, setOther] = useState(letter.other_authorizations ?? '');
  const [areaName, setAreaName] = useState(letter.area_signatory_name);
  const [directorName, setDirectorName] = useState(letter.director_signatory_name);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'pdf' | 'delete' | null>(null);
  const [showClose, setShowClose] = useState(false);
  const employeeOptions = useEmployeeOptions();
  const signerOptions = useMemo(
    () => employeeOptions.filter((option) => option.value !== String(letter.employee_id)).map((option) => ({ ...option, value: option.label })),
    [employeeOptions, letter.employee_id],
  );

  useEffect(() => {
    setAuthorized(Object.fromEntries(letter.items.map((item) => [item.id, item.authorized])));
    setLetterDate(letter.letter_date);
    setOther(letter.other_authorizations ?? '');
    setAreaName(letter.area_signatory_name);
    setDirectorName(letter.director_signatory_name);
    setDirty(false);
  }, [letter]);

  const authorizedCount = Object.values(authorized).filter(Boolean).length;
  const mark = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  const save = async (silent = false): Promise<AssignmentLetter | null> => {
    setBusy('save');
    try {
      const updated = await updateAssignmentLetter(letter.id, {
        letter_date: letterDate,
        other_authorizations: other.trim() || null,
        area_signatory_name: areaName,
        director_signatory_name: directorName,
        items: letter.items.map((item) => ({ item_id: item.id, authorized: Boolean(authorized[item.id]) })),
      });
      setDirty(false);
      onChanged(updated);
      if (!silent) notifySuccess('Carta guardada.');
      return updated;
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la carta.'));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const openPdf = async () => {
    if (!readOnly && dirty && !(await save(true))) return;
    setBusy('pdf');
    try {
      window.open(await getAssignmentLetterPdfUrl(letter.id), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirmAction('Eliminar borrador', `Se eliminará el borrador ${letter.folio}. Una carta sin firmas no es evidencia.`, 'Eliminar', 'danger');
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteAssignmentLetterDraft(letter.id);
      notifySuccess('Borrador eliminado.');
      onDeleted();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el borrador.'));
    } finally {
      setBusy(null);
    }
  };

  const openClose = async () => {
    if (!areaName.trim() || !directorName.trim()) return notifyWarning('Elige a la Coordinación del área y al Director General.');
    if (dirty && !(await save(true))) return;
    setShowClose(true);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)] hover:underline">
            <ArrowLeft size={13} /> Cartas de asignación
          </button>
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
            {letter.employee_name} · {letter.position_code} {letter.position_name}
          </h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            {letter.folio} · {letter.area_name ?? 'Puesto sin área'} · {authorizedCount} autorizaciones
            {letter.competency_evaluation_id ? ` · REH-REG-003 #${letter.competency_evaluation_id}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <Lock size={12} /> Firmada {formatDateOnly(letter.closed_at)}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Borrador</span>
          )}
          <button type="button" onClick={() => void openPdf()} disabled={busy !== null} className={buttonClass}>
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
          </button>
          {!readOnly ? (
            <>
              <button type="button" onClick={() => void save()} disabled={!dirty || busy !== null} className={buttonClass}>
                {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button type="button" onClick={() => void remove()} disabled={busy !== null} className={`${buttonClass} text-rose-700`} title="Eliminar borrador">
                <Trash2 size={14} />
              </button>
              <button type="button" onClick={() => void openClose()} disabled={busy !== null} className={primaryButtonClass}>
                <Lock size={14} /> Firmar y cerrar
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4 md:grid-cols-3">
        <div>
          <label className={labelClass}>Fecha de la carta</label>
          <input type="date" value={letterDate} disabled={readOnly} onChange={(e) => mark(setLetterDate)(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Coordinación del área</label>
          <SearchableSelect value={areaName} options={signerOptions} onChange={mark(setAreaName)} placeholder="Elige al coordinador" searchPlaceholder="Buscar colaborador..." disabled={readOnly} />
        </div>
        <div>
          <label className={labelClass}>Director General</label>
          <SearchableSelect value={directorName} options={signerOptions} onChange={mark(setDirectorName)} placeholder="Elige al director" searchPlaceholder="Buscar colaborador..." disabled={readOnly} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--color-brand-700)]">
          Autorizaciones · {authorizedCount} en Sí de {letter.items.length}
        </h3>
        <AuthorizationGroups
          items={letter.items}
          isChecked={(id) => Boolean(authorized[id])}
          disabled={readOnly}
          onToggle={(id) => mark(setAuthorized)({ ...authorized, [id]: !authorized[id] })}
          onToggleGroup={(ids, value) => mark(setAuthorized)({ ...authorized, ...Object.fromEntries(ids.map((id) => [id, value])) })}
        />
        <div>
          <label className={labelClass}>82. Otras (especificar)</label>
          <input value={other} disabled={readOnly} onChange={(e) => mark(setOther)(e.target.value)} className={inputClass} placeholder="Otras autorizaciones del colaborador en este puesto" maxLength={500} />
        </div>
      </section>

      {showClose ? (
        <CloseLetterModal
          letter={{ ...letter, area_signatory_name: areaName, director_signatory_name: directorName }}
          onClose={() => setShowClose(false)}
          onClosed={(updated) => {
            setShowClose(false);
            onChanged(updated);
          }}
        />
      ) : null}
    </div>
  );
};

const CloseLetterModal = ({ letter, onClose, onClosed }: { letter: AssignmentLetter; onClose: () => void; onClosed: (letter: AssignmentLetter) => void }) => {
  const [signatures, setSignatures] = useState<{ collaborator: string | null; area: string | null; director: string | null }>({
    collaborator: null,
    area: null,
    director: null,
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof signatures) => (value: string | null) => setSignatures((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!signatures.collaborator || !signatures.area || !signatures.director) return notifyWarning('Las tres firmas son obligatorias.');
    setSaving(true);
    try {
      const result = await closeAssignmentLetter(letter.id, {
        collaborator_signature: signatures.collaborator,
        area_signature: signatures.area,
        director_signature: signatures.director,
      });
      notifySuccess(result.message);
      onClosed(result.letter);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la carta.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">REH-REG-008 · {letter.folio}</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Firmar la carta de asignación</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">
              {letter.employee_name} · {letter.position_code} {letter.position_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <SignaturePad label={`Colaborador · ${letter.employee_name}`} hint="Confirma que recibió y comprendió la descripción de puesto" onChange={set('collaborator')} />
          <div className="grid gap-4 md:grid-cols-2">
            <SignaturePad label={`Coordinación del área · ${letter.area_signatory_name}`} hint="Obligatoria" onChange={set('area')} />
            <SignaturePad label={`Director General · ${letter.director_signatory_name}`} hint="Obligatoria" onChange={set('director')} />
          </div>
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Al confirmar, la carta queda sellada, se genera el PDF con el diseño del REH-REG-008 y se archiva en el expediente del colaborador
            (Documentos UNILABOR).
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
            Cancelar
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving} className={primaryButtonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Firmar y cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
