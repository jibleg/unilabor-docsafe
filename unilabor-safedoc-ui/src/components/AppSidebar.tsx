import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ClipboardPen,
  FileText,
  GraduationCap,
  Inbox,
  Laptop,
  LifeBuoy,
  LayoutDashboard,
  Move,
  ShieldCheck,
  Tags,
  UserCircle2,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';
import { getModuleRole } from '../utils/modules';
import { usePendingEvaluations } from '../hooks/usePendingEvaluations';
import unilaborIcon from '../assets/icono-UNILABOR.png';
import type { ModuleCode } from '../types/models';

interface SidebarMenuItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles?: string[];
  badgeCount?: number;
}

interface SidebarSection {
  title?: string;
  items: SidebarMenuItem[];
}

interface AppSidebarProps {
  moduleCode: ModuleCode;
  isVisible: boolean;
  onToggleVisibility: () => void;
}

export const AppSidebar = ({ moduleCode, isVisible, onToggleVisibility }: AppSidebarProps) => {
  const user = useAuthStore((state) => state.user);
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, moduleCode) ?? user?.role ?? 'VIEWER';
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


  const menuSections: SidebarSection[] =
    moduleCode === 'RH'
      ? [
          {
            items: [
              { icon: LayoutDashboard, label: 'Dashboard RH', path: '/rh/dashboard', roles: ['ADMIN', 'EDITOR'] },
            ],
          },
          {
            title: 'Expedientes',
            items: [
              { icon: Users, label: 'Colaboradores', path: '/rh/employees', roles: ['ADMIN', 'EDITOR'] },
              { icon: FileText, label: 'Expedientes', path: '/rh/expedients', roles: ['ADMIN', 'EDITOR'] },
              { icon: AlertTriangle, label: 'Alertas', path: '/rh/alerts', roles: ['ADMIN', 'EDITOR'] },
            ],
          },
          {
            title: 'Capacitación',
            items: [
              { icon: GraduationCap, label: 'Capacitaciones', path: '/rh/trainings', roles: ['ADMIN', 'EDITOR'] },
              { icon: ClipboardPen, label: 'Capacitación práctica', path: '/rh/practical-capture', roles: ['ADMIN', 'EDITOR'] },
              { icon: BarChart3, label: 'Panel capacitación', path: '/rh/training-dashboard', roles: ['ADMIN', 'EDITOR'] },
              { icon: ClipboardCheck, label: 'Calificación', path: '/rh/grading', roles: ['ADMIN', 'EDITOR'] },
              { icon: Clock, label: 'Extemporáneos', path: '/rh/late-requests', roles: ['ADMIN', 'EDITOR'] },
              { icon: Inbox, label: 'Bandeja de salida', path: '/rh/notifications', roles: ['ADMIN', 'EDITOR'] },
            ],
          },
          {
            title: 'Configuración',
            items: [
              { icon: Tags, label: 'Secciones', path: '/rh/document-sections', roles: ['ADMIN', 'EDITOR'] },
              { icon: ShieldCheck, label: 'Tipos documentales', path: '/rh/document-types', roles: ['ADMIN', 'EDITOR'] },
              { icon: ShieldCheck, label: 'Auditoría RH', path: '/rh/audit', roles: ['ADMIN', 'EDITOR'] },
            ],
          },
          {
            title: 'Mi espacio',
            items: [
              { icon: FileText, label: 'Mi expediente', path: '/rh/my-expedient', roles: ['VIEWER'] },
              {
                icon: GraduationCap,
                label: 'Mis evaluaciones',
                path: '/rh/my-evaluations',
                badgeCount: pendingEvaluations,
              },
              { icon: UserCircle2, label: 'Mi perfil', path: '/rh/profile' },
            ],
          },
        ]
      : moduleCode === 'HELPDESK'
        ? [
            {
              items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/helpdesk/dashboard' },
                { icon: UserCircle2, label: 'Mi portal', path: '/helpdesk/my-portal' },
              ],
            },
            {
              title: 'Inventario y Equipos (ISO 15189)',
              items: [
                { icon: Laptop, label: 'Activos', path: '/helpdesk/assets', roles: ['ADMIN', 'EDITOR'] },
                { icon: ClipboardCheck, label: 'Entrega-Recepción', path: '/helpdesk/handovers', roles: ['ADMIN', 'EDITOR'] },
                { icon: Move, label: 'Movimientos', path: '/helpdesk/movements', roles: ['ADMIN', 'EDITOR'] },
                { icon: CalendarClock, label: 'Mantenimiento', path: '/helpdesk/maintenance', roles: ['ADMIN', 'EDITOR'] },
                { icon: ShieldCheck, label: 'Calibración', path: '/helpdesk/calibration', roles: ['ADMIN', 'EDITOR'] },
                { icon: CalendarDays, label: 'Calendario de servicios', path: '/helpdesk/service-calendar', roles: ['ADMIN', 'EDITOR'] },
              ],
            },
            {
              title: 'Mesa de ayuda',
              items: [
                { icon: LifeBuoy, label: 'Solicitudes', path: '/helpdesk/tickets', roles: ['ADMIN', 'EDITOR'] },
              ],
            },
            {
              title: 'Configuración',
              items: [
                { icon: Wrench, label: 'Catálogos', path: '/helpdesk/catalogs', roles: ['ADMIN'] },
                { icon: Building2, label: 'Estructura', path: '/helpdesk/org-structure', roles: ['ADMIN'] },
                { icon: UserCircle2, label: 'Mi perfil', path: '/helpdesk/profile' },
              ],
            },
          ]
        : [
            {
              items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/quality/dashboard' },
                { icon: FileText, label: 'Documentos', path: '/quality/documents' },
              ],
            },
            {
              title: 'Administración',
              items: [
                { icon: Tags, label: 'Categorías', path: '/quality/categories', roles: ['ADMIN', 'EDITOR'] },
                { icon: Users, label: 'Personal', path: '/quality/users', roles: ['ADMIN'] },
                { icon: ShieldCheck, label: 'Auditoría', path: '/quality/audit', roles: ['ADMIN'] },
              ],
            },
            {
              title: 'Mi espacio',
              items: [{ icon: UserCircle2, label: 'Mi perfil', path: '/quality/profile' }],
            },
          ];

  const renderItem = (item: SidebarMenuItem) => (
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
      {item.badgeCount !== undefined && item.badgeCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1.5 text-[10px] font-bold text-white">
          {item.badgeCount}
        </span>
      )}
    </NavLink>
  );

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
                    ? 'Unilabor Helpdesk'
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
            (item) => !item.roles || hasAnyRole(moduleRole, item.roles),
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
