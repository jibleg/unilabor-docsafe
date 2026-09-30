import { Building2, ChevronRight, Truck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AgreementBucket, AgreementPartySummary } from '../../../types/models';
import { BUCKET_META, PARTY_META, formatDate } from '../../../utils/agreementDashboard';

interface AgreementPartyCardsProps {
  parties: AgreementPartySummary[];
  activeBucket: AgreementBucket | null;
}

/** Tarjetas por contraparte ordenadas por urgencia (peor estado primero). */
export const AgreementPartyCards = ({ parties, activeBucket }: AgreementPartyCardsProps) => {
  const navigate = useNavigate();
  const list = activeBucket ? parties.filter((p) => p.worst_bucket === activeBucket) : parties;
  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
        <Users size={18} /> Contrapartes
        <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-700)]">{list.length}</span>
      </h2>
      {list.length === 0 ? (
        <p className="text-xs text-[var(--unilabor-neutral)]">Sin contrapartes en este estado.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((party, index) => {
            const meta = BUCKET_META[party.worst_bucket];
            const Icon = party.party_type === 'provider' ? Truck : Building2;
            return (
              <button
                key={`${party.party_type}-${party.party_id}`}
                type="button"
                onClick={() => navigate(party.party_type === 'provider' ? `/providers/${party.party_id}` : `/providers/clients/${party.party_id}`)}
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ animation: `agr-pop .35s ease ${Math.min(index, 12) * 40}ms both` }}
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: meta.color }} />
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${PARTY_META[party.party_type].soft} ${PARTY_META[party.party_type].text}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--color-brand-700)]">{party.party_name}</span>
                  <span className="block truncate text-[11px] text-[var(--unilabor-neutral)]">
                    {PARTY_META[party.party_type].label}
                    {party.classification ? ` · ${party.classification}` : ''} · {party.agreements} acuerdo{party.agreements === 1 ? '' : 's'}
                  </span>
                  <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.soft} ${meta.text}`}>
                    {meta.short}
                    {party.next_expiry_date ? ` · ${formatDate(party.next_expiry_date)}` : ''}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[var(--unilabor-neutral)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-brand-600)]" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
