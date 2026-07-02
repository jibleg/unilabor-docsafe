import { describe, expect, it } from 'vitest';
import { loginSchema, recoverPasswordSchema } from './auth.schema';
import {
  changePasswordSchema,
  createUserSchema,
  replaceUserCategoriesSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from './user.schema';
import {
  helpdeskAssetSchema,
  helpdeskTicketSchema,
  maintenanceOrderCloseSchema,
  maintenancePlanSchema,
} from './helpdesk.schema';
import {
  createCategorySchema,
  updateCategoryStatusSchema,
} from './category.schema';
import {
  updateDocumentMetadataSchema,
  updateDocumentStatusSchema,
} from './document.schema';
import { createEmployeeSchema, updateEmployeeSchema } from './employee.schema';

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

describe('user.schema (restantes)', () => {
  it('updateUserSchema exige al menos un campo', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ full_name: 'Nuevo' }).success).toBe(true);
  });

  it('updateUserSchema rechaza rol invalido y conserva campos extra', () => {
    expect(updateUserSchema.safeParse({ role: 'BOSS' }).success).toBe(false);
    const r = updateUserSchema.safeParse({ role: 'editor', full_name: 'X' });
    expect(r.success && (r.data as any).role).toBe('EDITOR');
  });

  it('resetUserPasswordSchema trata vacio como ausente y exige min 6 si viene', () => {
    expect(resetUserPasswordSchema.safeParse({ temporaryPassword: '' }).success).toBe(true);
    expect(resetUserPasswordSchema.safeParse({ temporaryPassword: '123' }).success).toBe(false);
    expect(resetUserPasswordSchema.safeParse({ temporaryPassword: '123456' }).success).toBe(true);
  });

  it('replaceUserCategoriesSchema acepta arreglos por cualquiera de las dos claves', () => {
    expect(replaceUserCategoriesSchema.safeParse({ categoryIds: [1, 2] }).success).toBe(true);
    expect(replaceUserCategoriesSchema.safeParse({ category_ids: [1] }).success).toBe(true);
  });
});

describe('category.schema', () => {
  it('createCategorySchema exige nombre >= 2 y conserva claves extra', () => {
    expect(createCategorySchema.safeParse({ name: 'A' }).success).toBe(false);
    const r = createCategorySchema.safeParse({ name: ' Calidad ', extra: 'keep' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Calidad');
      expect((r.data as any).extra).toBe('keep'); // passthrough
    }
  });

  it('updateCategoryStatusSchema exige is_active presente', () => {
    expect(updateCategoryStatusSchema.safeParse({}).success).toBe(false);
    expect(updateCategoryStatusSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateCategoryStatusSchema.safeParse({ is_active: 'true' }).success).toBe(true);
  });
});

describe('document.schema', () => {
  it('updateDocumentStatusSchema normaliza y restringe a active/inactive', () => {
    const r = updateDocumentStatusSchema.safeParse({ status: ' ACTIVE ' });
    expect(r.success && (r.data as any).status).toBe('active');
    expect(updateDocumentStatusSchema.safeParse({ status: 'borrado' }).success).toBe(false);
  });

  it('updateDocumentMetadataSchema exige al menos un campo', () => {
    expect(updateDocumentMetadataSchema.safeParse({}).success).toBe(false);
    expect(updateDocumentMetadataSchema.safeParse({ title: 'Nuevo titulo' }).success).toBe(true);
  });
});

describe('employee.schema', () => {
  it('createEmployeeSchema exige nombre y correo', () => {
    expect(createEmployeeSchema.safeParse({ full_name: 'Ana' }).success).toBe(false);
    expect(createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx' }).success).toBe(true);
  });

  it('updateEmployeeSchema exige al menos un campo y rechaza vacios explicitos', () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ area: 'Laboratorio' }).success).toBe(true);
    expect(updateEmployeeSchema.safeParse({ full_name: '' }).success).toBe(false);
  });

  it('telefono acepta 10 digitos con o sin mascara y los normaliza', () => {
    const conMascara = createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: '993 117 3210' });
    expect(conMascara.success).toBe(true);
    // Se normaliza a solo digitos (10) para almacenar.
    expect((conMascara as any).data.phone).toBe('9931173210');

    const conGuiones = createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: '(993) 117-3210' });
    expect(conGuiones.success).toBe(true);
    expect((conGuiones as any).data.phone).toBe('9931173210');
  });

  it('telefono vacio o nulo queda como null (sin telefono)', () => {
    const vacio = createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: '' });
    expect(vacio.success).toBe(true);
    expect((vacio as any).data.phone).toBe(null);

    const nulo = createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: null });
    expect(nulo.success).toBe(true);
    expect((nulo as any).data.phone).toBe(null);
  });

  it('telefono ausente no agrega la clave phone (no toca en updates)', () => {
    const sinPhone = updateEmployeeSchema.safeParse({ area: 'Lab' });
    expect(sinPhone.success).toBe(true);
    expect('phone' in (sinPhone as any).data).toBe(false);
  });

  it('telefono con menos o mas de 10 digitos es invalido', () => {
    expect(createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: '12345' }).success).toBe(false);
    expect(createEmployeeSchema.safeParse({ full_name: 'Ana', email: 'a@b.mx', phone: '993 117 32100' }).success).toBe(
      false,
    );
  });
});

describe('helpdesk.schema (resto)', () => {
  it('helpdeskAssetSchema exige name; asset_code es opcional (autogenerado)', () => {
    // name sigue siendo obligatorio
    expect(helpdeskAssetSchema.safeParse({ asset_code: 'PC1' }).success).toBe(false);
    // asset_code opcional: el backend autogenera el codigo ISO si no viene
    expect(helpdeskAssetSchema.safeParse({ name: 'PC' }).success).toBe(true);
    expect(helpdeskAssetSchema.safeParse({ asset_code: 'PC1', name: 'PC' }).success).toBe(true);
  });

  it('helpdeskTicketSchema exige titulo y descripcion', () => {
    expect(helpdeskTicketSchema.safeParse({ title: 'Falla' }).success).toBe(false);
    expect(helpdeskTicketSchema.safeParse({ title: 'Falla', description: 'No enciende' }).success).toBe(true);
  });

  it('maintenanceOrderCloseSchema exige completed_at, actividades y resultado', () => {
    expect(
      maintenanceOrderCloseSchema.safeParse({ completed_at: '2026-06-12', performed_activities: 'Limpieza' }).success,
    ).toBe(false);
    expect(
      maintenanceOrderCloseSchema.safeParse({
        completed_at: '2026-06-12',
        performed_activities: 'Limpieza',
        result: 'COMPLETED',
      }).success,
    ).toBe(true);
  });
});
