import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ModuleGuard } from './ModuleGuard';
import { RoleGate } from './RoleGate';
import { useAuthStore } from '../store/useAuthStore';
import type { ModuleAccess } from '../types/models';

const access = (code: string, role: string): ModuleAccess =>
  ({ code, name: code, description: null, icon: null, role, is_active: true, sort_order: 0 }) as ModuleAccess;

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, availableModules: [], activeModule: null });
});

const renderModuleGuard = () =>
  render(
    <MemoryRouter initialEntries={['/helpdesk']}>
      <Routes>
        <Route
          path="/helpdesk"
          element={
            <ModuleGuard moduleCode="HELPDESK">
              <div>contenido helpdesk</div>
            </ModuleGuard>
          }
        />
        <Route path="/login" element={<div>pantalla login</div>} />
        <Route path="/quality/dashboard" element={<div>home quality</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ModuleGuard', () => {
  it('redirige a login sin token', () => {
    renderModuleGuard();
    expect(screen.getByText('pantalla login')).toBeInTheDocument();
  });

  it('muestra el contenido cuando el usuario tiene acceso al modulo', () => {
    useAuthStore.setState({ token: 'tok', availableModules: [access('HELPDESK', 'ADMIN')] });
    renderModuleGuard();
    expect(screen.getByText('contenido helpdesk')).toBeInTheDocument();
  });

  it('redirige al home del primer modulo cuando no tiene el modulo pedido', () => {
    useAuthStore.setState({ token: 'tok', availableModules: [access('QUALITY', 'VIEWER')] });
    renderModuleGuard();
    expect(screen.getByText('home quality')).toBeInTheDocument();
  });
});

const renderRoleGate = (allowedRoles: string[]) =>
  render(
    <MemoryRouter initialEntries={['/helpdesk/tickets']}>
      <Routes>
        <Route
          path="/helpdesk/tickets"
          element={
            <RoleGate allowedRoles={allowedRoles} redirectTo="/helpdesk/my-portal">
              <div>panel de tickets</div>
            </RoleGate>
          }
        />
        <Route path="/helpdesk/my-portal" element={<div>portal del colaborador</div>} />
        <Route path="/login" element={<div>pantalla login</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('RoleGate', () => {
  it('muestra el contenido cuando el rol del modulo esta permitido', () => {
    useAuthStore.setState({
      token: 'tok',
      activeModule: 'HELPDESK',
      availableModules: [access('HELPDESK', 'ADMIN')],
    });
    renderRoleGate(['ADMIN', 'EDITOR']);
    expect(screen.getByText('panel de tickets')).toBeInTheDocument();
  });

  it('redirige cuando el rol del modulo es insuficiente', () => {
    useAuthStore.setState({
      token: 'tok',
      activeModule: 'HELPDESK',
      availableModules: [access('HELPDESK', 'VIEWER')],
    });
    renderRoleGate(['ADMIN', 'EDITOR']);
    expect(screen.getByText('portal del colaborador')).toBeInTheDocument();
  });
});
