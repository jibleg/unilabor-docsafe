import type { ReactNode } from 'react';
import type { EmployeeExpedientSection } from '../types/models';

export interface ExpedientTab {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Texto corto a la derecha (p. ej. "5/8"). */
  badge?: string;
  /** Punto de atención: crítico (vencidos) o aviso (por vencer / faltantes obligatorios). */
  attention?: 'critical' | 'warning' | null;
  /** Sección completa (todo cargado y sin vencidos). */
  complete?: boolean;
}

/** Pestaña de una sección documental con su avance (cargados/total) y punto de atención. */
export const sectionToTab = (section: EmployeeExpedientSection): ExpedientTab => {
  // Sección abierta (Constancias): solo cuenta documentos reales, sin "pendientes".
  if (section.section.is_open) {
    const expired = section.items.some((item) => item.status === 'expired');
    const expiring = section.items.some((item) => item.status === 'expiring');
    return {
      key: `section-${section.section.id}`,
      label: section.section.name,
      badge: String(section.items.length),
      attention: expired ? 'critical' : expiring ? 'warning' : null,
    };
  }
  const total = section.items.length;
  const loaded = section.items.filter((item) => item.status !== 'missing').length;
  const expired = section.items.some((item) => item.status === 'expired');
  const warning =
    section.items.some((item) => item.status === 'expiring') ||
    section.items.some((item) => item.status === 'missing' && item.document_type.is_required);
  return {
    key: `section-${section.section.id}`,
    label: section.section.name,
    badge: `${loaded}/${total}`,
    attention: expired ? 'critical' : warning ? 'warning' : null,
    complete: total > 0 && loaded === total && !expired,
  };
};
