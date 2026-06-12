import { describe, expect, it } from 'vitest';
import { loginSchema, recoverPasswordSchema } from './auth.schema';
import { changePasswordSchema, createUserSchema } from './user.schema';
import { maintenancePlanSchema } from './helpdesk.schema';

describe('auth.schema', () => {
  it('loginSchema acepta email no vacio y recorta', () => {
    const r = loginSchema.safeParse({ email: '  a@b.mx ', password: 'x' });
    expect(r.success && r.data.email).toBe('a@b.mx');
  });

  it('loginSchema rechaza sin password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.mx' }).success).toBe(false);
  });

  it('recoverPasswordSchema exige formato de email', () => {
    expect(recoverPasswordSchema.safeParse({ email: 'no-es-email' }).success).toBe(false);
    expect(recoverPasswordSchema.safeParse({ email: 'a@b.mx' }).success).toBe(true);
  });
});

describe('user.schema', () => {
  it('changePasswordSchema exige minimo 6 caracteres', () => {
    expect(changePasswordSchema.safeParse({ newPassword: '123' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ newPassword: '123456' }).success).toBe(true);
  });

  it('createUserSchema normaliza casing, rol y deduplica categorias', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.mx',
      full_name: 'Ana',
      role: 'admin',
      categoryIds: ['2', '2', 3],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.role).toBe('ADMIN');
      expect(r.data.category_ids).toEqual([2, 3]);
      expect(r.data.module_codes).toEqual(['QUALITY']); // default
    }
  });

  it('createUserSchema rechaza rol invalido', () => {
    expect(
      createUserSchema.safeParse({ email: 'a@b.mx', full_name: 'X', role: 'BOSS' }).success,
    ).toBe(false);
  });

  it('createUserSchema exige categoria para VIEWER en QUALITY', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.mx',
      full_name: 'V',
      role: 'VIEWER',
      category_ids: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('helpdesk.schema (maintenancePlanSchema)', () => {
  it('coerciona asset_id, normaliza vacios a null y aplica defaults', () => {
    const r = maintenancePlanSchema.safeParse({
      asset_id: '7',
      title: 'Plan',
      starts_on: '2026-06-12',
      next_due_on: '2026-07-12',
      description: '',
      tasks: ['Revisar'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.asset_id).toBe(7);
      expect(r.data.description).toBeNull();
      expect(r.data.tolerance_before_days).toBe(0);
      expect(r.data.checklist_required).toBe(true);
    }
  });

  it('rechaza cuando falta el activo o el titulo', () => {
    expect(
      maintenancePlanSchema.safeParse({ title: 'P', starts_on: '2026-06-12', next_due_on: '2026-07-12' }).success,
    ).toBe(false);
    expect(
      maintenancePlanSchema.safeParse({ asset_id: 1, starts_on: '2026-06-12', next_due_on: '2026-07-12' }).success,
    ).toBe(false);
  });
});
