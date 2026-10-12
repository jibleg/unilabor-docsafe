import { describe, expect, it } from 'vitest';
import { lftDaysForYear, toPolicyRow } from './vacation-policy.service';
import { saveVacationPolicySchema, vacationPolicyParamsSchema } from '../../schemas/attendance/vacation-policy.schema';

describe('tabla de vacaciones LFT', () => {
  it('calcula los dias de la Ley por tramo', () => {
    expect(lftDaysForYear(1)).toBe(12);
    expect(lftDaysForYear(5)).toBe(20);
    expect(lftDaysForYear(6)).toBe(22);
    expect(lftDaysForYear(10)).toBe(22);
    expect(lftDaysForYear(11)).toBe(24);
    expect(lftDaysForYear(60)).toBe(40);
  });
  it('marca las filas distintas a la Ley', () => {
    expect(toPolicyRow(1, 12).differs_from_law).toBe(false);
    expect(toPolicyRow(1, 15)).toMatchObject({ law_days: 12, differs_from_law: true });
  });
  it('valida dias en pasos de 0.5 y anio 1-60', () => {
    expect(saveVacationPolicySchema.safeParse({ vacation_days: 12.5 }).success).toBe(true);
    expect(saveVacationPolicySchema.safeParse({ vacation_days: 12.3 }).success).toBe(false);
    expect(saveVacationPolicySchema.safeParse({ vacation_days: 61 }).success).toBe(false);
    expect(vacationPolicyParamsSchema.safeParse({ fromYear: '0' }).success).toBe(false);
    expect(vacationPolicyParamsSchema.safeParse({ fromYear: '61' }).success).toBe(false);
    expect(vacationPolicyParamsSchema.safeParse({ fromYear: '7' }).success).toBe(true);
  });
});
