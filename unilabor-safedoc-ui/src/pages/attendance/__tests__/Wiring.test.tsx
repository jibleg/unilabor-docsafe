import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../../../App';
import { ModuleSelectorPage } from '../../ModuleSelectorPage';
import { NAV_CONFIG } from '../../../config/navigation';
import { getModuleHomePath, normalizeModuleCode } from '../../../utils/modules';
import { hasPermission } from '../../../utils/permissions';
import { useAuthStore } from '../../../store/useAuthStore';
import { ATTENDANCE_ALL, ATTENDANCE_READONLY, installHarness, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
// Pruebas de ensamblaje con el shell completo de la app (layout, navbar, guards): sus efectos
// asincronos propios disparan avisos de act que no pertenecen a las pantallas de asistencias.
// ModuleGuard llama setActiveModule durante el render (defecto previo del componente compartido).
installHarness({ ignoreWarnings: [/not wrapped in act/, /Cannot update a component .*ModuleGuard/s] });

const visibleItems = (permissions: string[]) =>
  NAV_CONFIG.ATTENDANCE.flatMap((section) => section.items.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => item.path));

const renderApp = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('NAV_CONFIG.ATTENDANCE', () => {
  it('con todos los permisos muestra las 11 entradas (10 pantallas + perfil)', () => {
    expect(visibleItems(ATTENDANCE_ALL)).toEqual([
      '/attendance/dashboard', '/attendance/commitment', '/attendance/days', '/attendance/punches', '/attendance/incidents',
      '/attendance/schedule', '/attendance/shifts', '/attendance/employees', '/attendance/devices', '/attendance/settings', '/attendance/profile',
    ]);
  });

  it('solo lectura oculta Turnos, Relojes y Parametros', () => {
    const paths = visibleItems(ATTENDANCE_READONLY);
    expect(paths).not.toContain('/attendance/shifts');
    expect(paths).not.toContain('/attendance/devices');
    expect(paths).not.toContain('/attendance/settings');
    expect(paths).toContain('/attendance/dashboard');
    expect(paths).toContain('/attendance/profile');
  });

  it('sin permisos solo queda el perfil', () => {
    expect(visibleItems([])).toEqual(['/attendance/profile']);
  });
});

describe('modulos', () => {
  it('getModuleHomePath / normalizeModuleCode', () => {
    expect(getModuleHomePath('ATTENDANCE')).toBe('/attendance/dashboard');
    expect(normalizeModuleCode(' attendance ')).toBe('ATTENDANCE');
  });

  it('el selector muestra el modulo de asistencias y entra al dashboard', async () => {
    const other = { code: 'QUALITY', name: 'Calidad', description: null, icon: null, role: 'VIEWER', is_active: true, sort_order: 0 };
    setAuth(ATTENDANCE_ALL);
    useAuthStore.setState({
      availableModules: [
        other as never,
        { code: 'ATTENDANCE', name: 'Control de Asistencias', description: null, icon: null, role: 'ADMIN', is_active: true, sort_order: 1 } as never,
      ],
      activeModule: null,
    });
    render(
      <MemoryRouter initialEntries={['/select']}>
        <Routes>
          <Route path="/select" element={<ModuleSelectorPage />} />
          <Route path="/attendance/dashboard" element={<div>destino-asistencias</div>} />
          <Route path="*" element={<div>otro</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const card = screen.getByRole('heading', { name: 'Control de Asistencias' }).closest('button') as HTMLButtonElement;
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Módulo de Asistencias')).toBeInTheDocument();
    card.click();
    expect(await screen.findByText('destino-asistencias')).toBeInTheDocument();
    expect(useAuthStore.getState().activeModule).toBe('ATTENDANCE');
  });

  it('con un solo modulo ATTENDANCE el selector redirige solo', async () => {
    setAuth(ATTENDANCE_ALL);
    render(
      <MemoryRouter initialEntries={['/select']}>
        <Routes>
          <Route path="/select" element={<ModuleSelectorPage />} />
          <Route path="/attendance/dashboard" element={<div>destino-asistencias</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('destino-asistencias')).toBeInTheDocument();
  });
});

describe('rutas de App (/attendance/*)', () => {
  const cases: Array<[string, RegExp]> = [
    ['/attendance/dashboard', /Hoy en vivo/],
    ['/attendance/commitment', /Compromiso por periodo/],
    ['/attendance/days', /^Días$/],
    ['/attendance/punches', /^Checadas$/],
    ['/attendance/incidents', /^Incidencias$/],
    ['/attendance/schedule', /Calendario de horarios/],
    ['/attendance/shifts', /^Turnos$/],
    ['/attendance/employees', /^Colaboradores$/],
    ['/attendance/employees/3', /Ana Torres Ruiz/],
    ['/attendance/devices', /^Relojes$/],
    ['/attendance/settings', /^Parámetros$/],
  ];

  it.each(cases)('%s carga la pagina correcta', async (path, heading) => {
    setAuth(ATTENDANCE_ALL);
    renderApp(path);
    expect((await screen.findAllByRole('heading', { name: heading }, { timeout: 4000 })).length).toBeGreaterThan(0);
  });

  it('/attendance redirige a /attendance/dashboard', async () => {
    setAuth(ATTENDANCE_ALL);
    renderApp('/attendance');
    expect((await screen.findAllByRole('heading', { name: /Hoy en vivo/ }, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/attendance/dashboard');
  });

  it.each(['/attendance/shifts', '/attendance/devices', '/attendance/settings'])('%s redirige al dashboard sin el permiso de escritura/gestion', async (path) => {
    setAuth(ATTENDANCE_READONLY);
    renderApp(path);
    await waitFor(() => expect(window.location.pathname).toBe('/attendance/dashboard'), { timeout: 4000 });
    expect((await screen.findAllByRole('heading', { name: /Hoy en vivo/ }, { timeout: 4000 })).length).toBeGreaterThan(0);
  });

  it('sin RECORDS.READ las pantallas de lectura redirigen al perfil', async () => {
    setAuth([]);
    renderApp('/attendance/dashboard');
    await waitFor(() => expect(window.location.pathname).toBe('/attendance/profile'), { timeout: 4000 });
  });

  it('sin modulo ATTENDANCE el guard saca al usuario', async () => {
    setAuth(ATTENDANCE_ALL);
    useAuthStore.setState({ availableModules: [{ code: 'QUALITY', name: 'Calidad', description: null, icon: null, role: 'VIEWER', is_active: true, sort_order: 0 } as never] });
    renderApp('/attendance/dashboard');
    await waitFor(() => expect(window.location.pathname).not.toBe('/attendance/dashboard'), { timeout: 4000 });
  });

  it('sin sesion va a /login', async () => {
    setAuth(ATTENDANCE_ALL);
    useAuthStore.setState({ token: null });
    renderApp('/attendance/dashboard');
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 4000 });
  });

  it('la barra lateral muestra el menu de asistencias filtrado por permisos', async () => {
    setAuth(ATTENDANCE_READONLY);
    renderApp('/attendance/dashboard');
    await screen.findAllByRole('heading', { name: /Hoy en vivo/ }, { timeout: 4000 });
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/attendance/days');
    expect(links).not.toContain('/attendance/devices');
    expect(links).not.toContain('/attendance/settings');
  });
});
