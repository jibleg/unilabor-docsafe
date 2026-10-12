import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cardClass, ghostButtonClass } from './boardStyles';
import { clampPercent } from './boardHelpers';

export const SectionCard = ({ title, icon, aside, children, className = '' }: {
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`${cardClass} ${className}`}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-brand-700)]">
        {icon}
        {title}
      </h2>
      {aside}
    </div>
    {children}
  </section>
);

export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
    {children}
  </p>
);

export const LoadingBlock = ({ label = 'Cargando…' }: { label?: string }) => (
  <div className="space-y-4" role="status" aria-live="polite">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-[rgba(191,212,230,0.35)]" />
      ))}
    </div>
    <div className="h-64 animate-pulse rounded-2xl bg-[rgba(191,212,230,0.25)]" />
    <span className="sr-only">{label}</span>
  </div>
);

export const ErrorBlock = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className={`${cardClass} flex flex-col items-center gap-3 text-center`} role="alert">
    <AlertTriangle size={28} className="text-[#d03b3b]" />
    <p className="text-sm text-[var(--unilabor-ink)]">{message}</p>
    <button type="button" onClick={onRetry} className={ghostButtonClass}>
      <RefreshCw size={16} />
      Reintentar
    </button>
  </div>
);

/** Anillo de avance SVG con el valor al centro. */
export const ProgressRing = ({ value, color, size = 96, label, sub }: {
  value: number | null | undefined;
  color: string;
  size?: number;
  label?: string;
  sub?: string;
}) => {
  const stroke = Math.max(8, size / 10);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = clampPercent(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img"
      aria-label={`${sub ?? 'Avance'}: ${value === null || value === undefined ? 'sin datos' : `${Math.round(value)}%`}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,65,106,0.1)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black leading-none text-[var(--color-brand-700)]" style={{ fontSize: size / 3.6 }}>
          {label ?? (value === null || value === undefined ? '—' : Math.round(value))}
        </span>
        {sub && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">{sub}</span>}
      </div>
    </div>
  );
};

export const MiniBar = ({ value, color, marker }: { value: number | null | undefined; color: string; marker?: number | null }) => (
  <div className="relative h-2 w-full overflow-visible rounded-full bg-[rgba(0,65,106,0.1)]" aria-hidden="true">
    <div className="h-full rounded-full" style={{ width: `${clampPercent(value)}%`, background: color, transition: 'width 0.5s ease' }} />
    {marker !== null && marker !== undefined && (
      <div className="absolute -top-1 h-4 w-0.5 bg-[var(--unilabor-ink)]" style={{ left: `${clampPercent(marker)}%` }} />
    )}
  </div>
);

export const StatusDot = ({ color }: { color: string }) => (
  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
);

export const LevelBadge = ({ label, color }: { label: string; color: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
    style={{ background: `${color}1f`, color }}>
    <StatusDot color={color} />
    {label}
  </span>
);
