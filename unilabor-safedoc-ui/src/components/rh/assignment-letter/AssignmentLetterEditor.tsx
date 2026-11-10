import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Lock, PenLine, Save, Send, Trash2 } from 'lucide-react';
import {
  cancelLetterSignature,
  deleteAssignmentLetterDraft,
  getAssignmentLetterPdfUrl,
  getLetterSigners,
  sendLetterToSignature,
  updateAssignmentLetter,
} from '../../../api/service.api-rh-assignment-letter';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AssignmentLetter } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { DocumentInSignatureCard } from '../phase7-signature/DocumentInSignatureCard';
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
 * con las del puesto; las generales activadas por defecto), "Otras" y
 * firmantes. "Enviar a firma" la bloquea y la manda al Buzón de firmas del
 * colaborador, la Coordinación del área y el Director General; con la tercera
 * firma se cierra sola. Firmada queda de solo consulta.
 */
export const AssignmentLetterEditor = ({ letter, onBack, onChanged, onDeleted }: AssignmentLetterEditorProps) => {
  const closed = letter.status !== 'DRAFT';
  // En firma queda bloqueada igual que firmada (para corregir, RH cancela el envío).
  const readOnly = closed || letter.in_signature;
  const [authorized, setAuthorized] = useState<Record<number, boolean>>({});
  const [letterDate, setLetterDate] = useState(letter.letter_date);
  const [other, setOther] = useState(letter.other_authorizations ?? '');
  const [areaId, setAreaId] = useState(letter.area_signatory_employee_id ? String(letter.area_signatory_employee_id) : '');
  const [directorId, setDirectorId] = useState(letter.director_signatory_employee_id ? String(letter.director_signatory_employee_id) : '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'pdf' | 'delete' | 'send' | null>(null);
  const employeeOptions = useEmployeeOptions();
  // El colaborador nunca firma otro rol de su propia carta.
  const signerOptions = useMemo(() => employeeOptions.filter((option) => option.value !== String(letter.employee_id)), [employeeOptions, letter.employee_id]);
  const loadSigners = useCallback(() => getLetterSigners(letter.id), [letter.id]);

  useEffect(() => {
    setAuthorized(Object.fromEntries(letter.items.map((item) => [item.id, item.authorized])));
    setLetterDate(letter.letter_date);
    setOther(letter.other_authorizations ?? '');
    setAreaId(letter.area_signatory_employee_id ? String(letter.area_signatory_employee_id) : '');
    setDirectorId(letter.director_signatory_employee_id ? String(letter.director_signatory_employee_id) : '');
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
        area_signatory_employee_id: areaId ? Number(areaId) : undefined,
        director_signatory_employee_id: directorId ? Number(directorId) : undefined,
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

  const sendToSignature = async () => {
    if (!areaId || !directorId) return notifyWarning('Elige a la Coordinación del área y al Director General.');
    if (dirty && !(await save(true))) return;
    const ok = await confirmAction(
      'Enviar a firma',
      `La carta ${letter.folio} queda bloqueada y llega al Buzón de firmas del colaborador, la Coordinación del área y el Director General. Con la tercera firma se cierra sola y se archiva en el expediente.`,
      'Enviar a firma',
      'primary',
    );
    if (!ok) return;
    setBusy('send');
    try {
      const result = await sendLetterToSignature(letter.id);
      notifySuccess(result.message);
      onChanged(result.letter);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo enviar la carta a firma.'));
    } finally {
      setBusy(null);
    }
  };

  const openPdfOnly = async () => {
    try {
      window.open(await getAssignmentLetterPdfUrl(letter.id), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    }
  };

  const cancelSignature = async () => {
    try {
      const result = await cancelLetterSignature(letter.id);
      notifySuccess(result.message);
      onChanged(result.letter);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cancelar el envío a firma.'));
    }
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
          {closed ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <Lock size={12} /> Firmada {formatDateOnly(letter.closed_at)}
            </span>
          ) : letter.in_signature ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
              <PenLine size={12} /> En firma
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
              <button type="button" onClick={() => void sendToSignature()} disabled={busy !== null} className={primaryButtonClass} title="Bloquear y mandar al Buzón de firmas">
                {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar a firma
              </button>
            </>
          ) : null}
        </div>
      </header>

      {letter.in_signature ? (
        <DocumentInSignatureCard
          formCode="REH-REG-008"
          requestedAt={letter.signature_requested_at}
          requestedByName={letter.signature_requested_by_name}
          loadSigners={loadSigners}
          onOpenPdf={openPdfOnly}
          onCancel={cancelSignature}
        />
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4 md:grid-cols-3">
        <div>
          <label className={labelClass}>Fecha de la carta</label>
          <input type="date" value={letterDate} disabled={readOnly} onChange={(e) => mark(setLetterDate)(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Coordinación del área</label>
          {readOnly ? (
            <p className="py-2 text-sm font-semibold text-[var(--unilabor-ink)]">{letter.area_signatory_name || '—'}</p>
          ) : (
            <SearchableSelect value={areaId} options={signerOptions} onChange={mark(setAreaId)} placeholder="Elige al coordinador" searchPlaceholder="Buscar colaborador..." />
          )}
        </div>
        <div>
          <label className={labelClass}>Director General</label>
          {readOnly ? (
            <p className="py-2 text-sm font-semibold text-[var(--unilabor-ink)]">{letter.director_signatory_name || '—'}</p>
          ) : (
            <SearchableSelect value={directorId} options={signerOptions} onChange={mark(setDirectorId)} placeholder="Elige al director" searchPlaceholder="Buscar colaborador..." />
          )}
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

    </div>
  );
};
