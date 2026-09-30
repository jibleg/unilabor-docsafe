import { AlertTriangle, Building2, CalendarClock, CalendarRange, CircleHelp, Info, ShieldCheck, Timer, Truck } from 'lucide-react';
import type { AgreementBucket } from '../../../types/models';
import { BUCKET_META, BUCKET_ORDER, PARTY_META } from '../../../utils/agreementDashboard';

interface AgreementLegendProps {
  counts: Record<AgreementBucket, number>;
  activeBucket: AgreementBucket | null;
  onFocusBucket: (bucket: AgreementBucket | null) => void;
}

const BUCKET_ICON: Record<AgreementBucket, typeof Truck> = {
  expired: AlertTriangle,
  critical: CalendarClock,
  warning: Timer,
  upcoming: CalendarRange,
  ok: ShieldCheck,
  no_expiry: CircleHelp,
};

/**
 * Señalética del tablero: qué significa cada color del semáforo de vigencia y
 * de la contraparte. Cada estado es clicable y filtra todos los componentes.
 */
export const AgreementLegend = ({ counts, activeBucket, onFocusBucket }: AgreementLegendProps) => (
  <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]" style={{ animation: 'agr-fade .4s ease both' }}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <Info size={16} /> Señalética del tablero
      </h2>
      <p className="text-[11px] text-[var(--unilabor-neutral)]">Los colores se calculan con la fecha de vencimiento de cada acuerdo. Haz clic en un estado para filtrar.</p>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {BUCKET_ORDER.map((bucket, index) => {
        const meta = BUCKET_META[bucket];
        const Icon = BUCKET_ICON[bucket];
        const active = activeBucket === bucket;
        return (
          <button
            key={bucket}
            type="button"
            onClick={() => onFocusBucket(active ? null : bucket)}
            className={`flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
              active ? 'ring-2 ring-[rgba(0,105,166,0.25)] border-[var(--color-brand-300)]' : 'border-[rgba(0,65,106,0.1)]'
            }`}
            style={{ animation: `agr-pop .35s ease ${index * 40}ms both` }}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: meta.color }}>
              <Icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                <span className="text-xs font-bold text-[var(--unilabor-ink)]">{meta.label}</span>
                <span className="ml-auto rounded-full bg-[rgba(0,65,106,0.06)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--color-brand-700)]">{counts[bucket]}</span>
              </span>
              <span className="block text-[11px] leading-4 text-[var(--unilabor-neutral)]">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[rgba(0,65,106,0.08)] pt-3 text-[11px] text-[var(--unilabor-ink)]">
      <span className="font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Contraparte</span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${PARTY_META.provider.soft} ${PARTY_META.provider.text}`}>
          <Truck size={13} />
        </span>
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PARTY_META.provider.color }} />
        <b>Proveedor</b> · acuerdos con quien nos presta servicios o suministra (etiqueta <b>P</b>)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${PARTY_META.client.soft} ${PARTY_META.client.text}`}>
          <Building2 size={13} />
        </span>
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PARTY_META.client.color }} />
        <b>Cliente</b> · convenios con quien recibe nuestros servicios (etiqueta <b>C</b>)
      </span>
      <span className="ml-auto text-[var(--unilabor-neutral)]">En las gráficas y tarjetas, la barra o borde de color indica el estado; la letra P/C indica la contraparte.</span>
    </div>
  </section>
);
