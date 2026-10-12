import { describe, expect, it } from 'vitest';
import { createHolidaySchema, updateHolidaySchema } from '../../schemas/attendance/holidays.schema';

describe('festivos', () => {
  it('valida fecha real y nombre', () => {
    expect(createHolidaySchema.safeParse({ holiday_date: '2026-12-25', name: 'Navidad' }).success).toBe(true);
    expect(createHolidaySchema.safeParse({ holiday_date: '2026-02-31', name: 'Navidad' }).success).toBe(false);
    expect(createHolidaySchema.safeParse({ holiday_date: '25/12/2026', name: 'Navidad' }).success).toBe(false);
    expect(createHolidaySchema.safeParse({ holiday_date: '2026-12-25', name: ' ' }).success).toBe(false);
  });
  it('el parche exige al menos un campo', () => {
    expect(updateHolidaySchema.safeParse({}).success).toBe(false);
    expect(updateHolidaySchema.safeParse({ is_active: false }).success).toBe(true);
  });
});
