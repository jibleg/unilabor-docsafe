import type { AcknowledgementStatus, ReadingPublication } from '../types/models';

export const READER_STATUS_LABEL: Record<AcknowledgementStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En lectura',
  read: 'Leído · falta firmar',
  signed: 'Firmado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

export const READER_STATUS_STYLE: Record<AcknowledgementStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-800',
  read: 'bg-sky-100 text-sky-800',
  signed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-500',
};

export const formatStamp = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

/** Porcentaje de firmas sobre el total asignado: es el avance que importa. */
export const signedPercent = (publication: ReadingPublication): number => {
  if (publication.readers_total <= 0) {
    return 0;
  }
  return Math.round((publication.readers_signed / publication.readers_total) * 100);
};
