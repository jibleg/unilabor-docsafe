import { describe, expect, it } from 'vitest';
import type { DeviceOrder } from '../../../api/service.api-attendance-devices';
import {
  buildAgentConfigJson,
  clockDriftLabel,
  orderDetail,
  orderTypeLabel,
  retriesLabel,
  syncResultMessage,
  timeSince,
} from './deviceHelpers';

const baseOrder = {
  id: 1, agent_id: 1, terminal_id: null, terminal_name: null, terminal_serial: null, employee_id: null,
  employee_name: null, order_type: 'sync_person', payload: { employeeNo: 'T001' }, order_status: 'done',
  result: null, error_message: null, attempt_count: 1, created_at: '', picked_up_at: null, finished_at: null,
} as DeviceOrder;

describe('deviceHelpers', () => {
  it('traduce tipos de orden', () => {
    expect(orderTypeLabel('enroll_face')).toBe('Capturar rostro');
    expect(orderTypeLabel('otro')).toBe('otro');
  });
  it('detalle prioriza el error', () => {
    expect(orderDetail({ ...baseOrder, error_message: 'falló' })).toEqual({ text: 'falló', isError: true });
    expect(orderDetail(baseOrder).text).toBe('N.º T001');
  });
  it('reintentos solo si hay mas de uno', () => {
    expect(retriesLabel(baseOrder)).toBe('');
    expect(retriesLabel({ ...baseOrder, attempt_count: 3 })).toBe('×3');
  });
  it('tiempo transcurrido', () => {
    const now = new Date('2026-10-12T12:00:00Z').getTime();
    expect(timeSince(null, now)).toBe('sin latidos');
    expect(timeSince('2026-10-12T11:55:00Z', now)).toBe('hace 5 min');
    expect(timeSince('2026-10-12T09:00:00Z', now)).toBe('hace 3 h');
    expect(timeSince('2026-10-12T11:59:50Z', now)).toBe('hace unos segundos');
  });
  it('desfase de hora', () => {
    expect(clockDriftLabel(-1)).toBe('−1 s');
    expect(clockDriftLabel(0)).toBe('0 s');
    expect(clockDriftLabel(600)).toBe('+10 min');
    expect(clockDriftLabel(null)).toBe('—');
  });
  it('mensaje de sincronizacion', () => {
    expect(syncResultMessage({ queued: 0, queued_sync: 0, queued_remove: 0, skipped_without_number: 0 })).toMatch(/nada pendiente/);
    expect(syncResultMessage({ queued: 4, queued_sync: 3, queued_remove: 1, skipped_without_number: 2 })).toContain('2 sin número');
  });
  it('json de configuracion', () => {
    expect(JSON.parse(buildAgentConfigJson({ docsafeUrl: 'https://x', agentKey: 'k' }))).toEqual({ docsafeUrl: 'https://x', agentKey: 'k' });
  });
});
