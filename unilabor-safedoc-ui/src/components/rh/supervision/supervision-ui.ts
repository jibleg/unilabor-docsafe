import type { SupervisionConclusion, SupervisionResult } from '../../../types/models';

/** Estilos y etiquetas compartidos de la Lista de verificacion ANA-REG-060. */

export const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
export const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:opacity-60';
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

export const CONCLUSION_UI: Record<SupervisionConclusion, { label: string; className: string }> = {
  CONFORME: { label: 'Conforme', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CONFORME_CON_OBSERVACIONES: { label: 'Conforme con observaciones', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  REQUIERE_SEGUIMIENTO: { label: 'Requiere seguimiento', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const RESULT_UI: Record<SupervisionResult, { label: string; active: string; title: string }> = {
  SI: { label: 'SÍ', active: 'bg-emerald-600 text-white border-emerald-600', title: 'Cumple' },
  NO: { label: 'NO', active: 'bg-rose-600 text-white border-rose-600', title: 'No cumple' },
  NA: { label: 'N/A', active: 'bg-slate-500 text-white border-slate-500', title: 'No aplica' },
};

export const formatPct = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value.toFixed(2)} %`);

export const formatDateOnly = (value: string | null | undefined): string => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export const todayIsoDate = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
