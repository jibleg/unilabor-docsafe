import { CheckCircle2, Clock3, TriangleAlert } from 'lucide-react';
import type { SupervisionSigner } from '../../../types/models';
import { SIGNER_ROLE_LABELS, formatDateTime, signerIssue } from './supervision-ui';

interface SupervisionSignatureProgressProps {
  signers: SupervisionSigner[];
  /** true = la lista ya está en firma (muestra quién firmó y quién falta); false = vista previa antes de enviar. */
  inSignature: boolean;
}

/**
 * Los tres firmantes de la lista ANA-REG-060 y su estado: firmado (con fecha),
 * pendiente, o el motivo por el que no puede firmar en su Buzón.
 */
export const SupervisionSignatureProgress = ({ signers, inSignature }: SupervisionSignatureProgressProps) => (
  <ul className="grid gap-2 md:grid-cols-3">
    {signers.map((signer) => {
      const issue = signerIssue(signer);
      return (
        <li key={signer.role} className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{SIGNER_ROLE_LABELS[signer.role]}</p>
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
              <Clock3 size={13} /> {inSignature ? 'Pendiente de firma' : 'Firmará en su Buzón'}
            </p>
          )}
        </li>
      );
    })}
  </ul>
);
