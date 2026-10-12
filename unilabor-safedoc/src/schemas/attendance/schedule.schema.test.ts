import { describe, expect, it } from 'vitest';
import {
  copyScheduleSchema,
  createAssignmentsSchema,
  deleteAssignmentQuerySchema,
  scheduleLogQuerySchema,
  scheduleQuerySchema,
  updateAssignmentSchema,
} from './schedule.schema';

const base = { employee_ids: [1], shift_ids: [1], start_date: '2026-10-12', repeats_weekly: false };

describe('createAssignmentsSchema', () => {
  it('dia suelto minimo con defaults', () => {
    const parsed = createAssignmentsSchema.parse(base);
    expect(parsed.week_interval).toBe(1);
    expect(parsed.keep_existing).toBe(false);
  });
  it('recurrente exige dias y los ordena sin repetir', () => {
    expect(createAssignmentsSchema.safeParse({ ...base, repeats_weekly: true }).success).toBe(false);
    expect(createAssignmentsSchema.parse({ ...base, repeats_weekly: true, weekdays: [5, 1, 1, 3] }).weekdays).toEqual([1, 3, 5]);
  });
  it('descanso = shift_ids vacio', () => {
    expect(createAssignmentsSchema.safeParse({ ...base, shift_ids: [] }).success).toBe(true);
  });
  it.each([
    [{ employee_ids: [] }],
    [{ employee_ids: [1, 1] }],
    [{ shift_ids: [2, 2] }],
    [{ start_date: '2026-02-30' }],
    [{ start_date: '12/10/2026' }],
    [{ end_date: '2026-10-01' }],
    [{ repeats_weekly: true, weekdays: [8] }],
    [{ repeats_weekly: true, weekdays: [1], week_interval: 9 }],
    [{ week_interval: 0 }],
  ])('rechaza %j', (patch) => {
    expect(createAssignmentsSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('updateAssignmentSchema', () => {
  it('exige un campo y permite shift_id null', () => {
    expect(updateAssignmentSchema.safeParse({}).success).toBe(false);
    expect(updateAssignmentSchema.parse({ shift_id: null }).shift_id).toBeNull();
  });
});

describe('deleteAssignmentQuerySchema', () => {
  it('convierte booleanos y valida fecha', () => {
    expect(deleteAssignmentQuerySchema.parse({ date: '2026-10-12', from_date_only: 'true' }).from_date_only).toBe(true);
    expect(deleteAssignmentQuerySchema.safeParse({ date: 'hoy' }).success).toBe(false);
  });
});

describe('copyScheduleSchema', () => {
  const copy = { source_employee_id: 1, source_date: '2026-10-12' };
  it('aplica defaults', () => {
    expect(copyScheduleSchema.parse(copy)).toMatchObject({ target_employee_ids: [], same_week: false, weeks: 1, replace: false });
  });
  it('limita semanas 1-12', () => {
    expect(copyScheduleSchema.safeParse({ ...copy, weeks: 13 }).success).toBe(false);
    expect(copyScheduleSchema.safeParse({ ...copy, weeks: 0 }).success).toBe(false);
    expect(copyScheduleSchema.safeParse({ ...copy, weeks: 12 }).success).toBe(true);
  });
});

describe('consultas', () => {
  it('schedule: coerce y limites', () => {
    const q = scheduleQuerySchema.parse({ week: '2026-10-12', branch_id: '2', page: '1', limit: '50', only_enabled: 'false' });
    expect(q).toMatchObject({ branch_id: 2, page: 1, limit: 50, only_enabled: false });
    expect(scheduleQuerySchema.safeParse({ limit: '9999' }).success).toBe(false);
  });
  it('log: defaults de paginacion y accion valida', () => {
    expect(scheduleLogQuerySchema.parse({})).toMatchObject({ page: 1, limit: 50 });
    expect(scheduleLogQuerySchema.safeParse({ action: 'otra' }).success).toBe(false);
  });
});
