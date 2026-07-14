import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { AppSidebar } from '../components/AppSidebar';
import { PendingEvaluationsBanner } from '../components/PendingEvaluationsBanner';
import { UserMenu } from '../components/UserMenu';
import { useAuthStore } from '../store/useAuthStore';
import { usePendingEvaluationsStore } from '../store/usePendingEvaluationsStore';
import { getCurrentUserProfile, getMyAccess } from '../api/service';
import { tokenRequiresPasswordChange } from '../utils/auth';
import { ChevronRight } from 'lucide-react';
import type { ModuleCode } from '../types/models';

export const MainLayout = ({ moduleCode }: { moduleCode: ModuleCode }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const setAvailableModules = useAuthStore((state) => state.setAvailableModules);
  const setPermissions = useAuthStore((state) => state.setPermissions);
  const setActiveModule = useAuthStore((state) => state.setActiveModule);
  const refreshPendingEvaluations = usePendingEvaluationsStore((state) => state.refresh);
  const resetPendingEvaluations = usePendingEvaluationsStore((state) => state.reset);
  const { pathname } = useLocation();
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(true);

  const mustChangePassword =
    Boolean(user?.mustChangePassword) || (token ? tokenRequiresPasswordChange(token) : false);

  useEffect(() => {
    setActiveModule(moduleCode);
  }, [moduleCode, setActiveModule]);

  // Recalcula los pendientes de capacitacion en cada navegacion del modulo RH,
  // para que el badge y el banner reflejen las evaluaciones ya realizadas.
  useEffect(() => {
    if (!token || mustChangePassword) {
      return;
    }
    if (moduleCode === 'RH') {
      void refreshPendingEvaluations();
    } else {
      resetPendingEvaluations();
    }
  }, [token, mustChangePassword, moduleCode, pathname, refreshPendingEvaluations, resetPendingEvaluations]);

  useEffect(() => {
    if (!token || mustChangePassword) {
      return;
    }

    let isCancelled = false;

    const refreshProfile = async () => {
      try {
        const profile = await getCurrentUserProfile();
        if (!isCancelled) {
          setUser(profile);
        }
      } catch {
        // If profile refresh fails, we keep existing auth data and let route guards/backend handle auth errors.
      }
    };

    // Refresca modulos + permisos efectivos (RBAC) sin exigir re-login, para que
    // los cambios de rol/permiso apliquen al recargar la app.
    const refreshAccess = async () => {
      try {
        const { availableModules, permissions } = await getMyAccess();
        if (!isCancelled) {
          setAvailableModules(availableModules);
          setPermissions(permissions);
        }
      } catch {
        // Si falla, se conserva el acceso persistido; el backend sigue siendo la autoridad.
      }
    };

    void refreshProfile();
    void refreshAccess();

    return () => {
      isCancelled = true;
    };
  }, [token, mustChangePassword, setUser, setAvailableModules, setPermissions]);

  if (!token) return <Navigate to="/login" />;
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className="relative min-h-screen text-[var(--unilabor-ink)]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(191,212,230,0.42),transparent_32%)]" />
      <AppSidebar
        moduleCode={moduleCode}
        isVisible={isDesktopSidebarVisible}
        onToggleVisibility={() => setIsDesktopSidebarVisible((visible) => !visible)}
      />
      <AppNavbar moduleCode={moduleCode} />
      {!isDesktopSidebarVisible && (
        <button
          type="button"
          onClick={() => setIsDesktopSidebarVisible(true)}
          className="fixed left-4 top-4 z-50 hidden items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] shadow-lg shadow-[rgba(0,65,106,0.1)] transition hover:bg-white lg:inline-flex"
          title="Mostrar menu lateral"
        >
          <ChevronRight size={14} />
          Menu
        </button>
      )}
      <main
        className={`transition-[margin] duration-300 ease-in-out ${
          isDesktopSidebarVisible ? 'lg:ml-64' : 'lg:ml-0'
        }`}
      >
        <header className="sticky top-0 z-30 hidden items-center justify-end border-b border-[rgba(0,65,106,0.08)] bg-white/80 px-6 py-2.5 backdrop-blur-xl lg:flex">
          <UserMenu moduleCode={moduleCode} />
        </header>
        <div className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            {moduleCode === 'RH' && <PendingEvaluationsBanner />}
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
