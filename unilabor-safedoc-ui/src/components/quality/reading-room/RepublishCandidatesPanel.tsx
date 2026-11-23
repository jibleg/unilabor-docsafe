import { RefreshCw } from 'lucide-react';
import type { RepublishCandidate } from '../../../types/models';

interface RepublishCandidatesPanelProps {
  candidates: RepublishCandidate[];
  /** Total sin paginar (para distinguir "no hay" de "página vacía"). */
  total: number;
  republishingId: number | null;
  onRepublish: (candidate: RepublishCandidate) => void;
}

/** Documentos reemplazados en el SGC cuya versión nueva aún no se publica a lectura. */
export const RepublishCandidatesPanel = ({ candidates, total, republishingId, onRepublish }: RepublishCandidatesPanelProps) => (
  <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
    <div className="flex items-center gap-2">
      <RefreshCw size={16} className="text-amber-700" />
      <h2 className="text-sm font-bold text-amber-900">Documentos con versión nueva sin publicar</h2>
    </div>
    <p className="mt-1 text-xs text-amber-800">
      El documento fue reemplazado en el SGC y su lectura anterior se cerró sola. Quienes ya firmaron conservan su constancia; publica la
      nueva ronda si deben leer la versión vigente.
    </p>
    {total === 0 ? (
      <p className="mt-3 rounded-xl bg-white/80 px-4 py-6 text-center text-sm text-[var(--unilabor-neutral)]">
        No hay documentos con versión nueva pendiente de publicar.
      </p>
    ) : (
      <ul className="mt-3 space-y-2">
        {candidates.map((candidate) => (
          <li key={candidate.publication_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-brand-700)]">{candidate.new_title}</p>
              <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                Reemplaza a "{candidate.previous_title}" · {candidate.signed_readers} firmaron la versión anterior
              </p>
            </div>
            <button
              type="button"
              disabled={republishingId === candidate.publication_id}
              onClick={() => onRepublish(candidate)}
              className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {republishingId === candidate.publication_id ? 'Publicando…' : 'Publicar nueva ronda'}
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
