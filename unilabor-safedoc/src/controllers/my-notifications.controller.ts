import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { XlabUnavailableError } from '../config/xlab-db';
import {
  countMyUnreadNotifications,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../services/my-notifications.service';

/**
 * "Mis notificaciones" de Contigo+. Solo requiere sesion: la identidad sale del JWT y
 * del vinculo con XLab, sin aceptar ninguna clave del cliente. Montado en
 * /api/my/notifications.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

const fail = (res: Response, error: unknown, context: string, message: string) => {
  if (error instanceof XlabUnavailableError) {
    return res.status(503).json({ message: 'Las notificaciones no estan disponibles por el momento. Intenta mas tarde.' });
  }
  console.error(context, error);
  return res.status(500).json({ message });
};

/** GET /my/notifications?limit&offset */
export const listMyNotificationsController = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const limit = parseInteger(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = parseInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  try {
    return res.json(await listMyNotifications(userId, limit, offset));
  } catch (error) {
    return fail(res, error, 'Error listando notificaciones:', 'No se pudieron cargar tus notificaciones.');
  }
};

/** GET /my/notifications/count  (contador de la campana) */
export const countMyNotificationsController = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  try {
    return res.json({ count: await countMyUnreadNotifications(userId) });
  } catch (error) {
    return fail(res, error, 'Error contando notificaciones:', 'No se pudieron consultar tus notificaciones.');
  }
};

/** POST /my/notifications/read-all */
export const markAllMyNotificationsReadController = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  try {
    return res.json({ updated: await markAllMyNotificationsRead(userId) });
  } catch (error) {
    return fail(res, error, 'Error marcando notificaciones:', 'No se pudieron marcar tus notificaciones.');
  }
};

/** POST /my/notifications/:id/read */
export const markMyNotificationReadController = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const id = String(req.params.id ?? '');
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ message: 'ID invalido.' });
  try {
    if (!(await markMyNotificationRead(userId, id))) {
      return res.status(404).json({ message: 'Notificacion no encontrada.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'Error marcando notificacion:', 'No se pudo marcar la notificacion.');
  }
};
