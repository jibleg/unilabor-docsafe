import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, PenLine } from 'lucide-react';
import { getDocumentInboxDetail, getSignatureInboxPdfUrl, signFromInbox } from '../../../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { DocumentInboxDetail, SignatureInboxEntry, SignatureInboxSignOutcome, SignedDocumentKind } from '../../../types/models';
import { DICTAMEN_UI } from '../../../utils/competency';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { buttonClass, formatDateOnly, formatDateTime, primaryButtonClass } from '../supervision/supervision-ui';
import { DocumentSignatureProgress } from './DocumentSignatureProgress';

interface DocumentInboxPanelProps {
  entry: SignatureInboxEntry & { kind: SignedDocumentKind };
  onBusyChange: (busy: boolean) => void;
  onSigned: (result: SignatureInboxSignOutcome) => void;
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`);

/** Resumen del REH-REG-003: resultados por sección y dictamen. */
const CompetencySummary = ({ detail }: { detail: DocumentInboxDetail }) => {
  const evaluation = detail.evaluation!;
  const results = evaluation.results;
  const dictamen = results.dictamen ? DICTAMEN_UI[results.dictamen] : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 text-sm md:grid-cols-4">
        {(
          [
            ['Competencia (50%)', results.competency_pct],
            ['Desempeño (20%)', results.performance_pct],
            ['Conocimiento (30%)', results.knowledge_pct],
            ['Resultado final', results.final_pct],
          ] as Array<[string, number | null]>
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">{label}</p>
            <p className="text-lg font-bold text-[var(--color-brand-700)]">{pct(value)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {dictamen ? <span className={`rounded-full px-3 py-1 font-bold ${dictamen.className}`}>{dictamen.label}</span> : null}
        {results.veto_applied ? (
          <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
            <AlertTriangle size={13} /> VETO: competencia crítica con calificación menor a 3
          </span>
        ) : null}
        <span className="text-[var(--unilabor-neutral)]">
          Evaluada el {formatDateOnly(evaluation.evaluation_date)} por {evaluation.evaluator_name || '—'} · {(evaluation.actions ?? []).length} acción(es) de mejora
        </span>
      </div>
    </>
  );
};

/** Resumen del REH-REG-008: autorizaciones en Sí. */
const LetterSummary = ({ detail }: { detail: DocumentInboxDetail }) => {
  const letter = detail.letter!;
  const authorized = letter.items.filter((item) => item.authorized);
  return (
    <div className="space-y-2 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 text-sm">
      <p className="font-semibold text-[var(--unilabor-ink)]">
        {authorized.length} autorizaciones en Sí de {letter.items.length} · carta del {formatDateOnly(letter.letter_date)}
      </p>
      <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs leading-5 text-[var(--unilabor-ink)]">
        {authorized.map((item) => (
          <li key={item.id}>
            {item.item_no}. {item.item_text}
          </li>
        ))}
      </ul>
      {letter.other_authorizations ? <p className="text-xs">Otras: {letter.other_authorizations}</p> : null}
    </div>
  );
};

/**
 * Un REH-REG-003 o REH-REG-008 abierto desde el Buzón de firmas: resumen,
 * quién ha firmado, el PDF y el pad para la firma propia. El rol con el que se
 * firma lo decide el servidor según la sesión.
 */
export const DocumentInboxPanel = ({ entry, onBusyChange, onSigned }: DocumentInboxPanelProps) => {
  const [detail, setDetail] = useState<DocumentInboxDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'sign' | null>(null);

  useEffect(() => {
    let alive = true;
    getDocumentInboxDetail(entry.kind, entry.id)
      .then((loaded) => alive && setDetail(loaded))
      .catch((error) => alive && setLoadError(getApiErrorMessage(error, 'No se pudo abrir el registro.')));
    return () => {
      alive = false;
    };
  }, [entry.kind, entry.id]);

  const openPdf = async () => {
    setBusy('pdf');
    try {
      window.open(await getSignatureInboxPdfUrl(entry.kind, entry.id), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setBusy(null);
    }
  };

  const sign = async () => {
    if (!signature) return notifyWarning('Traza tu firma.');
    setBusy('sign');
    onBusyChange(true);
    try {
      onSigned(await signFromInbox(entry.kind, entry.id, signature));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar tu firma.'));
    } finally {
      setBusy(null);
      onBusyChange(false);
    }
  };

  if (loadError) return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</p>;
  if (!detail) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Abriendo registro…
      </p>
    );
  }

  const record = detail.evaluation ?? detail.letter!;
  const closed = record.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{record.employee_name}</p>
        <p className="text-xs text-[var(--unilabor-neutral)]">
          {record.employee_code} · {entry.position_code} – {entry.position_name}
        </p>
        <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
          {closed
            ? `Cerrado el ${formatDateTime(record.closed_at)}.`
            : `Enviado a firma${record.signature_requested_by_name ? ` por ${record.signature_requested_by_name}` : ''} el ${formatDateTime(record.signature_requested_at)}.`}
        </p>
      </div>

      {detail.kind === 'COMPETENCY_EVALUATION' ? <CompetencySummary detail={detail} /> : <LetterSummary detail={detail} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--unilabor-neutral)]">Revisa el documento completo antes de firmar.</p>
        <button type="button" onClick={() => void openPdf()} disabled={busy !== null} className={buttonClass} title="Ver el registro completo en PDF">
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Ver {entry.form_code} (PDF)
        </button>
      </div>

      <DocumentSignatureProgress signers={detail.signers} />

      {detail.has_pending ? (
        <section className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4">
          <SignaturePad label={`Tu firma · ${detail.pending_roles_label}`} hint="Firma con el dedo, lápiz o mouse" onChange={setSignature} />
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Firmas como {detail.pending_roles_label}. Cuando estén todas las firmas el registro se cierra solo y se archiva en el expediente del colaborador.
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
            ? 'Registro cerrado con todas sus firmas y archivado en el expediente del colaborador.'
            : `Ya firmaste como ${detail.my_roles_label}; el registro se cerrará solo cuando firmen los demás.`}
        </p>
      )}
    </div>
  );
};
