import { describe, expect, it } from 'vitest';
import { saveAreaSignatoriesSchema, saveUnitSignatoriesSchema, unitSignatoryImpactQuerySchema } from './rh-supervision-signatories.schema';

describe('Firmantes por area: responsable general y suplente', () => {
  it('normaliza el area y distingue "no tocar el suplente" de "quitarlo"', () => {
    const parsed = saveAreaSignatoriesSchema.safeParse({
      rows: [
        { area_key: ' pre ', area_responsible_employee_id: '62' },
        { area_key: 'ANA', area_responsible_employee_id: 86, alternate_employee_id: null },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.rows[0]).toEqual({ area_key: 'PRE', area_responsible_employee_id: 62 });
    expect(parsed.data.rows[1]).toEqual({ area_key: 'ANA', area_responsible_employee_id: 86, alternate_employee_id: null });
  });

  it('rechaza un area repetida aunque cambie de mayusculas', () => {
    const parsed = saveAreaSignatoriesSchema.safeParse({
      rows: [
        { area_key: 'PRE', area_responsible_employee_id: 62 },
        { area_key: 'pre', area_responsible_employee_id: 64 },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza un cuerpo sin filas', () => {
    expect(saveAreaSignatoriesSchema.safeParse({ rows: [] }).success).toBe(false);
  });
});

describe('Firmantes por area: responsables por unidad', () => {
  it('acepta un responsable propio y "hereda del general" (null)', () => {
    const parsed = saveUnitSignatoriesSchema.safeParse({
      rows: [
        { unit_id: 1, area_key: 'pre', area_responsible_employee_id: 62 },
        { unit_id: 2, area_key: 'PRE', area_responsible_employee_id: null },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.rows[0]?.area_key).toBe('PRE');
  });

  it('rechaza la misma unidad y area dos veces', () => {
    const parsed = saveUnitSignatoriesSchema.safeParse({
      rows: [
        { unit_id: 1, area_key: 'PRE', area_responsible_employee_id: 62 },
        { unit_id: 1, area_key: 'pre', area_responsible_employee_id: null },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('exige decir que se hace con el responsable (el campo no se puede omitir)', () => {
    expect(saveUnitSignatoriesSchema.safeParse({ rows: [{ unit_id: 1, area_key: 'PRE' }] }).success).toBe(false);
    expect(saveUnitSignatoriesSchema.safeParse({ rows: [{ unit_id: 0, area_key: 'PRE', area_responsible_employee_id: null }] }).success).toBe(false);
  });
});

describe('Firmantes por area: impacto de un cambio por unidad', () => {
  it('lee las unidades separadas por coma, sin repetidos, y el colaborador opcional', () => {
    const parsed = unitSignatoryImpactQuerySchema.safeParse({ area_key: 'ana', unit_ids: '1,2,2', employee_id: '86' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ area_key: 'ANA', unit_ids: [1, 2], employee_id: 86 });
    const inherit = unitSignatoryImpactQuerySchema.safeParse({ area_key: 'ANA', unit_ids: '3' });
    expect(inherit.success && inherit.data.employee_id).toBeUndefined();
  });

  it('rechaza unidades mal formadas', () => {
    expect(unitSignatoryImpactQuerySchema.safeParse({ area_key: 'ANA', unit_ids: '1,,2' }).success).toBe(false);
    expect(unitSignatoryImpactQuerySchema.safeParse({ area_key: 'ANA', unit_ids: '0' }).success).toBe(false);
    expect(unitSignatoryImpactQuerySchema.safeParse({ area_key: 'ANA' }).success).toBe(false);
  });
});
