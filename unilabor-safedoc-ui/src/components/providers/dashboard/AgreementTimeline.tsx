import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AgreementBucket, AgreementItem } from '../../../types/models';
import { BUCKET_META, PARTY_META, addMonths, formatDate, formatDays, formatMonth, formatMonthLong, monthRange } from '../../../utils/agreementDashboard';

interface AgreementTimelineProps {
  items: AgreementItem[];
  today: string;
  activeBucket: AgreementBucket | null;
}

const WINDOW = 12;

/**
 * Línea de tiempo por meses del calendario de vencimientos: una columna por
 * mes (ventana de 12 meses desplazable), el mes actual marcado, y en cada mes
 * las tarjetas de los acuerdos que vencen, coloreadas por semáforo. Al
 * pasar el cursor muestra el detalle y al hacer clic abre la ficha.
 */
export const AgreementTimeline = ({ items, today, activeBucket }: AgreementTimelineProps) => {
  const navigate = useNavigate();
  const currentMonth = today.slice(0, 7);
  const [offset, setOffset] = useState(-1);
  const [hover, setHover] = useState<string | null>(null);

  const dated = useMemo(() => items.filter((item) => item.expiry_date && (!activeBucket || item.bucket === activeBucket)), [items, activeBucket]);
  const minMonth = dated.length ? dated[0].expiry_date!.slice(0, 7) : currentMonth;
  const maxMonth = dated.length ? dated[dated.length - 1].expiry_date!.slice(0, 7) : currentMonth;
  const start = addMonths(currentMonth, offset);
  const months = monthRange(start, addMonths(start, WINDOW - 1));
  const byMonth = useMemo(() => {
    const map = new Map<string, AgreementItem[]>();
    for (const item of dated) {
      const key = item.expiry_date!.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [dated]);
  const beforeCount = dated.filter((item) => item.expiry_date!.slice(0, 7) < months[0]).length;
  const afterCount = dated.filter((item) => item.expiry_date!.slice(0, 7) > months[months.length - 1]).length;
  const undated = items.filter((item) => !item.expiry_date && (!activeBucket || item.bucket === activeBucket)).length;
  const keyOf = (item: AgreementItem): string => `${item.party_type}-${item.id}`;
  const hovered = hover !== null ? dated.find((item) => keyOf(item) === hover) : null;

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
            <CalendarDays size={18} /> Calendario de vencimientos
          </h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            Línea de tiempo por meses. {dated.length} acuerdos con fecha{undated ? ` · ${undated} sin vencimiento` : ''}. Haz clic en una tarjeta para abrir la ficha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((o) => o - WINDOW)}
            disabled={months[0] <= minMonth && months[0] <= currentMonth}
            className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-40"
          >
            <ChevronLeft size={14} /> {beforeCount > 0 ? `${beforeCount} antes` : 'Anterior'}
          </button>
          <button
            type="button"
            onClick={() => setOffset(-1)}
            className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <MapPin size={14} /> Hoy
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + WINDOW)}
            disabled={months[months.length - 1] >= maxMonth}
            className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-40"
          >
            {afterCount > 0 ? `${afterCount} después` : 'Siguiente'} <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="grid min-w-[1080px] grid-cols-12 gap-2">
          {months.map((month) => {
            const list = byMonth.get(month) ?? [];
            const isCurrent = month === currentMonth;
            const isPast = month < currentMonth;
            return (
              <div key={month} className="flex flex-col">
                <div
                  className={`mb-2 rounded-xl px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide ${
                    isCurrent ? 'bg-[var(--color-brand-700)] text-white shadow-md' : isPast ? 'bg-slate-100 text-slate-500' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)]'
                  }`}
                >
                  {formatMonth(month)}
                  <span className="ml-1 rounded-full bg-white/70 px-1.5 text-[10px] text-[var(--color-brand-700)]">{list.length}</span>
                </div>
                <div className={`relative flex max-h-[460px] min-h-[150px] flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl border p-1.5 ${isCurrent ? 'border-[var(--color-brand-300)] bg-[rgba(239,245,250,0.9)]' : 'border-dashed border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.6)]'}`}>
                  {isCurrent ? <span className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--color-brand-500)] ring-4 ring-[rgba(0,105,166,0.2)]" /> : null}
                  {list.map((item, index) => {
                    const meta = BUCKET_META[item.bucket];
                    return (
                      <button
                        key={keyOf(item)}
                        type="button"
                        onMouseEnter={() => setHover(keyOf(item))}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => navigate(item.detail_path)}
                        title={`${item.party_name} · ${item.title}`}
                        className={`group w-full shrink-0 rounded-lg border-l-4 bg-white px-2 py-1.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${hover === keyOf(item) ? 'ring-2 ring-[rgba(0,105,166,0.25)]' : ''}`}
                        style={{ borderLeftColor: meta.color, animation: `agr-pop .35s ease ${Math.min(index, 8) * 40}ms both` }}
                      >
                        <p className="truncate text-[11px] font-bold text-[var(--unilabor-ink)]">{item.party_name}</p>
                        <p className="truncate text-[10px] text-[var(--unilabor-neutral)]">{item.category_name ?? item.title}</p>
                        <p className="mt-0.5 flex items-center justify-between text-[10px]">
                          <span className="font-semibold" style={{ color: meta.color }}>
                            {formatDate(item.expiry_date)}
                          </span>
                          <span className={`rounded px-1 text-[9px] font-bold ${PARTY_META[item.party_type].soft} ${PARTY_META[item.party_type].text}`}>{PARTY_META[item.party_type].label[0]}</span>
                        </p>
                      </button>
                    );
                  })}
                  {list.length === 0 ? <span className="m-auto text-[10px] text-[var(--unilabor-neutral)]">—</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--unilabor-ink)]">
        {(['expired', 'critical', 'warning', 'upcoming', 'ok'] as AgreementBucket[]).map((bucket) => (
          <span key={bucket} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BUCKET_META[bucket].color }} />
            {BUCKET_META[bucket].label}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PARTY_META.provider.soft} ${PARTY_META.provider.text}`}>P</span> Proveedor
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PARTY_META.client.soft} ${PARTY_META.client.text}`}>C</span> Cliente
        </span>
      </div>

      {hovered ? (
        <div className="mt-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] px-4 py-3 text-xs" style={{ animation: 'agr-fade .2s ease both' }}>
          <p className="font-bold text-[var(--color-brand-700)]">
            {hovered.party_name} <span className="font-normal text-[var(--unilabor-neutral)]">· {PARTY_META[hovered.party_type].label}{hovered.classification ? ` · ${hovered.classification}` : ''}</span>
          </p>
          <p className="text-[var(--unilabor-ink)]">
            {hovered.category_name}: {hovered.title}
            {hovered.description ? ` — ${hovered.description}` : ''}
          </p>
          <p className="mt-1 text-[var(--unilabor-neutral)]">
            Vigencia desde {formatDate(hovered.effective_from)} · vence {formatDate(hovered.expiry_date)} ({formatMonthLong(hovered.expiry_date!.slice(0, 7))}) ·{' '}
            <span className="font-semibold" style={{ color: BUCKET_META[hovered.bucket].color }}>
              {formatDays(hovered.days_to_expiry)}
            </span>
            {hovered.version_chain > 1 ? ` · ${hovered.version_chain} versiones en histórico` : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
};
