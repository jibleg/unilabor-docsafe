import { NavLink } from 'react-router-dom';
import {
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

interface SidebarMenuItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles?: string[];
}

interface AppSidebarProps {
  isVisible: boolean;
  onToggleVisibility: () => void;
}

export const AppSidebar = ({ isVisible, onToggleVisibility }: AppSidebarProps) => {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const displayName = user?.full_name ?? user?.name ?? 'Usuario';
  const { avatarUrl } = useUserAvatar();
  const avatarInitial =
    displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : 'U';

  const menuItems: SidebarMenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: UserCircle2, label: 'Mi perfil', path: '/profile' },
    { icon: FileText, label: 'Documentos', path: '/documents' },
    { icon: Tags, label: 'Categorias', path: '/categories', roles: ['ADMIN', 'EDITOR'] },
    { icon: Users, label: 'Personal', path: '/users', roles: ['ADMIN'] },
    { icon: ShieldCheck, label: 'Auditoria', path: '/audit', roles: ['ADMIN'] },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-slate-800/90 bg-slate-950/90 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:flex ${
        isVisible ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="border-b border-slate-800/80 p-4">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-3 py-2">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-sm font-black text-slate-950">
              U
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-cyan-100">SafeDoc</h2>
              <p className="mt-0.5 text-[10px] font-semibold uppercase text-slate-400">Lab IT Management</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:bg-slate-800 hover:text-cyan-100"
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
                    ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100 shadow-lg shadow-cyan-900/20'
                    : 'border-transparent text-slate-300 hover:bg-slate-900/70 hover:text-cyan-100'
                }
              `}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-800/80 p-4">
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-black text-cyan-100">
                  {avatarInitial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-100">{displayName}</p>
              <p className="text-[10px] uppercase tracking-wide text-cyan-300">{user?.role}</p>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-rose-300 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10"
        >
          <LogOut size={20} />
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
};
