import { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { sendSupervisionToSignature, type SupervisionSignatureResult } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklist } from '../../../types/models';
import { notifyError } from '../../../utils/notify';
import { SupervisionSignatureProgress } from './SupervisionSignatureProgress';
import { CONCLUSION_UI, formatPct, primaryButtonClass, signerIssue } from './supervision-ui';

interface SupervisionCloseModalProps {
  checklist: SupervisionChecklist;
  onClose: () => void;
  onSent: (result: SupervisionSignatureResult) => void;
}

/**
 * "Cerrar y firmar" ya no recaba firmas en pantalla: confirma el ENVÍO A FIRMA.
 * Muestra el resultado, los tres firmantes (y si pueden firmar en su Buzón) y,
 * si la lista está ligada a la Fase 6, la decisión de si es la lista FINAL del
 * puesto. La lista queda bloqueada y se cierra sola al reunirse las tres firmas.
 */
export const SupervisionCloseModal = ({ checklist, onClose, onSent }: SupervisionCloseModalProps) => {
  const linked = checklist.enrollment_id !== null;
  const [isFinal, setIsFinal] = useState(linked);
  const [saving, setSaving] = useState(false);
  const summary = checklist.summary;
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;
  const blocked = checklist.signers.some((signer) => signerIssue(signer) !== null);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      onSent(await sendSupervisionToSignature(checklist.id, linked ? isFinal : false));
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo enviar la lista a firma.'));
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
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Enviar a firma</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">
              {checklist.employee_name} · {checklist.position_code} – {checklist.position_name}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" title="Cerrar" aria-label="Cerrar">
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

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Firman desde su Buzón de firmas</p>
            <SupervisionSignatureProgress signers={checklist.signers} inSignature={false} />
            {blocked ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                No se puede enviar todavía: los tres firmantes deben estar asignados, activos y con usuario de sistema vinculado.{' '}
                {linked
                  ? 'El supervisor se asigna en Pendientes Fase 6 y el responsable en Firmantes por área; el usuario se vincula en el expediente del colaborador.'
                  : 'Elige al supervisor y al responsable en la lista; el usuario se vincula en el expediente del colaborador.'}
              </p>
            ) : null}
          </div>

          {linked ? (
            <label className="flex items-start gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} className="mt-1" />
              <span>
                <span className="block font-semibold text-[var(--unilabor-ink)]">Lista final de la Fase 6 de este puesto</span>
                <span className="block text-xs leading-5 text-[var(--unilabor-neutral)]">
                  Al cerrarse, el porcentaje se registra como calificación de la práctica del puesto:{' '}
                  {summary.passed
                    ? 'acredita la Fase 6 (≥ 80 %), se emite su constancia y se activa el siguiente puesto de su ruta.'
                    : 'NO acredita (< 80 %); RH deberá programar una nueva supervisión.'}{' '}
                  Desmárcala si es una supervisión intermedia.
                </span>
              </span>
            </label>
          ) : null}

          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Al enviarla, la lista queda bloqueada (no se pueden cambiar resultados ni cabecera) y aparece en el Buzón de firmas de los tres, que firman
            en cualquier orden. Con la tercera firma se cierra sola: se genera el PDF con el diseño del ANA-REG-060 y se archiva en el expediente del
            colaborador. Mientras no esté cerrada puedes cancelar el envío para corregirla.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || blocked} className={primaryButtonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar a firma
          </button>
        </div>
      </div>
    </div>
  );
};
