import { NavLink } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Tags,
  UserCircle2,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';
import { useUserAvatar } from '../hooks/useUserAvatar';
import unilaborIcon from '../assets/icono-UNILABOR.png';
import type { ModuleCode } from '../types/models';

interface SidebarMenuItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles?: string[];
}

interface AppSidebarProps {
  moduleCode: ModuleCode;
  isVisible: boolean;
  onToggleVisibility: () => void;
}

export const AppSidebar = ({ moduleCode, isVisible, onToggleVisibility }: AppSidebarProps) => {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const activeModule = useAuthStore((state) => state.activeModule);
  const availableModules = useAuthStore((state) => state.availableModules);
  const setActiveModule = useAuthStore((state) => state.setActiveModule);
  const displayName = user?.full_name ?? user?.name ?? 'Usuario';
  const { avatarUrl } = useUserAvatar();
  const avatarInitial =
    displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : 'U';

  const menuItems: SidebarMenuItem[] =
    moduleCode === 'RH'
      ? [
          { icon: LayoutDashboard, label: 'Dashboard RH', path: '/rh' },
          { icon: UserCircle2, label: 'Mi perfil', path: '/rh/profile' },
        ]
      : [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/quality/dashboard' },
          { icon: UserCircle2, label: 'Mi perfil', path: '/quality/profile' },
          { icon: FileText, label: 'Documentos', path: '/quality/documents' },
          { icon: Tags, label: 'Categorias', path: '/quality/categories', roles: ['ADMIN', 'EDITOR'] },
          { icon: Users, label: 'Personal', path: '/quality/users', roles: ['ADMIN'] },
          { icon: ShieldCheck, label: 'Auditoria', path: '/quality/audit', roles: ['ADMIN'] },
        ];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-[rgba(0,65,106,0.08)] bg-[rgba(255,255,255,0.88)] backdrop-blur-xl transition-transform duration-300 ease-in-out lg:flex ${
        isVisible ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="border-b border-[rgba(0,65,106,0.08)] p-4">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_100%)] px-3 py-2 shadow-[0_12px_28px_rgba(0,65,106,0.08)]">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-1 shadow-[0_8px_18px_rgba(0,65,106,0.08)] xl:h-11 xl:w-11">
              <img
                src={unilaborIcon}
                alt="Icono Unilabor"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--color-brand-700)]">SafeDoc</h2>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--unilabor-neutral)]">
                {moduleCode === 'RH' ? 'Unilabor RH' : 'Unilabor Calidad'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.18)]"
            title="Ocultar menu"
            aria-label="Ocultar menu lateral"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          if (item.roles && !hasAnyRole(user?.role, item.roles)) {
            return null;
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all
                ${
                  isActive
                    ? 'border-[rgba(0,65,106,0.14)] bg-[linear-gradient(135deg,rgba(191,212,230,0.45),rgba(124,173,211,0.2))] text-[var(--color-brand-700)] shadow-lg shadow-[rgba(0,65,106,0.08)]'
                    : 'border-transparent text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.34)] hover:text-[var(--color-brand-700)]'
                }
              `}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(0,65,106,0.08)] p-4">
        {availableModules.length > 1 && (
          <NavLink
            to="/select-module"
            onClick={() => setActiveModule(null)}
            className="mb-4 flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-4 py-3 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.34)]"
          >
            <Building2 size={18} />
            Cambiar modulo
          </NavLink>
        )}
        <div className="mb-4 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(124,173,211,0.28)]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-black text-[var(--color-brand-700)]">
                  {avatarInitial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--unilabor-ink)]">{displayName}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-brand-500)]">
                {user?.role} {activeModule ? `· ${activeModule}` : ''}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-[var(--color-brand-700)] transition-colors hover:border-[rgba(0,65,106,0.1)] hover:bg-[rgba(191,212,230,0.28)]"
        >
          <LogOut size={20} />
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
};
