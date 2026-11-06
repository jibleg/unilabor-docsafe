/** Notificación de Contigo+ del usuario de la sesión (hoy, felicitaciones de pacientes). */
export interface MyNotification {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  nota: string | null;
  contexto: { rol?: string; clave?: string | null; fecha?: number | null; folio?: string | null };
  created_at: string;
  read_at: string | null;
}

export interface MyNotificationsPage {
  /** false: RH aún no vincula este usuario con XLab. */
  linked: boolean;
  /** false: XLab no respondió; la lista viene vacía sin ser error. */
  available: boolean;
  rows: MyNotification[];
  total: number;
  unread: number;
}

export interface XlabUser {
  cve_usuario: number;
  nombre: string;
  login: string | null;
  activo: boolean;
  tipo: number | null;
}

export interface EmployeeXlabLink {
  user_id: string | null;
  cve_usuario: number | null;
  linked_at: string | null;
  linked_by_name: string | null;
  xlab_user: XlabUser | null;
  xlab_available: boolean;
}
