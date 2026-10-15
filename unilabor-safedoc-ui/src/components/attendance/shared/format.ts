/** Formateadores de fecha/hora para el modulo de asistencias (es-MX). */

/** 'YYYY-MM-DD' -> '12 oct 2026' (sin corrimiento por zona horaria). */
export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** 'YYYY-MM-DD' -> 'lun 12 oct'. */
export const formatDateShort = (value: string | null | undefined): string => {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
};

/** Instante ISO -> 'HH:MM' en la zona del navegador. */
export const formatTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
};

/** Instante ISO -> '12 oct 08:03'. */
export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};

/** 'HH:MM:SS' | 'HH:MM' -> 'HH:MM'. */
export const formatClock = (value: string | null | undefined): string => (value ? value.slice(0, 5) : '—');

export const formatHours = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} h` : '—';
};

export const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Primer dia con datos del modulo: ningun campo de fecha admite algo anterior. */
export const ATTENDANCE_MIN_DATE = '2026-01-01';

/** Limites (min/max) para campos de fecha de hechos pasados: desde ATTENDANCE_MIN_DATE hasta hoy. */
export const pastDateBounds = (today: string = todayIso()): { min: string; max: string } => ({
  min: ATTENDANCE_MIN_DATE,
  max: today,
});

export const addDaysIso = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
};
