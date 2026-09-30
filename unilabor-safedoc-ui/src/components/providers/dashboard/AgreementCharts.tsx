import { useState } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import type { AgreementBucket, AgreementDashboard } from '../../../types/models';
import { BUCKET_META, BUCKET_ORDER, PARTY_META, formatMonth } from '../../../utils/agreementDashboard';

interface AgreementChartsProps {
  dashboard: AgreementDashboard;
  activeBucket: AgreementBucket | null;
  onFocusBucket: (bucket: AgreementBucket | null) => void;
}

const polar = (cx: number, cy: number, r: number, angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
const arcPath = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
};

/** Donut de estado (semáforo) con leyenda clicable. */
const StatusDonut = ({ dashboard, activeBucket, onFocusBucket }: AgreementChartsProps) => {
  const total = dashboard.kpis.agreements;
  const entries = BUCKET_ORDER.map((bucket) => ({ bucket, value: dashboard.by_bucket[bucket] })).filter((entry) => entry.value > 0);
  const cx = 70, cy = 70, r = 56;
  const segments: Array<{ bucket: AgreementBucket; value: number; from: number; to: number }> = [];
  let cursor = -Math.PI / 2;
  for (const entry of entries) {
    const sweep = (entry.value / Math.max(1, total)) * Math.PI * 2;
    segments.push({ ...entry, from: cursor, to: Math.max(cursor + 0.02, cursor + sweep - 0.03) });
    cursor += sweep;
  }
  return (
    <div className="flex items-center gap-5">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Acuerdos por estado de vigencia">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,65,106,0.08)" strokeWidth="18" />
        {segments.map((entry) => {
          const dim = activeBucket && activeBucket !== entry.bucket;
          return (
            <path
              key={entry.bucket}
              d={arcPath(cx, cy, r, entry.from, entry.to)}
              fill="none"
              stroke={BUCKET_META[entry.bucket].color}
              strokeWidth={activeBucket === entry.bucket ? 22 : 18}
              strokeLinecap="butt"
              opacity={dim ? 0.3 : 1}
              className="cursor-pointer transition-all duration-300"
              onClick={() => onFocusBucket(activeBucket === entry.bucket ? null : entry.bucket)}
              style={{ strokeDasharray: 400, strokeDashoffset: 0, animation: 'agr-draw 1s ease both' }}
            >
              <title>{`${BUCKET_META[entry.bucket].label}: ${entry.value}`}</title>
            </path>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[var(--color-brand-700)] text-[26px] font-black">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[var(--unilabor-neutral)] text-[10px] font-semibold uppercase">
          acuerdos
        </text>
      </svg>
      <ul className="flex-1 space-y-1.5 text-xs">
        {BUCKET_ORDER.map((bucket) => (
          <li key={bucket}>
            <button
              type="button"
              onClick={() => onFocusBucket(activeBucket === bucket ? null : bucket)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-[rgba(248,251,253,1)] ${activeBucket === bucket ? 'bg-[rgba(239,245,250,1)] ring-1 ring-[rgba(0,105,166,0.2)]' : ''}`}
            >
              <span className="inline-flex items-center gap-2 text-[var(--unilabor-ink)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BUCKET_META[bucket].color }} />
                {BUCKET_META[bucket].label}
              </span>
              <span className="font-bold tabular-nums text-[var(--color-brand-700)]">{dashboard.by_bucket[bucket]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Barras apiladas por mes (proveedores vs clientes) con tooltip. */
const MonthlyBars = ({ dashboard }: { dashboard: AgreementDashboard }) => {
  const [hover, setHover] = useState<number | null>(null);
  const data = dashboard.by_month;
  if (data.length === 0) {
    return <p className="text-xs text-[var(--unilabor-neutral)]">Sin vencimientos registrados.</p>;
  }
  const max = Math.max(1, ...data.map((m) => m.providers + m.clients));
  const W = 560, H = 150, padL = 26, padB = 26, gap = 4;
  const bw = Math.max(8, (W - padL) / data.length - gap);
  const current = dashboard.today.slice(0, 7);
  // Etiquetas del eje: cuando hay muchos meses se muestran espaciadas (siempre el actual).
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vencimientos por mes">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={H - padB - t * (H - padB - 10)} y2={H - padB - t * (H - padB - 10)} stroke="rgba(0,65,106,0.08)" />
            <text x={padL - 4} y={H - padB - t * (H - padB - 10) + 3} textAnchor="end" className="fill-[var(--unilabor-neutral)] text-[9px]">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {data.map((m, i) => {
          const x = padL + i * ((W - padL) / data.length) + gap / 2;
          const hp = ((H - padB - 10) * m.providers) / max;
          const hc = ((H - padB - 10) * m.clients) / max;
          const base = H - padB;
          const isCurrent = m.month === current;
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <rect x={x} y={base - hp} width={bw} height={hp} rx={3} fill={PARTY_META.provider.color} opacity={hover !== null && hover !== i ? 0.45 : 1} style={{ transformOrigin: `${x}px ${base}px`, animation: `agr-grow .6s ease ${i * 40}ms both` }} />
              <rect x={x} y={base - hp - hc - (hc ? 2 : 0)} width={bw} height={hc} rx={3} fill={PARTY_META.client.color} opacity={hover !== null && hover !== i ? 0.45 : 1} style={{ transformOrigin: `${x}px ${base}px`, animation: `agr-grow .6s ease ${i * 40 + 80}ms both` }} />
              {m.providers + m.clients > 0 ? (
                <text x={x + bw / 2} y={base - hp - hc - 5} textAnchor="middle" className="fill-[var(--unilabor-ink)] text-[9px] font-bold">
                  {m.providers + m.clients}
                </text>
              ) : null}
              {isCurrent || i % labelEvery === 0 || hover === i ? (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className={`text-[9px] ${isCurrent ? 'fill-[var(--color-brand-700)] font-bold' : 'fill-[var(--unilabor-neutral)]'}`}>
                  {formatMonth(m.month)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-xs shadow-lg" style={{ animation: 'agr-fade .15s ease both' }}>
          <p className="font-bold text-[var(--color-brand-700)]">{formatMonth(data[hover].month)}</p>
          <p className="text-[var(--unilabor-ink)]">
            Proveedores: <b>{data[hover].providers}</b> · Clientes: <b>{data[hover].clients}</b>
            {data[hover].expired ? <span className="text-rose-700"> · {data[hover].expired} vencido(s)</span> : null}
          </p>
        </div>
      ) : null}
      <div className="mt-1 flex gap-4 text-[11px] text-[var(--unilabor-ink)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PARTY_META.provider.color }} /> Proveedores
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PARTY_META.client.color }} /> Clientes
        </span>
      </div>
    </div>
  );
};

/** Barras horizontales por categoría (contrato, convenio, constancia…). */
const CategoryBars = ({ dashboard }: { dashboard: AgreementDashboard }) => {
  const data = dashboard.by_category;
  const max = Math.max(1, ...data.map((c) => c.providers + c.clients));
  return (
    <ul className="space-y-2">
      {data.map((c, i) => (
        <li key={c.category} className="text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-[var(--unilabor-ink)]">{c.category}</span>
            <span className="tabular-nums text-[var(--unilabor-neutral)]">
              {c.providers + c.clients}
              {dashboard.includes.providers && dashboard.includes.clients ? ` (${c.providers} P · ${c.clients} C)` : ''}
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
            <span style={{ width: `${(c.providers / max) * 100}%`, backgroundColor: PARTY_META.provider.color, animation: `agr-wide .7s ease ${i * 60}ms both` }} />
            <span style={{ width: `${(c.clients / max) * 100}%`, backgroundColor: PARTY_META.client.color, marginLeft: c.providers && c.clients ? 2 : 0, animation: `agr-wide .7s ease ${i * 60 + 100}ms both` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export const AgreementCharts = (props: AgreementChartsProps) => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <PieChart size={16} /> Estado de vigencia
      </h2>
      <StatusDonut {...props} />
    </section>
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <BarChart3 size={16} /> Vencimientos por mes
      </h2>
      <MonthlyBars dashboard={props.dashboard} />
    </section>
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <BarChart3 size={16} /> Por tipo de acuerdo
      </h2>
      <CategoryBars dashboard={props.dashboard} />
    </section>
  </div>
);
