import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './useAuthStore';
import type { ModuleAccess, User } from '../types/models';

const user: User = { id: 'u1', name: 'Test', email: 't@x.mx', role: 'ADMIN' } as User;

const access = (code: string, role = 'ADMIN'): ModuleAccess =>
  ({ code, name: code, description: null, icon: null, role, is_active: true, sort_order: 0 }) as ModuleAccess;

beforeEach(() => {
  useAuthStore.getState().logout();
  localStorage.clear();
});

describe('useAuthStore', () => {
  it('setAuth guarda token y usuario', () => {
    useAuthStore.getState().setAuth('tok-123', user, [access('HELPDESK'), access('QUALITY')]);
    const state = useAuthStore.getState();
    expect(state.token).toBe('tok-123');
    expect(state.user?.id).toBe('u1');
    expect(state.availableModules).toHaveLength(2);
  });

  it('setAuth selecciona automaticamente el modulo cuando hay solo uno', () => {
    useAuthStore.getState().setAuth('tok', user, [access('HELPDESK')]);
    expect(useAuthStore.getState().activeModule).toBe('HELPDESK');
  });

  it('setAuth no fija modulo activo cuando hay varios', () => {
    useAuthStore.getState().setAuth('tok', user, [access('HELPDESK'), access('RH')]);
    expect(useAuthStore.getState().activeModule).toBeNull();
  });

  it('setAvailableModules conserva el modulo activo si sigue disponible', () => {
    useAuthStore.getState().setAuth('tok', user, [access('HELPDESK')]);
    useAuthStore.getState().setAvailableModules([access('HELPDESK'), access('RH')]);
    expect(useAuthStore.getState().activeModule).toBe('HELPDESK');
  });

  it('logout limpia toda la sesion', () => {
    useAuthStore.getState().setAuth('tok', user, [access('HELPDESK')]);
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.availableModules).toEqual([]);
    expect(state.activeModule).toBeNull();
  });
});
