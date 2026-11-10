import { CheckCircle2, Clock3, TriangleAlert } from 'lucide-react';
import type { DocumentSignerStatus } from '../../../types/models';
import { formatDateTime } from '../supervision/supervision-ui';
import { DOCUMENT_SIGNER_ROLE_LABELS, documentSignerIssue } from './document-signature-ui';

/**
 * Los firmantes de un REH-REG-003 (5) o REH-REG-008 (3) y su estado: firmado
 * (con fecha), pendiente, o el motivo por el que no puede firmar en su Buzón.
 */
export const DocumentSignatureProgress = ({ signers }: { signers: DocumentSignerStatus[] }) => (
  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {signers.map((signer) => {
      const issue = documentSignerIssue(signer);
      return (
        <li key={signer.role} className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{DOCUMENT_SIGNER_ROLE_LABELS[signer.role]}</p>
          <p className="truncate text-sm font-semibold text-[var(--unilabor-ink)]" title={signer.name || undefined}>
            {signer.name || '—'}
          </p>
          {signer.signed_at ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={13} /> Firmó {formatDateTime(signer.signed_at)}
            </p>
          ) : issue ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
              <TriangleAlert size={13} /> {issue}
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
              <Clock3 size={13} /> Pendiente de firma
            </p>
          )}
        </li>
      );
    })}
  </ul>
);
