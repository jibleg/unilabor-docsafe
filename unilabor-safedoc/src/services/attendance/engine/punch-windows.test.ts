import { describe, expect, it } from 'vitest';
import { calculateDay, type DayInput, type EnginePunch } from './day-calculator';
import { liveStatus } from './live-status';
import { hasScheduleOn, resolveDay, type EngineAssignment, type EngineShift } from './schedule';
import { DEFAULT_ATTENDANCE_SETTINGS } from './settings';
import { dateToLocalMs } from './time';

const DATE = '2026-10-14'; // miercoles
const MIDNIGHT = dateToLocalMs(DATE);
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return MIDNIGHT + (h * 60 + m) * 60_000;
};
let ref = 0;
const punch = (hhmm: string, type: EnginePunch['type'] = null): EnginePunch => ({ ref: ++ref, at: at(hhmm), type, reviewStatus: 'none' });

// Turno 07:00-15:00: entrada valida 06:00-09:00 (60 antes / 120 despues), salida 14:00-17:00.
const day: EngineShift = {
  id: 1, name: 'Dia', startTime: '07:00', endTime: '15:00', breakMinutes: 0, flexible: false, isActive: true,
  entryBeforeMin: 60, entryAfterMin: 120, exitBeforeMin: 60, exitAfterMin: 120,
};
// Jornada quebrada: dos bloques con ventanas propias.
const morning: EngineShift = {
  id: 2, name: 'Manana', startTime: '07:00', endTime: '11:00', breakMinutes: 0, flexible: false, isActive: true,
  entryBeforeMin: 30, entryAfterMin: 30, exitBeforeMin: 30, exitAfterMin: 60,
};
const afternoon: EngineShift = {
  id: 3, name: 'Tarde', startTime: '13:00', endTime: '17:00', breakMinutes: 0, flexible: false, isActive: true,
  entryBeforeMin: 30, entryAfterMin: 30, exitBeforeMin: 30, exitAfterMin: 60,
};
const shifts = new Map<number, EngineShift>([[1, day], [2, morning], [3, afternoon]]);
const assign = (id: number, shiftId: number): EngineAssignment => ({
  id, shiftId, startDate: '2026-01-01', endDate: null, repeatsWeekly: true, weekInterval: 1, weekdays: [1, 2, 3, 4, 5],
});

const dayInput = (assignments: EngineAssignment[], punches: EnginePunch[]): DayInput => ({
  workDate: DATE, plan: resolveDay(assignments, shifts, DATE, 'sunday'), hasSchedule: hasScheduleOn(assignments, DATE),
  isHoliday: false, punches, fullDayIncident: null, authorizedOvertimeHours: 0, settings: DEFAULT_ATTENDANCE_SETTINGS,
});

describe('ventanas de checada por turno', () => {
  it('la primera checada en la ventana de entrada es la entrada y la ultima en la de salida es la salida', () => {
    const result = calculateDay(dayInput([assign(1, 1)], [punch('06:50'), punch('07:05'), punch('12:00'), punch('14:55'), punch('15:02')]));
    expect(result.clockInAt).toBe(at('06:50'));
    expect(result.clockOutAt).toBe(at('15:02'));
    expect(result.dayResult).toBe('present');
  });

  it('una checada a media jornada no es salida', () => {
    const result = calculateDay(dayInput([assign(1, 1)], [punch('07:00'), punch('09:30'), punch('13:36')]));
    expect(result.clockOutAt).toBeNull();
    expect(result.reason).toBe('missing_exit');
  });

  it('checada fuera de la ventana de entrada: no hay entrada', () => {
    const result = calculateDay(dayInput([assign(1, 1)], [punch('09:42')]));
    expect(result.dayResult).toBe('absent');
    expect(result.reason).toBe('no_entry_in_window');
  });

  it('salida dentro de la ventana pero antes de la hora cuenta como salida anticipada', () => {
    const result = calculateDay(dayInput([assign(1, 1)], [punch('07:00'), punch('14:10')]));
    expect(result.clockOutAt).toBe(at('14:10'));
    expect(result.earlyDepartureMinutes).toBe(50);
    expect(result.dayResult).toBe('early_departure');
  });

  it('turno quebrado: cada bloque usa su propia ventana', () => {
    const punches = [punch('06:55'), punch('11:05'), punch('12:45'), punch('17:10')];
    const result = calculateDay(dayInput([assign(1, 2), assign(2, 3)], punches));
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ clockInAt: at('06:55'), clockOutAt: at('11:05') });
    expect(result.segments[1]).toMatchObject({ clockInAt: at('12:45'), clockOutAt: at('17:10') });
    expect(result.dayResult).toBe('present');
  });

  it('turno quebrado: sin entrada en el segundo bloque es falta parcial', () => {
    const result = calculateDay(dayInput([assign(1, 2), assign(2, 3)], [punch('07:00'), punch('11:00')]));
    expect(result.dayResult).toBe('partial_absence');
  });
});

describe('estado en vivo con ventanas', () => {
  const live = (punches: EnginePunch[], now: string) =>
    liveStatus({
      workDate: DATE, assignments: [assign(1, 1)], shiftsById: shifts, isHoliday: false, hasFullDayIncident: false,
      punches, nowLocal: at(now), settings: DEFAULT_ATTENDANCE_SETTINGS,
    });

  it('a media jornada con dos checadas sigue presente (no "ya salio")', () => {
    const state = live([punch('07:02'), punch('07:08')], '13:36');
    expect(state.status).toBe('present');
    expect(state.clockOut).toBeNull();
  });

  it('pasa a "ya salio" con una checada en la ventana de salida', () => {
    expect(live([punch('07:00'), punch('15:01')], '15:30').status).toBe('left');
  });
});
