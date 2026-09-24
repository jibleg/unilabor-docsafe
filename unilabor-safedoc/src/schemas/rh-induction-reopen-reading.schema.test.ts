import { describe, expect, it } from 'vitest';
import { reopenInductionReadingSchema } from './rh-induction-reopen-reading.schema';

describe('reopenInductionReadingSchema', () => {
  it('acepta horas como texto y nota vacia', () => {
    const result = reopenInductionReadingSchema.safeParse({ hours: '48', note: '' });
    expect(result.success).toBe(true);
    expect((result as any).data).toEqual({ hours: 48, note: undefined });
  });

  it('rechaza horas fuera de rango o no enteras', () => {
    expect(reopenInductionReadingSchema.safeParse({ hours: 0 }).success).toBe(false);
    expect(reopenInductionReadingSchema.safeParse({ hours: 721 }).success).toBe(false);
    expect(reopenInductionReadingSchema.safeParse({ hours: 1.5 }).success).toBe(false);
    expect(reopenInductionReadingSchema.safeParse({}).success).toBe(false);
  });

  it('recorta la nota y rechaza mas de 500 caracteres', () => {
    expect((reopenInductionReadingSchema.parse({ hours: 2, note: '  ok  ' }) as any).note).toBe('ok');
    expect(reopenInductionReadingSchema.safeParse({ hours: 2, note: 'x'.repeat(501) }).success).toBe(false);
  });
});
