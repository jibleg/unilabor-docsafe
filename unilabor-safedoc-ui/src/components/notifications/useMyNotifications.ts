import { useCallback, useState } from 'react';
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../../api/service.api-my-notifications';
import { getApiErrorMessage } from '../../api/service.parsers';
import { useMyNotificationsStore } from '../../store/useMyNotificationsStore';
import type { MyNotification, MyNotificationsPage } from '../../types/models';
import { notifyError } from '../../utils/notify';

const EMPTY: MyNotificationsPage = { linked: true, available: true, rows: [], total: 0, unread: 0 };

/** Lista de notificaciones compartida por la campana y la página "Mis notificaciones". */
export const useMyNotifications = (pageSize: number) => {
  const setUnread = useMyNotificationsStore((state) => state.setUnread);
  const [data, setData] = useState<MyNotificationsPage>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listMyNotifications(pageSize, 0);
      setData(page);
      setUnread(page.unread);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar tus notificaciones.'));
    } finally {
      setLoading(false);
    }
  }, [pageSize, setUnread]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await listMyNotifications(pageSize, data.rows.length);
      setData((current) => ({ ...page, rows: [...current.rows, ...page.rows] }));
      setUnread(page.unread);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar más notificaciones.'));
    } finally {
      setLoadingMore(false);
    }
  }, [data.rows.length, pageSize, setUnread]);

  const markRead = useCallback(
    async (notification: MyNotification) => {
      if (notification.read_at) {
        return;
      }
      try {
        await markMyNotificationRead(notification.id);
        const readAt = new Date().toISOString();
        setData((current) => ({
          ...current,
          unread: Math.max(0, current.unread - 1),
          rows: current.rows.map((row) => (row.id === notification.id ? { ...row, read_at: readAt } : row)),
        }));
        setUnread(useMyNotificationsStore.getState().unread - 1);
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo marcar la notificación.'));
      }
    },
    [setUnread],
  );

  const markAllRead = useCallback(async () => {
    try {
      await markAllMyNotificationsRead();
      const readAt = new Date().toISOString();
      setData((current) => ({ ...current, unread: 0, rows: current.rows.map((row) => ({ ...row, read_at: row.read_at ?? readAt })) }));
      setUnread(0);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron marcar tus notificaciones.'));
    }
  }, [setUnread]);

  return { data, loading, loadingMore, load, loadMore, markRead, markAllRead };
};
