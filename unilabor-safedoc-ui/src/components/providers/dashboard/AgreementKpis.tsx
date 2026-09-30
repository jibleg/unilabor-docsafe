import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CalendarClock, CalendarRange, FileSignature, ShieldCheck, Truck } from 'lucide-react';
import type { AgreementBucket, AgreementDashboard } from '../../../types/models';
import { BUCKET_META, formatDate } from '../../../utils/agreementDashboard';

interface AgreementKpisProps {
  dashboard: AgreementDashboard;
  onFocusBucket: (bucket: AgreementBucket | null) => void;
  activeBucket: AgreementBucket | null;
}

/** Contador animado (0 -> valor) para los KPIs. */
const useCountUp = (value: number, duration = 700): number => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return current;
};

const Tile = ({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  active,
  onClick,
  delay,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
  hint?: string;
  accent: string;
  active?: boolean;
  onClick?: () => void;
  delay: number;
}) => {
  const shown = useCountUp(value);
  const className = `group relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-white/90 px-4 py-3 text-left shadow-sm shadow-[rgba(0,65,106,0.05)] transition-all duration-300 ${
    active ? 'border-[var(--color-brand-500)] ring-2 ring-[rgba(0,105,166,0.18)]' : 'border-[rgba(0,65,106,0.1)]'
  } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[rgba(0,65,106,0.12)]' : ''}`;
  const body = (
    <>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${accent}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black leading-tight text-[var(--color-brand-700)] tabular-nums">{shown}</p>
        <p className="text-xs font-semibold text-[var(--unilabor-ink)]">{label}</p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
      </div>
    </>
  );
  const style = { animation: `agr-pop .45s ease ${delay}ms both` };
  return onClick ? (
    <button type="button" onClick={onClick} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
};

/** Fila de indicadores ejecutivos; los de vencimiento filtran el resto del tablero. */
export const AgreementKpis = ({ dashboard, onFocusBucket, activeBucket }: AgreementKpisProps) => {
  const { kpis, includes } = dashboard;
  const toggle = (bucket: AgreementBucket) => onFocusBucket(activeBucket === bucket ? null : bucket);
  const parties = [
    includes.providers ? `${kpis.providers_with_agreements} de ${kpis.providers_active} proveedores` : null,
    includes.clients ? `${kpis.clients_with_agreements} de ${kpis.clients_active} clientes` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile icon={FileSignature} label="Acuerdos vigentes" value={kpis.agreements} hint={parties} accent="bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]" delay={0} />
      <Tile icon={Building2} label="Contrapartes con acuerdo" value={kpis.providers_with_agreements + kpis.clients_with_agreements} hint={`${kpis.providers_active + kpis.clients_active} activas en catálogo`} accent="bg-violet-50 text-violet-700" delay={50} />
      <Tile
        icon={AlertTriangle}
        label={BUCKET_META.expired.label}
        value={kpis.expired}
        hint={BUCKET_META.expired.description}
        accent={kpis.expired > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}
        active={activeBucket === 'expired'}
        onClick={() => toggle('expired')}
        delay={100}
      />
      <Tile
        icon={CalendarClock}
        label="Vencen en 30 días"
        value={kpis.critical_30}
        hint={BUCKET_META.critical.description}
        accent={kpis.critical_30 > 0 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'}
        active={activeBucket === 'critical'}
        onClick={() => toggle('critical')}
        delay={150}
      />
      <Tile
        icon={CalendarRange}
        label="Vencen en 31-90 días"
        value={kpis.warning_60 + kpis.upcoming_90}
        hint={`${kpis.warning_60} en 31-60 d · ${kpis.upcoming_90} en 61-90 d`}
        accent={kpis.warning_60 + kpis.upcoming_90 > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}
        active={activeBucket === 'warning' || activeBucket === 'upcoming'}
        onClick={() => onFocusBucket(activeBucket === 'warning' ? null : 'warning')}
        delay={200}
      />
      <Tile
        icon={ShieldCheck}
        label="Vigentes a más de 90 días"
        value={kpis.ok}
        hint={kpis.next_expiry ? `Próximo: ${kpis.next_expiry.party_name} · ${formatDate(kpis.next_expiry.expiry_date)}` : 'Sin vencimientos próximos'}
        accent="bg-emerald-50 text-emerald-700"
        active={activeBucket === 'ok'}
        onClick={() => toggle('ok')}
        delay={250}
      />
    </div>
  );
};
