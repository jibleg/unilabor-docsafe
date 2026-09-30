import type { AgreementBucket, AgreementPartyType } from '../types/models';

/**
 * Presentación del Panorama de contratos (módulo Prestación de servicios).
 * Paleta de estado validada para daltonismo (rosa / naranja / ámbar / azul /
 * esmeralda); el ámbar siempre va acompañado de etiqueta y conteo.
 */

export const BUCKET_META: Record<
  AgreementBucket,
  { label: string; short: string; color: string; soft: string; text: string; description: string }
> = {
  expired: { label: 'Vencido', short: 'Vencido', color: '#be123c', soft: 'bg-rose-50 border-rose-200', text: 'text-rose-700', description: 'La vigencia ya terminó y no hay versión nueva.' },
  critical: { label: 'Vence en 30 días', short: '≤ 30 d', color: '#ea580c', soft: 'bg-orange-50 border-orange-200', text: 'text-orange-700', description: 'Requiere gestión inmediata de renovación.' },
  warning: { label: 'Vence en 31-60 días', short: '31-60 d', color: '#f59e0b', soft: 'bg-amber-50 border-amber-200', text: 'text-amber-700', description: 'Iniciar la renovación este mes.' },
  upcoming: { label: 'Vence en 61-90 días', short: '61-90 d', color: '#0284c7', soft: 'bg-sky-50 border-sky-200', text: 'text-sky-700', description: 'Programar la renovación.' },
  ok: { label: 'Vigente (> 90 días)', short: 'Vigente', color: '#059669', soft: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', description: 'Sin acción por ahora.' },
  no_expiry: { label: 'Sin fecha de vencimiento', short: 'Sin vencimiento', color: '#94a3b8', soft: 'bg-slate-100 border-slate-200', text: 'text-slate-600', description: 'Indefinido o sin fecha registrada.' },
};

export const BUCKET_ORDER: AgreementBucket[] = ['expired', 'critical', 'warning', 'upcoming', 'ok', 'no_expiry'];

export const PARTY_META: Record<AgreementPartyType, { label: string; plural: string; color: string; soft: string; text: string }> = {
  provider: { label: 'Proveedor', plural: 'Proveedores', color: '#0069a6', soft: 'bg-[rgba(191,212,230,0.45)]', text: 'text-[var(--color-brand-700)]' },
  client: { label: 'Cliente', plural: 'Clientes', color: '#8b5cf6', soft: 'bg-violet-50', text: 'text-violet-700' },
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11" -> "Nov 2026" */
export const formatMonth = (yyyyMm: string): string => {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
};

export const formatMonthLong = (yyyyMm: string): string => {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS_LONG[(m ?? 1) - 1]} de ${y}`;
};

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[(m ?? 1) - 1]} ${y}`;
};

export const formatDays = (days: number | null): string => {
  if (days === null) return 'Sin vencimiento';
  if (days < 0) return `Venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Vence hoy';
  if (days < 60) return `Vence en ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `Vence en ${months} mes${months === 1 ? '' : 'es'}`;
};

/** Lista de meses YYYY-MM entre dos fechas (inclusive). */
export const monthRange = (fromIso: string, toIso: string): string[] => {
  const out: string[] = [];
  let [y, m] = fromIso.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toIso.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
};

export const addMonths = (iso: string, months: number): string => {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
