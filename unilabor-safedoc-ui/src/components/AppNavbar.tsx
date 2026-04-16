import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Tags,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';
import { useUserAvatar } from '../hooks/useUserAvatar';

interface NavbarItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles?: string[];
}

export const AppNavbar = () => {
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { avatarUrl } = useUserAvatar();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const displayName = user?.full_name ?? user?.name ?? 'Usuario';
  const avatarInitial =
    displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : 'U';

  const items = useMemo<NavbarItem[]>(
    () => [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      { icon: UserCircle2, label: 'Mi perfil', path: '/profile' },
      { icon: FileText, label: 'Documentos', path: '/documents' },
      { icon: Tags, label: 'Categorias', path: '/categories', roles: ['ADMIN', 'EDITOR'] },
      { icon: Users, label: 'Personal', path: '/users', roles: ['ADMIN'] },
      { icon: ShieldCheck, label: 'Auditoria', path: '/audit', roles: ['ADMIN'] },
    ],
    [],
  );

  const visibleItems = items.filter((item) =>
    item.roles ? hasAnyRole(user?.role, item.roles) : true,
  );

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(0,65,106,0.08)] bg-white/90 backdrop-blur-xl lg:hidden">
      <div className="navbar px-4">
        <div className="navbar-start">
          <NavLink to="/dashboard" className="btn btn-ghost px-2 normal-case">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-200)] text-sm font-black text-[var(--color-brand-700)]">
              U
            </span>
            <span className="ml-2 text-base font-bold tracking-tight text-[var(--color-brand-700)]">SafeDoc</span>
          </NavLink>
        </div>

        <div className="navbar-end gap-2">
          <div className="flex items-center gap-2 rounded-full border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] px-2 py-1">
            <div className="h-7 w-7 overflow-hidden rounded-full border border-[rgba(0,65,106,0.08)] bg-[rgba(124,173,211,0.24)]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-black text-[var(--color-brand-700)]">
                  {avatarInitial}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="btn btn-sm btn-ghost btn-circle"
            aria-label="Alternar menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden border-t border-[rgba(0,65,106,0.08)] transition-all duration-300 ease-in-out ${
          isMobileMenuOpen ? 'max-h-[480px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="w-full space-y-3 px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.98)] px-3 py-2">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-[rgba(0,65,106,0.08)] bg-[rgba(124,173,211,0.24)]">
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
              <p className="truncate text-sm font-semibold text-[var(--unilabor-ink)]">{displayName}</p>
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-brand-500)]">{user?.role}</p>
            </div>
          </div>

          <ul className="menu rounded-box w-full border border-[rgba(0,65,106,0.08)] bg-white p-2 shadow-[0_14px_28px_rgba(0,65,106,0.08)]">
            {visibleItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive
                      ? 'rounded-lg bg-[rgba(191,212,230,0.45)] text-[var(--color-brand-700)]'
                      : 'rounded-lg text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.34)] hover:text-[var(--color-brand-700)]'
                  }
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={logout}
            className="btn btn-sm w-full border-[rgba(0,65,106,0.1)] bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)] hover:border-[rgba(0,65,106,0.14)] hover:bg-[rgba(124,173,211,0.34)]"
          >
            <LogOut size={14} />
            Cerrar sesion
          </button>
        </div>
      </div>
    </header>
  );
};
