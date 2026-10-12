import { describe, expect, it } from 'vitest';
import { availableActions, formatIncidentDuration, validateFiles, validateIncidentForm } from './incidentFormat';

const base = { employeeId: '1', typeId: '2', startDate: '2026-10-12', endDate: '', hours: '', reason: '', imssFolio: '' };
const ctx = { isHourly: false, requiresAttachment: false, fileCount: 0 };

describe('incidentFormat', () => {
  it('formatea duracion en dias y horas', () => {
    expect(formatIncidentDuration({ days: 1, hours: null })).toBe('1 día');
    expect(formatIncidentDuration({ days: 4, hours: null })).toBe('4 días');
    expect(formatIncidentDuration({ days: null, hours: 2.5 })).toBe('2.5 h');
    expect(formatIncidentDuration({ days: null, hours: null })).toBe('—');
  });

  it('valida el formulario', () => {
    expect(validateIncidentForm(base, ctx)).toBeNull();
    expect(validateIncidentForm({ ...base, employeeId: '' }, ctx)).toMatch(/colaborador/);
    expect(validateIncidentForm({ ...base, endDate: '2026-10-01' }, ctx)).toMatch(/anterior/);
    expect(validateIncidentForm(base, { ...ctx, isHourly: true })).toMatch(/horas/);
    expect(validateIncidentForm({ ...base, hours: '25' }, { ...ctx, isHourly: true })).toMatch(/horas/);
    expect(validateIncidentForm({ ...base, hours: '2' }, { ...ctx, isHourly: true })).toBeNull();
    expect(validateIncidentForm(base, { ...ctx, requiresAttachment: true })).toMatch(/comprobante/);
    expect(validateIncidentForm(base, { ...ctx, requiresAttachment: true, fileCount: 1 })).toBeNull();
  });

  it('filtra archivos por tipo y tamano', () => {
    const ok = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const badType = new File(['x'], 'a.exe', { type: 'application/x-msdownload' });
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'b.png', { type: 'image/png' });
    const result = validateFiles([ok, badType, big]);
    expect(result.accepted).toEqual([ok]);
    expect(result.rejected).toHaveLength(2);
  });

  it('respeta las transiciones de estado', () => {
    expect(availableActions('captured')).toEqual({ canAuthorize: true, canReject: true, canCancel: true });
    expect(availableActions('authorized')).toEqual({ canAuthorize: false, canReject: true, canCancel: true });
    expect(availableActions('rejected')).toEqual({ canAuthorize: false, canReject: false, canCancel: false });
    expect(availableActions('cancelled').canCancel).toBe(false);
  });
});
