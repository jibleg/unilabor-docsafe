import { describe, expect, it } from 'vitest';
import { extractBearerKey, generateAgentKey, hashAgentKey } from './agent-auth.service';
import {
  decodePhoto, evaluateClockDrift, mapAttendanceStatus, mapVerificationMethod, parseDeviceTime,
} from './punch-mapping';

describe('mapeo de checadas', () => {
  it('mapea attendanceStatus', () => {
    expect(mapAttendanceStatus('checkIn')).toBe('in');
    expect(mapAttendanceStatus('overtimeIn')).toBe('in');
    expect(mapAttendanceStatus('checkOut')).toBe('out');
    expect(mapAttendanceStatus('overtimeOut')).toBe('out');
    expect(mapAttendanceStatus('breakOut')).toBe('break_start');
    expect(mapAttendanceStatus('breakIn')).toBe('break_end');
    expect(mapAttendanceStatus('undefined')).toBeNull();
    expect(mapAttendanceStatus(undefined)).toBeNull();
  });

  it('mapea el metodo de verificacion', () => {
    expect(mapVerificationMethod('face')).toBe('face');
    expect(mapVerificationMethod('huella')).toBe('fingerprint');
    expect(mapVerificationMethod('card')).toBe('card');
    expect(mapVerificationMethod('pin')).toBe('pin');
    expect(mapVerificationMethod('xyz')).toBe('other');
  });

  it('interpreta la hora con y sin zona', () => {
    expect(parseDeviceTime('2026-10-12T08:00:00-06:00', 'America/Mexico_City')?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(parseDeviceTime('2026-10-12T08:00:00', 'America/Mexico_City')?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(parseDeviceTime('basura', 'America/Mexico_City')).toBeNull();
  });

  it('desfase: revision entre el umbral y 1 h; historico no se marca', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(evaluateClockDrift(new Date('2026-10-12T12:05:00Z'), now, 10).needsReview).toBe(false);
    expect(evaluateClockDrift(new Date('2026-10-12T12:20:00Z'), now, 10).needsReview).toBe(true);
    expect(evaluateClockDrift(new Date('2026-10-12T11:30:00Z'), now, 10).reason).toContain('30 min');
    expect(evaluateClockDrift(new Date('2026-10-12T09:00:00Z'), now, 10).needsReview).toBe(false);
  });

  it('valida la foto por firma y tamano', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
    expect(decodePhoto(jpeg)?.extension).toBe('jpg');
    expect(decodePhoto(`data:image/jpeg;base64,${jpeg}`)?.extension).toBe('jpg');
    expect(decodePhoto(Buffer.from('texto plano').toString('base64'))).toBeNull();
    expect(decodePhoto(Buffer.alloc(2 * 1024 * 1024 + 10, 0xff).toString('base64'))).toBeNull();
    expect(decodePhoto(undefined)).toBeNull();
  });
});

describe('clave del agente', () => {
  it('genera 64 hex y su hash es estable', () => {
    const key = generateAgentKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAgentKey(key)).toHaveLength(64);
    expect(hashAgentKey(key)).toBe(hashAgentKey(key));
  });

  it('extrae solo claves Bearer validas', () => {
    const key = generateAgentKey();
    expect(extractBearerKey(`Bearer ${key}`)).toBe(key);
    expect(extractBearerKey(`Bearer ${key.slice(1)}`)).toBeNull();
    expect(extractBearerKey(key)).toBeNull();
    expect(extractBearerKey(undefined)).toBeNull();
  });
});
