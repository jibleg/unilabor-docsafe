import { describe, expect, it } from 'vitest';
import type { EngineShift } from './engine/schedule';
import type { AssignmentRecord } from './schedule-data.service';
import { buildDayView } from './schedule-view.service';

const shift = (id: number, name: string, s: string, e: string, breakMinutes = 0): EngineShift => ({
  id, name, startTime: s, endTime: e, breakMinutes, flexible: false, isActive: true,
});
const display = {
  engine: new Map([
    [1, shift(1, 'Manana', '08:00', '12:00')],
    [2, shift(2, 'Tarde', '16:00', '20:00')],
    [3, shift(3, 'Noche', '22:00', '06:00')],
    [4, shift(4, 'Largo', '08:00', '17:00', 60)],
  ]),
  colors: new Map([[1, '#111111'], [2, '#222222'], [3, '#333333'], [4, '#444444']]),
};
const MON = '2026-10-12';
let id = 1;
const rec = (shiftId: number | null, extra: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id: id++, employeeId: 1, shiftId, startDate: MON, endDate: null, repeatsWeekly: true, weekInterval: 1,
  weekdays: [1, 2, 3, 4, 5], notes: null, ...extra,
});

describe('buildDayView', () => {
  it('jornada partida suma horas y marca split', () => {
    const view = buildDayView([rec(1), rec(2)], display, MON, 'sunday', 3);
    expect(view.chips.map((c) => c.name)).toEqual(['Manana', 'Tarde']);
    expect(view.total_hours).toBe(8);
    expect(view.is_split).toBe(true);
    expect(view.has_conflict_limit).toBe(false);
  });
  it('horas netas descuentan descanso', () => {
    expect(buildDayView([rec(4)], display, MON, 'sunday', 3).total_hours).toBe(8);
  });
  it('turno nocturno calcula 8 horas', () => {
    expect(buildDayView([rec(3)], display, MON, 'sunday', 3).total_hours).toBe(8);
  });
  it('alcanzar el maximo marca has_conflict_limit', () => {
    expect(buildDayView([rec(1), rec(2)], display, MON, 'sunday', 2).has_conflict_limit).toBe(true);
  });
  it('descanso produce chip sin horas', () => {
    const view = buildDayView([rec(null)], display, MON, 'sunday', 3);
    expect(view.is_rest_day).toBe(true);
    expect(view.chips[0]).toMatchObject({ shift_id: null, name: 'Descanso', hours: 0 });
  });
  it('dia suelto reemplaza recurrentes; duplicados se cuentan', () => {
    const single = { startDate: MON, endDate: MON, repeatsWeekly: false };
    const view = buildDayView([rec(1), rec(2, single), rec(2, single)], display, MON, 'sunday', 3);
    expect(view.chips).toHaveLength(1);
    expect(view.chips[0]).toMatchObject({ name: 'Tarde', duplicate_count: 2, is_recurring: false });
  });
  it('dia sin programacion', () => {
    const view = buildDayView([rec(1)], display, '2026-10-17', 'sunday', 3);
    expect(view.has_schedule).toBe(false);
    expect(view.chips).toEqual([]);
  });
});
