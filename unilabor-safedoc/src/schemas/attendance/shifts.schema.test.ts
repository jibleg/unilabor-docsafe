import { describe, expect, it } from 'vitest';
import { createShiftSchema, listShiftsQuerySchema, updateShiftSchema } from './shifts.schema';

describe('createShiftSchema', () => {
  it('aplica valores por defecto', () => {
    const parsed = createShiftSchema.parse({ name: ' Matutino ', start_time: '08:00', end_time: '17:00' });
    expect(parsed).toMatchObject({ name: 'Matutino', break_minutes: 0, shift_type: 'fixed', color_hex: '#034898' });
  });
  it.each([
    [{ name: 'A', start_time: '08:00', end_time: '17:00' }],
    [{ name: 'Turno', start_time: '8:00', end_time: '17:00' }],
    [{ name: 'Turno', start_time: '08:00', end_time: '24:00' }],
    [{ name: 'Turno', start_time: '08:00', end_time: '17:00', break_minutes: 481 }],
    [{ name: 'Turno', start_time: '08:00', end_time: '17:00', shift_type: 'otro' }],
    [{ name: 'Turno', start_time: '08:00', end_time: '17:00', color_hex: 'red' }],
    [{ name: 'x'.repeat(81), start_time: '08:00', end_time: '17:00' }],
  ])('rechaza %j', (body) => {
    expect(createShiftSchema.safeParse(body).success).toBe(false);
  });
  it('acepta turno nocturno', () => {
    expect(createShiftSchema.safeParse({ name: 'Noche', start_time: '22:00', end_time: '06:00' }).success).toBe(true);
  });
});

describe('updateShiftSchema', () => {
  it('exige al menos un campo', () => {
    expect(updateShiftSchema.safeParse({}).success).toBe(false);
    expect(updateShiftSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});

describe('listShiftsQuerySchema', () => {
  it('convierte include_inactive', () => {
    expect(listShiftsQuerySchema.parse({ include_inactive: 'true' }).include_inactive).toBe(true);
    expect(listShiftsQuerySchema.parse({}).include_inactive).toBeUndefined();
    expect(listShiftsQuerySchema.safeParse({ include_inactive: 'si' }).success).toBe(false);
  });
});
