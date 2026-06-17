import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, ChevronDown, LogOut, UserCircle2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useUserAvatar } from '../hooks/useUserAvatar';
import { getModuleRole } from '../utils/modules';
import type { ModuleCode } from '../types/models';

const profilePath = (moduleCode: ModuleCode): string =>
  moduleCode === 'RH' ? '/rh/profile' : moduleCode === 'HELPDESK' ? '/helpdesk/profile' : '/quality/profile';

/**
 * Menu de usuario del header: avatar + nombre + dropdown con Perfil, Cambiar de
 * modulo (si hay mas de uno) y Cerrar sesion. Cierra al hacer clic fuera o Escape.
 */
export const UserMenu = ({ moduleCode }: { moduleCode: ModuleCode }) => {
  const user = useAuthStore((state) => state.user);
  const availableModules = useAuthStore((state) => state.availableModules);
  const setActiveModule = useAuthStore((state) => state.setActiveModule);
  const logout = useAuthStore((state) => state.logout);
  const { avatarUrl } = useUserAvatar();
  const moduleRole = getModuleRole(availableModules, moduleCode) ?? user?.role ?? 'VIEWER';

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = user?.full_name ?? user?.name ?? 'Usuario';
  const avatarInitial = displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : 'U';

  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    if (window.confirm('¿Seguro que deseas cerrar sesión?')) {
      logout();
    }
  };

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--unilabor-ink)] transition hover:bg-[rgba(191,212,230,0.34)] hover:text-[var(--color-brand-700)]';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[rgba(0,65,106,0.1)] bg-[rgba(239,245,250,0.92)] py-1 pl-1 pr-2 transition hover:bg-[rgba(191,212,230,0.34)]"
      >
        <span className="h-8 w-8 overflow-hidden rounded-full border border-[rgba(0,65,106,0.1)] bg-[rgba(124,173,211,0.28)]">
          {avatarUrl ? (
            <img src={avatarUrl} alt={`Avatar de ${displayName}`} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-black text-[var(--color-brand-700)]">
              {avatarInitial}
            </span>
          )}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[160px] truncate text-xs font-bold text-[var(--unilabor-ink)]">{displayName}</span>
          <span className="block text-[10px] uppercase tracking-wide text-[var(--color-brand-500)]">{moduleRole}</span>
        </span>
        <ChevronDown size={16} className="text-[var(--color-brand-700)]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/98 p-2 shadow-2xl shadow-[rgba(0,65,106,0.18)]"
        >
          <div className="border-b border-[rgba(0,65,106,0.08)] px-3 pb-2 pt-1">
            <p className="truncate text-sm font-bold text-[var(--unilabor-ink)]">{displayName}</p>
            <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">{user?.email}</p>
          </div>

          <div className="mt-1 space-y-0.5">
            <NavLink to={profilePath(moduleCode)} onClick={() => setOpen(false)} className={itemClass}>
              <UserCircle2 size={16} /> Perfil
            </NavLink>

            {availableModules.length > 1 && (
              <NavLink
                to="/select-module"
                onClick={() => {
                  setActiveModule(null);
                  setOpen(false);
                }}
                className={itemClass}
              >
                <Building2 size={16} /> Cambiar de módulo
              </NavLink>
            )}

            <button type="button" onClick={handleLogout} className={`${itemClass} text-red-600 hover:text-red-700`}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
