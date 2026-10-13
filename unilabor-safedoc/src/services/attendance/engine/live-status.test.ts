import { describe, expect, it } from 'vitest';
import type { EnginePunch } from './day-calculator';
import { liveStatus, statusFromDailyResult, type LiveInput } from './live-status';
import type { EngineAssignment, EngineShift } from './schedule';
import { DEFAULT_ATTENDANCE_SETTINGS } from './settings';
import { dateToLocalMs } from './time';

const DATE = '2026-10-14'; // miercoles
const MIDNIGHT = dateToLocalMs(DATE);
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return MIDNIGHT + (h * 60 + m) * 60_000;
};

/** Ventanas amplias: estas pruebas ejercitan retardo/salida anticipada, no las ventanas (ver punch-windows.test.ts). */
const WIDE = { entryBeforeMin: 60, entryAfterMin: 240, exitBeforeMin: 240, exitAfterMin: 240 };

const shifts = new Map<number, EngineShift>([
  [1, { id: 1, name: 'Mat', startTime: '08:00', endTime: '14:00', breakMinutes: 0, flexible: false, isActive: true, ...WIDE }],
  [2, { id: 2, name: 'Tarde', startTime: '16:00', endTime: '20:00', breakMinutes: 0, flexible: false, isActive: true, ...WIDE }],
  [3, { id: 3, name: 'Flex', startTime: '08:00', endTime: '16:00', breakMinutes: 0, flexible: true, isActive: true, ...WIDE }],
]);
const assign = (id: number, shiftId: number | null): EngineAssignment => ({
  id, shiftId, startDate: '2026-01-01', endDate: null, repeatsWeekly: true, weekInterval: 1, weekdays: [1, 2, 3, 4, 5, 6, 7],
});
let ref = 0;
const punch = (hhmm: string, type: EnginePunch['type'] = null): EnginePunch => {
  ref += 1;
  return { ref, at: at(hhmm), type, reviewStatus: 'none' };
};
const input = (over: Partial<LiveInput>): LiveInput => ({
  workDate: DATE, assignments: [assign(1, 1)], shiftsById: shifts, isHoliday: false, hasFullDayIncident: false,
  punches: [], nowLocal: at('09:00'), settings: DEFAULT_ATTENDANCE_SETTINGS, ...over,
});

describe('liveStatus', () => {
  it('incidencia gana sobre todo', () => {
    expect(liveStatus(input({ hasFullDayIncident: true, isHoliday: true })).status).toBe('incident');
  });
  it('sin horario', () => {
    expect(liveStatus(input({ assignments: [] })).status).toBe('no_schedule');
  });
  it('descanso y festivo; con entrada son present/left', () => {
    expect(liveStatus(input({ assignments: [assign(1, 1), { ...assign(2, null), startDate: DATE, endDate: DATE, repeatsWeekly: false }] })).status).toBe('rest');
    expect(liveStatus(input({ isHoliday: true })).status).toBe('rest');
    expect(liveStatus(input({ isHoliday: true, punches: [punch('09:00')] })).status).toBe('present');
    expect(liveStatus(input({ isHoliday: true, punches: [punch('09:00'), punch('13:00')], nowLocal: at('14:00') })).status).toBe('left');
  });
  it('por llegar antes de la hora y dentro del plazo', () => {
    expect(liveStatus(input({ nowLocal: at('07:00') })).status).toBe('upcoming');
    expect(liveStatus(input({ nowLocal: at('08:30') })).status).toBe('upcoming');
  });
  it('sin checar al pasar late_until_min (30)', () => {
    expect(liveStatus(input({ nowLocal: at('08:30') })).status).toBe('upcoming');
    expect(liveStatus(input({ nowLocal: at('08:31') })).status).toBe('missing');
  });
  it('presente a tiempo, dentro de tolerancia y con retardo', () => {
    expect(liveStatus(input({ punches: [punch('07:55', 'in')] })).status).toBe('present');
    expect(liveStatus(input({ punches: [punch('08:10', 'in')] })).status).toBe('present');
    const late = liveStatus(input({ punches: [punch('08:15', 'in')] }));
    expect(late.status).toBe('late');
    expect(late.lateMinutes).toBe(15);
    expect(late.clockIn).toBe(at('08:15'));
  });
  it('checada una hora antes cuenta; mas temprano no', () => {
    expect(liveStatus(input({ punches: [punch('07:00')], nowLocal: at('07:30') })).status).toBe('present');
    expect(liveStatus(input({ punches: [punch('06:30')], nowLocal: at('07:30') })).status).toBe('upcoming');
  });
  it('salio cuando hay salida', () => {
    const state = liveStatus(input({ punches: [punch('08:00', 'in'), punch('13:00', 'out')], nowLocal: at('13:30') }));
    expect(state.status).toBe('left');
    expect(state.clockOut).toBe(at('13:00'));
  });
  it('turno flexible nunca es late ni missing por hora de entrada tardia', () => {
    expect(liveStatus(input({ assignments: [assign(1, 3)], punches: [punch('11:00', 'in')], nowLocal: at('11:30') })).status).toBe('present');
  });
  it('jornada partida: usa el ultimo tramo cuyo inicio ya paso', () => {
    const split = [assign(1, 1), assign(2, 2)];
    const first = liveStatus(input({ assignments: split, punches: [punch('08:00', 'in'), punch('14:00', 'out')], nowLocal: at('15:00') }));
    expect(first.status).toBe('left');
    expect(first.expectedStartMinute).toBe(8 * 60);
    const second = liveStatus(input({ assignments: split, punches: [punch('08:00', 'in'), punch('14:00', 'out')], nowLocal: at('16:45') }));
    expect(second.status).toBe('missing');
    expect(second.expectedStartMinute).toBe(16 * 60);
    const back = liveStatus(input({ assignments: split, punches: [punch('08:00', 'in'), punch('14:00', 'out'), punch('15:58', 'in')], nowLocal: at('16:20') }));
    expect(back.status).toBe('present');
  });
  it('checada pendiente de revision se marca', () => {
    const pending: EnginePunch = { ref: 99, at: at('08:00'), type: 'in', reviewStatus: 'pending' };
    expect(liveStatus(input({ punches: [pending] })).hasPendingReview).toBe(true);
  });
  it('checada rechazada se ignora', () => {
    const rejected: EnginePunch = { ref: 98, at: at('08:00'), type: 'in', reviewStatus: 'rejected' };
    expect(liveStatus(input({ punches: [rejected], nowLocal: at('09:00') })).status).toBe('missing');
  });
});

describe('statusFromDailyResult', () => {
  it('mapea resultados calculados', () => {
    expect(statusFromDailyResult(null, false)).toBe('no_schedule');
    expect(statusFromDailyResult('late', true)).toBe('late');
    expect(statusFromDailyResult('present', true)).toBe('left');
    expect(statusFromDailyResult('early_departure', false)).toBe('present');
    expect(statusFromDailyResult('absent', false)).toBe('missing');
    expect(statusFromDailyResult('partial_absence', false)).toBe('missing');
    expect(statusFromDailyResult('holiday', false)).toBe('rest');
    expect(statusFromDailyResult('incident', false)).toBe('incident');
  });
});
