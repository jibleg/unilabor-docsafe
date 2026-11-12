import { useEffect, useState } from 'react';
import { FileText, Loader2, PenLine } from 'lucide-react';
import { getSignatureInboxPdfUrl, getSupervisionInboxDetail, signFromInbox } from '../../../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SignatureInboxEntry, SignatureInboxSignOutcome, SupervisionInboxDetail } from '../../../types/models';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { SupervisionSignatureProgress } from './SupervisionSignatureProgress';
import { CONCLUSION_UI, buttonClass, describeSignerRoles, formatDateOnly, formatDateTime, formatPct, primaryButtonClass } from './supervision-ui';

interface SignatureInboxPanelProps {
  entry: SignatureInboxEntry;
  /** Avisa al panel lateral que no debe cerrarse mientras se registra la firma. */
  onBusyChange: (busy: boolean) => void;
  onSigned: (result: SignatureInboxSignOutcome) => void;
}

/**
 * Una lista ANA-REG-060 abierta desde el Buzón de firmas: resumen del
 * resultado, quién ha firmado, el PDF de la lista y el pad para colocar la
 * firma propia. El rol con el que se firma lo decide el servidor según la sesión.
 */
export const SignatureInboxPanel = ({ entry, onBusyChange, onSigned }: SignatureInboxPanelProps) => {
  const [detail, setDetail] = useState<SupervisionInboxDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'sign' | null>(null);

  useEffect(() => {
    let alive = true;
    getSupervisionInboxDetail(entry.id)
      .then((loaded) => alive && setDetail(loaded))
      .catch((error) => alive && setLoadError(getApiErrorMessage(error, 'No se pudo abrir la lista.')));
    return () => {
      alive = false;
    };
  }, [entry.id]);

  const openPdf = async () => {
    setBusy('pdf');
    try {
      window.open(await getSignatureInboxPdfUrl('SUPERVISION', entry.id), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setBusy(null);
    }
  };

  const sign = async () => {
    if (!signature) {
      notifyWarning('Traza tu firma.');
      return;
    }
    setBusy('sign');
    onBusyChange(true);
    try {
      onSigned(await signFromInbox('SUPERVISION', entry.id, signature));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar tu firma.'));
    } finally {
      setBusy(null);
      onBusyChange(false);
    }
  };

  if (loadError) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</p>;
  }
  if (!detail) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Abriendo lista…
      </p>
    );
  }

  const { checklist, pending_roles: pendingRoles, my_roles: myRoles } = detail;
  const summary = checklist.summary;
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;
  const closed = checklist.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{checklist.employee_name}</p>
        <p className="text-xs text-[var(--unilabor-neutral)]">
          {checklist.employee_code} · {checklist.position_code} – {checklist.position_name} · supervisión del {formatDateOnly(checklist.supervision_date)}
        </p>
        <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
          {checklist.enrollment_id
            ? checklist.is_final
              ? 'Lista final de la Fase 6 de Inducción de este puesto.'
              : 'Supervisión intermedia de la Fase 6 de Inducción.'
            : 'Supervisión de área.'}{' '}
          {closed
            ? `Cerrada el ${formatDateTime(checklist.closed_at)}.`
            : `Enviada a firma${checklist.signature_requested_by_name ? ` por ${checklist.signature_requested_by_name}` : ''} el ${formatDateTime(checklist.signature_requested_at)}.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 text-sm md:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Cumplimiento</p>
          <p className="text-lg font-bold text-[var(--color-brand-700)]">{formatPct(summary.compliance_pct)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">SÍ / NO / N/A</p>
          <p className="text-lg font-bold text-[var(--color-brand-700)]">
            {summary.compliant} / {summary.non_compliant} / {summary.not_applicable}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Conclusión</p>
          {conclusion ? (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${conclusion.className}`}>{conclusion.label}</span>
          ) : (
            <span className="text-xs text-[var(--unilabor-neutral)]">—</span>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Resultado</p>
          <p className={`text-sm font-bold ${summary.passed ? 'text-emerald-700' : 'text-rose-700'}`}>{summary.passed ? 'Aprobada (≥ 80 %)' : 'No aprobada (< 80 %)'}</p>
        </div>
      </div>

      {checklist.supervisor_comments || checklist.sgc_follow_up_required ? (
        <div className="space-y-1 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2 text-xs leading-5 text-[var(--unilabor-ink)]">
          {checklist.supervisor_comments ? (
            <p>
              <span className="font-semibold">Comentarios del supervisor:</span> {checklist.supervisor_comments}
            </p>
          ) : null}
          {checklist.sgc_follow_up_required ? (
            <p>
              <span className="font-semibold">Requiere gestión del SGC:</span> {checklist.sgc_reference || 'sin referencia'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--unilabor-neutral)]">Revisa el detalle de los aspectos evaluados antes de firmar.</p>
        <button type="button" onClick={() => void openPdf()} disabled={busy !== null} className={buttonClass} title="Ver la lista completa en PDF">
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Ver lista (PDF)
        </button>
      </div>

      <SupervisionSignatureProgress signers={checklist.signers} inSignature />

      {pendingRoles.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4">
          <SignaturePad label={`Tu firma · ${describeSignerRoles(pendingRoles)}`} hint="Firma con el dedo, lápiz o mouse, o carga una imagen de tu firma" onChange={setSignature} allowUpload />
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            {pendingRoles.length > 1
              ? `Ocupas dos roles en esta lista: tu firma quedará registrada como ${describeSignerRoles(pendingRoles)}.`
              : `Firmas como ${describeSignerRoles(pendingRoles)}.`}{' '}
            Cuando estén las tres firmas la lista se cierra sola y se archiva en el expediente del colaborador.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={() => void sign()} disabled={busy !== null} className={primaryButtonClass}>
              {busy === 'sign' ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} Firmar
            </button>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          {closed
            ? 'Lista cerrada con sus tres firmas y archivada en el expediente del colaborador.'
            : `Ya firmaste como ${describeSignerRoles(myRoles)}; la lista se cerrará sola cuando firmen los demás.`}
        </p>
      )}
    </div>
  );
};
