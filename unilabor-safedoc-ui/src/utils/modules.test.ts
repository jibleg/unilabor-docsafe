import { describe, expect, it } from 'vitest';
import { getModuleHomePath, getModuleRole, normalizeModuleCode } from './modules';
import { hasAnyRole, normalizeRole } from './roles';
import type { ModuleAccess } from '../types/models';

const access = (code: string, role: string): ModuleAccess =>
  ({ code, name: code, description: null, icon: null, role, is_active: true, sort_order: 0 }) as ModuleAccess;

describe('normalizeModuleCode', () => {
  it('normaliza variantes de mayusculas/espacios', () => {
    expect(normalizeModuleCode(' helpdesk ')).toBe('HELPDESK');
    expect(normalizeModuleCode('Quality')).toBe('QUALITY');
  });

  it('devuelve null para codigos no reconocidos o vacios', () => {
    expect(normalizeModuleCode('OTRO')).toBeNull();
    expect(normalizeModuleCode(null)).toBeNull();
  });
});

describe('getModuleHomePath', () => {
  it('mapea cada modulo a su ruta de inicio', () => {
    expect(getModuleHomePath('RH')).toBe('/rh');
    expect(getModuleHomePath('HELPDESK')).toBe('/helpdesk/dashboard');
    expect(getModuleHomePath('QUALITY')).toBe('/quality/dashboard');
  });
});

describe('getModuleRole', () => {
  const modules = [access('QUALITY', 'VIEWER'), access('HELPDESK', 'ADMIN')];

  it('devuelve el rol del modulo solicitado', () => {
    expect(getModuleRole(modules, 'HELPDESK')).toBe('ADMIN');
  });

  it('devuelve null cuando el usuario no tiene ese modulo', () => {
    expect(getModuleRole(modules, 'RH')).toBeNull();
  });
});

describe('hasAnyRole', () => {
  it('compara roles sin distinguir mayusculas', () => {
    expect(hasAnyRole('admin', ['ADMIN', 'EDITOR'])).toBe(true);
    expect(hasAnyRole('VIEWER', ['ADMIN', 'EDITOR'])).toBe(false);
  });

  it('es falso cuando el rol es nulo', () => {
    expect(hasAnyRole(null, ['ADMIN'])).toBe(false);
  });
});

describe('normalizeRole', () => {
  it('recorta y pasa a mayusculas', () => {
    expect(normalizeRole(' editor ')).toBe('EDITOR');
    expect(normalizeRole(null)).toBe('');
  });
});
