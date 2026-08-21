import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { usePendingEvaluations } from '../hooks/usePendingEvaluations';
import { NAV_CONFIG, type NavItem } from '../config/navigation';
import unilaborIcon from '../assets/icono-UNILABOR.png';
import type { ModuleCode } from '../types/models';

interface AppSidebarProps {
  moduleCode: ModuleCode;
  isVisible: boolean;
  onToggleVisibility: () => void;
}

export const AppSidebar = ({ moduleCode, isVisible, onToggleVisibility }: AppSidebarProps) => {
  const permissions = useAuthStore((state) => state.permissions);
  const { count: pendingEvaluations } = usePendingEvaluations(moduleCode === 'RH');

  // Secciones colapsadas (persistidas por usuario). Clave: `${modulo}:${titulo}`.
  const COLLAPSE_KEY = 'safedoc.sidebar.collapsed';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const toggleSection = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage no disponible: el colapso solo dura la sesion de vista.
      }
      return next;
    });


  const menuSections = NAV_CONFIG[moduleCode] ?? [];

  const renderItem = (item: NavItem) => {
    const badgeCount = item.badge === 'pendingEvaluations' ? pendingEvaluations : undefined;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) => `
          flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all
          ${
            isActive
              ? 'border-[rgba(0,65,106,0.14)] bg-[linear-gradient(135deg,rgba(191,212,230,0.45),rgba(124,173,211,0.2))] text-[var(--color-brand-700)] shadow-lg shadow-[rgba(0,65,106,0.08)]'
              : 'border-transparent text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.34)] hover:text-[var(--color-brand-700)]'
          }
        `}
      >
        <item.icon size={19} />
        <span className="flex-1">{item.label}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1.5 text-[10px] font-bold text-white">
            {badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

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
                {moduleCode === 'RH'
                  ? 'Unilabor RH'
                  : moduleCode === 'HELPDESK'
                    ? 'Unilabor Activos'
                    : moduleCode === 'ADMIN'
                      ? 'Unilabor Administración'
                      : moduleCode === 'PROVIDERS'
                        ? 'Unilabor Acuerdos'
                        : 'Unilabor Calidad'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.18)]"
            title="Ocultar menú"
            aria-label="Ocultar menú lateral"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {menuSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter(
            (item) => !item.permission || hasPermission(permissions, item.permission),
          );
          if (visibleItems.length === 0) {
            return null;
          }
          const sectionKey = `${moduleCode}:${section.title ?? `section-${sectionIndex}`}`;
          const isCollapsed = Boolean(section.title) && collapsed.has(sectionKey);
          return (
            <div key={sectionKey} className="space-y-1">
              {section.title && (
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  className="flex w-full items-center justify-between rounded-lg px-4 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
                  aria-expanded={!isCollapsed}
                >
                  <span>{section.title}</span>
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
              {!isCollapsed && visibleItems.map(renderItem)}
            </div>
          );
        })}
      </nav>

    </aside>
  );
};
