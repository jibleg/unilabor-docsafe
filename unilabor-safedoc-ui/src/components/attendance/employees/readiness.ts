import type { AttendanceEmployee, DeviceSyncStatus } from '../../../api/service.api-attendance-employees';

/** Helpers puros de Colaboradores: "listo para checar", validaciones y filtros de resumen. */

/** El reloj (HikVision) solo acepta numeros de empleado con digitos; maximo 20. */
export const DEVICE_NUMBER_PATTERN = /^[0-9]{1,20}$/;
export const DEVICE_NUMBER_HELP = 'Solo dígitos (hasta 20): el reloj no acepta letras ni guiones.';

/** Deja solo digitos (hasta 20): al teclear o pegar, las letras y simbolos no entran. */
export const onlyDeviceDigits = (value: string): string => value.replace(/\D/g, '').slice(0, 20);

export const isValidDeviceNumber = (value: string): boolean => DEVICE_NUMBER_PATTERN.test(value.trim());

export const SYNC_LABEL: Record<DeviceSyncStatus, string> = {
  not_applicable: 'No aplica',
  pending: 'Por sincronizar',
  synced: 'Sincronizado',
  error: 'Con error',
};

export type ReadinessKey = 'branch' | 'number' | 'schedule' | 'synced';

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  detail: string;
}

export const computeReadiness = (employee: AttendanceEmployee): ReadinessItem[] => [
  {
    key: 'branch',
    label: 'Sucursal',
    ok: employee.branch_id !== null,
    detail: employee.branch_id !== null ? `Sucursal: ${employee.branch_name ?? ''}` : 'Falta asignar sucursal',
  },
  {
    key: 'number',
    label: 'Número de empleado',
    ok: !!employee.device_employee_number && isValidDeviceNumber(employee.device_employee_number),
    detail: !employee.device_employee_number
      ? 'Falta el número de empleado'
      : isValidDeviceNumber(employee.device_employee_number)
        ? `Número de empleado: ${employee.device_employee_number}`
        : `El número ${employee.device_employee_number} no es válido para el reloj (solo dígitos); corrígelo para poder sincronizar`,
  },
  {
    key: 'schedule',
    label: 'Horario',
    ok: employee.has_schedule,
    detail: employee.has_schedule ? 'Tiene horario vigente' : 'Sin horario asignado',
  },
  {
    key: 'synced',
    label: 'Reloj',
    ok: employee.device_sync_status === 'synced',
    detail:
      employee.device_sync_status === 'error' && employee.device_sync_error
        ? `Error de sincronización: ${employee.device_sync_error}`
        : `Reloj: ${SYNC_LABEL[employee.device_sync_status]}`,
  },
];

export const isReadyToPunch = (employee: AttendanceEmployee): boolean =>
  employee.is_enabled && computeReadiness(employee).every((item) => item.ok);

/** Chips del resumen -> filtros de la URL que aplican. */
export type SummaryChipKey = 'enabled' | 'without_branch' | 'without_device_number' | 'pending_sync' | 'without_schedule' | 'sync_error';

export const SUMMARY_CHIP_FILTERS: Record<SummaryChipKey, Record<string, string>> = {
  enabled: { enabled: 'true' },
  // Sin sucursal / sin numero: el backend no tiene filtro propio; se listan habilitados y se resalta.
  without_branch: { enabled: 'true', gap: 'branch' },
  without_device_number: { enabled: 'true', gap: 'number' },
  pending_sync: { enabled: 'true', sync_status: 'pending' },
  without_schedule: { enabled: 'true', without_schedule: 'true' },
  sync_error: { enabled: 'true', sync_status: 'error' },
};

/** Valida el ajuste manual de vacaciones. Devuelve error o null. */
export const validateVacationAdjustment = (adjustment: string, reason: string): string | null => {
  const value = Number(adjustment);
  if (adjustment.trim() === '' || !Number.isFinite(value)) return 'Indica el ajuste en días.';
  if (value < -60 || value > 60) return 'El ajuste va de -60 a 60 días.';
  if (Math.abs(value * 2 - Math.round(value * 2)) > 1e-9) return 'El ajuste va en pasos de 0.5 días.';
  if (reason.trim().length < 5) return 'El motivo debe tener al menos 5 caracteres.';
  return null;
};

/** Texto para el estado de sincronizacion en la ficha. */
export const syncBadgeClass = (status: DeviceSyncStatus): string =>
  status === 'synced' ? 'badge-success' : status === 'error' ? 'badge-error' : status === 'pending' ? 'badge-warning' : 'badge-ghost';
