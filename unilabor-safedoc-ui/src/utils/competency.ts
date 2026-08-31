/** Presentacion compartida del modulo Evaluacion de competencia (REH-REG-003). */

/** Formatea fechas date-only (YYYY-MM-DD) sin corrimiento de zona horaria. */
export const formatDateOnly = (value: string | null): string => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return new Date(value).toLocaleDateString('es-MX');
};
export const DICTAMEN_UI: Record<string, { label: string; className: string }> = {
  COMPETENTE_Y_AUTORIZADO: { label: 'Competente y autorizado', className: 'bg-emerald-50 text-emerald-700' },
  COMPETENTE_CON_OBSERVACIONES: { label: 'Competente con observaciones', className: 'bg-emerald-50 text-emerald-700' },
  COMPETENTE_BAJO_SUPERVISION: { label: 'Competente bajo supervisión', className: 'bg-amber-50 text-amber-700' },
  NO_COMPETENTE: { label: 'No competente', className: 'bg-rose-50 text-rose-700' },
};
