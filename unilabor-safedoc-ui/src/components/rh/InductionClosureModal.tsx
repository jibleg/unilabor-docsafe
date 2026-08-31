import { useState } from 'react';
import { FileCheck2, Loader2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { closeInductionRecord } from '../../api/service.api-rh-induction';
import { getApiErrorMessage } from '../../api/service.parsers';
import { SignaturePad } from '../helpdesk/SignaturePad';
import type { RhInductionMasterRecord } from '../../types/models';

interface InductionClosureModalProps {
  record: RhInductionMasterRecord;
  /** true = re-cierre correctivo del registro ya cerrado (genera nueva version). */
  supersede?: boolean;
  onClose: () => void;
  onClosed: () => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

/**
 * Cierre formal del Formato de Induccion (REH-REG-005): dictamen + 3 firmas
 * digitales. El gate del dictamen positivo lo re-valida el backend; aqui solo
 * se ofrece "Aprobada" cuando las fases institucionales estan completas.
 */
export const InductionClosureModal = ({ record, supersede = false, onClose, onClosed }: InductionClosureModalProps) => {
  const fullApprove = record.summary.verdict === 'COMPLETA_7_FASES';
  const canApprove = fullApprove || record.summary.verdict === 'COMPLETA_1_A_4';
  const [verdict, setVerdict] = useState<'APROBADA' | 'NO_APROBADA'>(canApprove ? 'APROBADA' : 'NO_APROBADA');
  const [closingNotes, setClosingNotes] = useState('');
  const [rhName, setRhName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [collaboratorSignature, setCollaboratorSignature] = useState<string | null>(null);
  const [rhSignature, setRhSignature] = useState<string | null>(null);
  const [areaSignature, setAreaSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (verdict === 'NO_APROBADA' && !closingNotes.trim()) {
      toast.warning('El cierre como no aprobada requiere el motivo.');
      return;
    }
    if (!rhName.trim() || !areaName.trim()) {
      toast.warning('Captura el nombre de los firmantes de RH y del coordinador del área.');
      return;
    }
    if (!collaboratorSignature || !rhSignature || !areaSignature) {
      toast.warning('Las tres firmas son obligatorias.');
      return;
    }
    setSaving(true);
    try {
      await closeInductionRecord(record.employee.id, {
        verdict,
        closing_notes: closingNotes.trim() || null,
        collaborator_signature: collaboratorSignature,
        rh_signature: rhSignature,
        area_signature: areaSignature,
        rh_signatory_name: rhName.trim(),
        area_signatory_name: areaName.trim(),
        supersede,
      });
      toast.success('Formato de Inducción cerrado y archivado en el expediente.');
      onClosed();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cerrar el Formato de Inducción.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              REH-REG-005 · {record.employee.full_name}
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
              <FileCheck2 size={18} />
              {supersede ? 'Corregir cierre del Formato de Inducción' : 'Cerrar Formato de Inducción'}
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este cierre genera el registro definitivo y lo archiva en el expediente del colaborador (sección
            Programa de Inducción). No se puede borrar; una corrección genera una nueva versión.
          </div>

          <div>
            <label className={labelClass}>Dictamen</label>
            <select
              value={verdict}
              onChange={(event) => setVerdict(event.target.value as 'APROBADA' | 'NO_APROBADA')}
              className={inputClass}
            >
              {canApprove && (
                <option value="APROBADA">
                  {fullApprove ? 'Aprobada — Inducción completa (7 fases)' : 'Aprobada — Inducción institucional (Fases 1-4)'}
                </option>
              )}
              <option value="NO_APROBADA">No aprobada — Inducción no superada</option>
            </select>
            {!canApprove && (
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
                El cierre como aprobada estará disponible cuando las fases institucionales (1-4) estén todas
                aprobadas.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              {verdict === 'NO_APROBADA' ? 'Motivo del cierre (obligatorio)' : 'Notas del cierre (opcional)'}
            </label>
            <textarea
              value={closingNotes}
              onChange={(event) => setClosingNotes(event.target.value)}
              rows={2}
              placeholder={
                verdict === 'NO_APROBADA'
                  ? 'Ej. No acreditó la Fase 2 tras la segunda evaluación; se da por terminado el proceso.'
                  : 'Observaciones del cierre...'
              }
              className={inputClass}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Firmante — Coordinación de RH</label>
              <input
                value={rhName}
                onChange={(event) => setRhName(event.target.value)}
                placeholder="Nombre completo"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Firmante — Coordinador del área</label>
              <input
                value={areaName}
                onChange={(event) => setAreaName(event.target.value)}
                placeholder="Nombre completo"
                className={inputClass}
              />
            </div>
          </div>

          <SignaturePad
            label={`Firma del colaborador — ${record.employee.full_name}`}
            onChange={setCollaboratorSignature}
          />
          <SignaturePad label="Firma — Coordinación de Recursos Humanos" onChange={setRhSignature} />
          <SignaturePad label="Firma — Coordinador del área" onChange={setAreaSignature} />
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
            Cerrar y archivar
          </button>
        </div>
      </div>
    </div>
  );
};
