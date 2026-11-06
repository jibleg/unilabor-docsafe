import pool from '../config/db';
import { XlabUnavailableError, xlabQuery } from '../config/xlab-db';

/**
 * Notificaciones de Contigo+ (contigo.staff_notifications) del usuario de la sesion.
 * El destinatario sale SIEMPRE del vinculo del usuario: la clave de XLab nunca viene
 * del cliente, y toda consulta a `xlab` va acotada a esa clave.
 */
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
  linked: boolean;
  available: boolean;
  rows: MyNotification[];
  total: number;
  unread: number;
}

const OWN_COLUMNS = 'id, tipo, titulo, cuerpo, nota, contexto, created_at, read_at';

const getLinkedCveUsuario = async (userId: string): Promise<number | null> => {
  const { rows } = await pool.query<{ cve_usuario: number }>(
    'SELECT cve_usuario FROM public.xlab_user_links WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.cve_usuario ?? null;
};

export const listMyNotifications = async (userId: string, limit: number, offset: number): Promise<MyNotificationsPage> => {
  const cve = await getLinkedCveUsuario(userId);
  if (cve === null) {
    return { linked: false, available: true, rows: [], total: 0, unread: 0 };
  }
  try {
    const totals = await xlabQuery<{ total: string; unread: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE read_at IS NULL) AS unread
         FROM contigo.staff_notifications
        WHERE cve_usuario = $1`,
      [cve],
    );
    const { rows } = await xlabQuery<MyNotification>(
      `SELECT ${OWN_COLUMNS}
         FROM contigo.staff_notifications
        WHERE cve_usuario = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [cve, limit, offset],
    );
    return {
      linked: true,
      available: true,
      rows: rows.map((row) => ({ ...row, contexto: row.contexto ?? {} })),
      total: Number(totals.rows[0]?.total ?? 0),
      unread: Number(totals.rows[0]?.unread ?? 0),
    };
  } catch (error) {
    if (error instanceof XlabUnavailableError) {
      return { linked: true, available: false, rows: [], total: 0, unread: 0 };
    }
    throw error;
  }
};

export const countMyUnreadNotifications = async (userId: string): Promise<number> => {
  const cve = await getLinkedCveUsuario(userId);
  if (cve === null) {
    return 0;
  }
  try {
    const { rows } = await xlabQuery<{ n: string }>(
      'SELECT count(*) AS n FROM contigo.staff_notifications WHERE cve_usuario = $1 AND read_at IS NULL',
      [cve],
    );
    return Number(rows[0]?.n ?? 0);
  } catch (error) {
    if (error instanceof XlabUnavailableError) {
      return 0;
    }
    throw error;
  }
};

/** Marca una como leida. false si no existe o no es del usuario (no se distingue a proposito). */
export const markMyNotificationRead = async (userId: string, notificationId: string): Promise<boolean> => {
  const cve = await getLinkedCveUsuario(userId);
  if (cve === null) {
    return false;
  }
  const { rowCount } = await xlabQuery(
    `UPDATE contigo.staff_notifications
        SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND cve_usuario = $2`,
    [notificationId, cve],
  );
  return (rowCount ?? 0) > 0;
};

export const markAllMyNotificationsRead = async (userId: string): Promise<number> => {
  const cve = await getLinkedCveUsuario(userId);
  if (cve === null) {
    return 0;
  }
  const { rowCount } = await xlabQuery(
    'UPDATE contigo.staff_notifications SET read_at = now() WHERE cve_usuario = $1 AND read_at IS NULL',
    [cve],
  );
  return rowCount ?? 0;
};
