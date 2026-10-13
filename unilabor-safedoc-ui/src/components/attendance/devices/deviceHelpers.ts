import type { DeviceOrder, DeviceOrderStatus, SyncResult } from '../../../api/service.api-attendance-devices';

/** Etiquetas y utilidades puras de la pantalla de Relojes. */

const ORDER_TYPE_LABELS: Record<string, string> = {
  sync_person: 'Alta/actualizar persona',
  remove_person: 'Baja de persona',
  enroll_fingerprint: 'Capturar huella',
  enroll_face: 'Capturar rostro',
  fetch_events: 'Consultar eventos',
  check_status: 'Estado del reloj',
};

export const orderTypeLabel = (type: string): string => ORDER_TYPE_LABELS[type] ?? type;

export const ORDER_STATUS_OPTIONS: Array<{ value: DeviceOrderStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'processing', label: 'En proceso' },
  { value: 'done', label: 'Hecha' },
  { value: 'error', label: 'Error' },
];

export const orderStatusLabel = (status: string): string =>
  ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;

/** Detalle legible de una orden: error si lo hay, si no el colaborador/serie. */
export const orderDetail = (order: DeviceOrder): { text: string; isError: boolean } => {
  if (order.error_message) return { text: order.error_message, isError: true };
  const payload = order.payload ?? {};
  const employeeNo = typeof payload.employeeNo === 'string' ? payload.employeeNo : '';
  const parts = [order.terminal_name ?? order.terminal_serial, employeeNo ? `N.º ${employeeNo}` : ''].filter(Boolean);
  return { text: parts.join(' · '), isError: false };
};

/** Reintentos mostrados junto al estado (solo si hubo mas de un intento). */
export const retriesLabel = (order: DeviceOrder): string => (order.attempt_count > 1 ? `×${order.attempt_count}` : '');

/** Tiempo transcurrido desde un instante: 'hace 5 min'. */
export const timeSince = (iso: string | null | undefined, now: number = Date.now()): string => {
  if (!iso) return 'sin latidos';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'sin latidos';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return 'hace unos segundos';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
};

/** Desfase de hora del reloj respecto del servidor: '+3 s', '−2 min'. */
export const clockDriftLabel = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '—';
  const sign = seconds < 0 ? '−' : seconds > 0 ? '+' : '';
  const abs = Math.abs(seconds);
  if (abs < 120) return `${sign}${abs} s`;
  return `${sign}${Math.round(abs / 60)} min`;
};

/** Mensaje de exito para el resultado de encolar sincronizaciones. */
export const syncResultMessage = (result: SyncResult): string => {
  const invalid = result.skipped_invalid_number ?? 0;
  if (result.queued === 0 && result.skipped_without_number === 0 && invalid === 0) return 'No hay nada pendiente de sincronizar.';
  const parts = [`${result.queued_sync} alta(s)`, `${result.queued_remove} baja(s)`];
  let text = `Se encolaron ${parts.join(' y ')}.`;
  if (result.skipped_without_number > 0) {
    text += ` ${result.skipped_without_number} sin número de empleado se omitieron.`;
  }
  if (invalid > 0) {
    text += ` ${invalid} con número no válido para el reloj (solo dígitos) se omitieron.`;
  }
  return text;
};

/** JSON de configuracion sugerido para el archivo del agente. */
export const buildAgentConfigJson = (config: { docsafeUrl: string; agentKey: string }): string =>
  JSON.stringify({ docsafeUrl: config.docsafeUrl, agentKey: config.agentKey }, null, 2);
