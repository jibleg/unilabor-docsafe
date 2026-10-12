import type { IncidentTypeFlags } from '../../../api/service.api-attendance-settings';

export const FLAG_FIELDS: Array<{ key: keyof IncidentTypeFlags; label: string; badge: string; help: string }> = [
  { key: 'requires_attachment', label: 'Requiere comprobante', badge: 'Con comprobante', help: 'Al registrar la incidencia se pedirá adjuntar un documento.' },
  { key: 'is_paid', label: 'Con goce de sueldo', badge: 'Con goce', help: 'El día se paga aunque no haya checadas.' },
  { key: 'deducts_vacation', label: 'Descuenta vacaciones', badge: 'Descuenta vacaciones', help: 'Cada día de esta incidencia se resta del saldo de vacaciones.' },
  { key: 'counts_as_attendance', label: 'Cuenta como asistencia', badge: 'Cuenta como asistencia', help: 'El día se considera presente para el compromiso y las faltas.' },
  { key: 'is_hourly', label: 'Por horas', badge: 'Por horas', help: 'Se registra con hora de inicio y fin, no por días completos.' },
];
