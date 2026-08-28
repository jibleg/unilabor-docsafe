import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardPen,
  Clock,
  FileText,
  GraduationCap,
  Inbox,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Move,
  PenLine,
  ShieldCheck,
  Signature,
  Tags,
  Truck,
  UserCircle2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleCode } from '../types/models';

// Fuente unica de la navegacion por modulo. La consumen sidebar (escritorio),
// navbar (movil) y — a futuro — el gating de rutas, para no mantener el menu
// en varios lugares. Cada item se muestra si el usuario tiene el `permission`
// (OR si es arreglo); sin `permission` es siempre visible (p.ej. Mi perfil).
export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  permission?: string | string[];
  badge?: 'pendingEvaluations';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_CONFIG: Record<ModuleCode, NavSection[]> = {
  QUALITY: [
    {
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/quality/dashboard', permission: 'QUALITY.DOCUMENTS.READ' },
        { icon: FileText, label: 'Documentos', path: '/quality/documents', permission: 'QUALITY.DOCUMENTS.READ' },
        { icon: BookOpen, label: 'Sala de lectura', path: '/quality/reading-room', permission: 'QUALITY.READING.MANAGE' },
      ],
    },
    {
      title: 'Administración',
      items: [
        { icon: Tags, label: 'Categorías', path: '/quality/categories', permission: 'QUALITY.CATEGORIES.WRITE' },
      ],
    },
    {
      title: 'Mi espacio',
      items: [
        { icon: PenLine, label: 'Mis lecturas', path: '/quality/my-readings', permission: 'QUALITY.SELF.READING' },
        { icon: UserCircle2, label: 'Mi perfil', path: '/quality/profile' },
      ],
    },
  ],
  ADMIN: [
    {
      title: 'Administración del sistema',
      items: [
        { icon: Users, label: 'Personal', path: '/admin/users', permission: 'ADMIN.USERS.READ' },
        { icon: KeyRound, label: 'Roles y permisos', path: '/admin/roles', permission: 'ADMIN.ROLES.MANAGE' },
        { icon: ShieldCheck, label: 'Auditoría', path: '/admin/audit', permission: 'ADMIN.AUDIT.READ' },
      ],
    },
    {
      title: 'Mi espacio',
      items: [{ icon: UserCircle2, label: 'Mi perfil', path: '/admin/profile' }],
    },
  ],
  RH: [
    {
      items: [
        { icon: LayoutDashboard, label: 'Dashboard RH', path: '/rh/dashboard', permission: 'RH.EMPLOYEES.READ' },
      ],
    },
    {
      title: 'Expedientes',
      items: [
        { icon: Users, label: 'Colaboradores', path: '/rh/employees', permission: 'RH.EMPLOYEES.READ' },
        { icon: FileText, label: 'Expedientes', path: '/rh/expedients', permission: 'RH.EMPLOYEE_DOCS.READ' },
        { icon: AlertTriangle, label: 'Alertas', path: '/rh/alerts', permission: 'RH.ALERTS.READ' },
        { icon: FileText, label: 'Documentos institucionales', path: '/rh/institutional-documents', permission: 'RH.ACKNOWLEDGEMENTS.MANAGE' },
        { icon: Signature, label: 'Seguimiento de acuses', path: '/rh/acknowledgements', permission: 'RH.ACKNOWLEDGEMENTS.MANAGE' },
        { icon: Briefcase, label: 'Puestos (inducción)', path: '/rh/positions', permission: 'RH.INDUCTION.MANAGE' },
        { icon: GraduationCap, label: 'Fases de inducción', path: '/rh/induction', permission: 'RH.INDUCTION.MANAGE' },
      ],
    },
    {
      title: 'Capacitación',
      items: [
        { icon: GraduationCap, label: 'Capacitaciones', path: '/rh/trainings', permission: 'RH.TRAINING.MANAGE' },
        { icon: ClipboardPen, label: 'Capacitación práctica', path: '/rh/practical-capture', permission: 'RH.TRAINING.MANAGE' },
        { icon: BarChart3, label: 'Panel capacitación', path: '/rh/training-dashboard', permission: 'RH.EVAL_GRADING.READ' },
        { icon: ClipboardCheck, label: 'Calificación', path: '/rh/grading', permission: 'RH.EVAL_GRADING.READ' },
        { icon: Clock, label: 'Extemporáneos', path: '/rh/late-requests', permission: 'RH.EVAL_GRADING.READ' },
        { icon: Inbox, label: 'Bandeja de salida', path: '/rh/notifications', permission: 'RH.EVAL_GRADING.READ' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { icon: Tags, label: 'Secciones', path: '/rh/document-sections', permission: 'RH.DOC_STRUCTURE.MANAGE' },
        { icon: ShieldCheck, label: 'Tipos documentales', path: '/rh/document-types', permission: 'RH.DOC_STRUCTURE.MANAGE' },
        { icon: ShieldCheck, label: 'Auditoría RH', path: '/rh/audit', permission: 'ADMIN.AUDIT.READ' },
      ],
    },
    {
      title: 'Mi espacio',
      items: [
        { icon: FileText, label: 'Mi expediente', path: '/rh/my-expedient', permission: 'RH.SELF.EXPEDIENT' },
        { icon: GraduationCap, label: 'Mis evaluaciones', path: '/rh/my-evaluations', permission: 'RH.SELF.EVALUATIONS', badge: 'pendingEvaluations' },
        { icon: PenLine, label: 'Sala de lectura', path: '/rh/my-acknowledgements', permission: 'RH.SELF.ACKNOWLEDGEMENTS' },
        { icon: Briefcase, label: 'Mi inducción', path: '/rh/my-induction', permission: 'RH.SELF.INDUCTION' },
        { icon: UserCircle2, label: 'Mi perfil', path: '/rh/profile' },
      ],
    },
  ],
  HELPDESK: [
    {
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/helpdesk/dashboard', permission: 'HELPDESK.DASHBOARD.READ' },
        { icon: UserCircle2, label: 'Mi portal', path: '/helpdesk/my-portal', permission: 'HELPDESK.SELF.TICKETS' },
      ],
    },
    {
      title: 'Inventario y Equipos (ISO 15189)',
      items: [
        { icon: Laptop, label: 'Activos', path: '/helpdesk/assets', permission: 'HELPDESK.ASSETS.WRITE' },
        { icon: ClipboardCheck, label: 'Entrega-Recepción', path: '/helpdesk/handovers', permission: 'HELPDESK.HANDOVERS.READ' },
        { icon: Move, label: 'Movimientos', path: '/helpdesk/movements', permission: 'HELPDESK.MOVEMENTS.WRITE' },
        { icon: CalendarClock, label: 'Mantenimiento', path: '/helpdesk/maintenance', permission: 'HELPDESK.MAINTENANCE.WRITE' },
        { icon: ShieldCheck, label: 'Calibración', path: '/helpdesk/calibration', permission: 'HELPDESK.CALIBRATION.WRITE' },
        { icon: CalendarDays, label: 'Calendario de servicios', path: '/helpdesk/service-calendar', permission: ['HELPDESK.MAINTENANCE.WRITE', 'HELPDESK.CALIBRATION.WRITE'] },
      ],
    },
    {
      title: 'Soporte',
      items: [
        { icon: LifeBuoy, label: 'Solicitudes', path: '/helpdesk/tickets', permission: 'HELPDESK.TICKETS.READ' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { icon: Wrench, label: 'Catálogos', path: '/helpdesk/catalogs', permission: 'HELPDESK.CATALOGS.MANAGE' },
        { icon: Building2, label: 'Estructura', path: '/helpdesk/org-structure', permission: 'HELPDESK.ORG.MANAGE' },
        { icon: UserCircle2, label: 'Mi perfil', path: '/helpdesk/profile' },
      ],
    },
  ],
  PROVIDERS: [
    {
      title: 'Acuerdos',
      items: [
        { icon: Truck, label: 'De proveedores', path: '/providers', permission: 'PROVIDERS.CATALOG.READ' },
        { icon: Truck, label: 'De clientes', path: '/providers/clients', permission: 'PROVIDERS.CLIENTS.CATALOG.READ' },
      ],
    },
    {
      title: 'Proveedores',
      items: [
        { icon: Building2, label: 'Proveedores', path: '/providers/catalog', permission: 'PROVIDERS.CATALOG.MANAGE' },
        { icon: Tags, label: 'Categorías', path: '/providers/categories', permission: 'PROVIDERS.CATALOG.MANAGE' },
        { icon: Bell, label: 'Alertas', path: '/providers/config', permission: 'PROVIDERS.CONFIG.MANAGE' },
      ],
    },
    {
      title: 'Clientes',
      items: [
        { icon: Building2, label: 'Clientes', path: '/providers/clients/catalog', permission: 'PROVIDERS.CLIENTS.CATALOG.MANAGE' },
        { icon: Tags, label: 'Categorías', path: '/providers/clients/categories', permission: 'PROVIDERS.CLIENTS.CATALOG.MANAGE' },
        { icon: Bell, label: 'Alertas', path: '/providers/clients/config', permission: 'PROVIDERS.CLIENTS.CONFIG.MANAGE' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { icon: Layers, label: 'Clasificación', path: '/providers/classifications', permission: 'PROVIDERS.CLASSIFICATIONS.MANAGE' },
        { icon: UserCircle2, label: 'Mi perfil', path: '/providers/profile' },
      ],
    },
  ],
};
