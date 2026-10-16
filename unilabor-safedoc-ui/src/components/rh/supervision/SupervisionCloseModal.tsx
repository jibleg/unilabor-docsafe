import { useState } from 'react';
import { FileCheck2, Loader2, X } from 'lucide-react';
import { closeSupervisionChecklist, type CloseSupervisionChecklistResult } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import type { SupervisionChecklist } from '../../../types/models';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { CONCLUSION_UI, formatPct, primaryButtonClass } from './supervision-ui';

interface SupervisionCloseModalProps {
  checklist: SupervisionChecklist;
  onClose: () => void;
  onClosed: (result: CloseSupervisionChecklistResult) => void;
}

/**
 * Cierre y firma de la lista ANA-REG-060: firmas digitales del supervisor y
 * del responsable del área (obligatorias), la del colaborador (opcional) y,
 * si la lista está ligada a la Fase 6, si es la lista FINAL que decide la fase.
 */
export const SupervisionCloseModal = ({ checklist, onClose, onClosed }: SupervisionCloseModalProps) => {
  const linked = checklist.enrollment_id !== null;
  const [isFinal, setIsFinal] = useState(linked);
  const [withEmployee, setWithEmployee] = useState(true);
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);
  const [areaSignature, setAreaSignature] = useState<string | null>(null);
  const [employeeSignature, setEmployeeSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const summary = checklist.summary;
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;

  const handleSubmit = async () => {
    if (!supervisorSignature || !areaSignature) {
      notifyWarning('Las firmas del supervisor y del responsable del área son obligatorias.');
      return;
    }
    setSaving(true);
    try {
      const result = await closeSupervisionChecklist(checklist.id, {
        supervisor_signature: supervisorSignature,
        area_responsible_signature: areaSignature,
        employee_signature: withEmployee ? employeeSignature : null,
        is_final: linked ? isFinal : false,
      });
      onClosed(result);
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la lista.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              {checklist.form_code} · {checklist.folio}
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Cerrar y firmar la lista</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">
              {checklist.employee_name} · {checklist.position_code} – {checklist.position_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Evaluados</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{summary.evaluated}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Conformes / No</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">
                {summary.compliant} / {summary.non_compliant}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Cumplimiento</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{formatPct(summary.compliance_pct)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Conclusión</p>
              {conclusion ? (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${conclusion.className}`}>{conclusion.label}</span>
              ) : (
                <span className="text-xs text-[var(--unilabor-neutral)]">—</span>
              )}
            </div>
          </div>

          {linked ? (
            <label className="flex items-start gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} className="mt-1" />
              <span>
                <span className="block font-semibold text-[var(--unilabor-ink)]">Lista final de la Fase 6 de este puesto</span>
                <span className="block text-xs leading-5 text-[var(--unilabor-neutral)]">
                  Al cerrarla, el porcentaje se registra como calificación de la práctica del puesto:{' '}
                  {summary.passed
                    ? 'acredita la Fase 6 (≥ 80 %), se emite su constancia y se abre el siguiente puesto o la Fase 7.'
                    : 'NO acredita (< 80 %); RH deberá programar una nueva supervisión.'}{' '}
                  Desmárcala si es una supervisión intermedia.
                </span>
              </span>
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <SignaturePad label={`Supervisor / Auditor · ${checklist.supervisor_name || 'sin nombre'}`} hint="Obligatoria" onChange={setSupervisorSignature} />
            <SignaturePad label={`Responsable del Área · ${checklist.area_responsible_name || 'sin nombre'}`} hint="Obligatoria" onChange={setAreaSignature} />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--unilabor-ink)]">
            <input type="checkbox" checked={withEmployee} onChange={(e) => setWithEmployee(e.target.checked)} />
            Recabar también la firma del colaborador supervisado (acuse; no forma parte del formato controlado)
          </label>
          {withEmployee ? <SignaturePad label={`Colaborador · ${checklist.employee_name}`} hint="Opcional" onChange={setEmployeeSignature} /> : null}
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Al confirmar, la lista queda sellada (no se puede editar), se genera el PDF con el diseño del ANA-REG-060 y se archiva en el expediente del
            colaborador.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={primaryButtonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
            Cerrar y firmar
          </button>
        </div>
      </div>
    </div>
  );
};
