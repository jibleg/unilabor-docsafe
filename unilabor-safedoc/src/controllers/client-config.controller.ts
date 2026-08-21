import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  addClientNotificationRecipient,
  listClientNotificationRecipients,
  removeClientNotificationRecipient,
} from '../services/client-config.service';
import { getNumberId, getText, logClientAudit } from './client-controller.shared';

export const listClientNotificationRecipientsController = async (_req: AuthRequest, res: Response) => {
  try {
    const recipients = await listClientNotificationRecipients();
    return res.json({ recipients });
  } catch (error) {
    console.error('Error listando destinatarios de alerta de clientes:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los destinatarios.' });
  }
};

export const addClientNotificationRecipientController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const userId = getText(req.body?.user_id);
  if (!userId) {
    return res.status(400).json({ message: 'El usuario es obligatorio.' });
  }

  try {
    const recipient = await addClientNotificationRecipient(userId);
    if (!recipient) {
      return res.status(500).json({ message: 'No se pudo agregar el destinatario.' });
    }

    await logClientAudit(user?.id, 'CLIENT_RECIPIENT_ADD', req.ip, recipient.id, 'client_notification_recipient');
    return res.status(201).json({ message: 'Destinatario agregado correctamente.', recipient });
  } catch (error: any) {
    if (error?.code === 'CLIENT_RECIPIENT_USER_NOT_FOUND') {
      return res.status(404).json({ message: 'El usuario indicado no existe.' });
    }

    console.error('Error agregando destinatario de alerta de clientes:', error);
    return res.status(500).json({ message: 'No se pudo agregar el destinatario.' });
  }
};

export const removeClientNotificationRecipientController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const recipientId = getNumberId(req.params.id);
  if (!recipientId) {
    return res.status(400).json({ message: 'ID de destinatario invalido.' });
  }

  try {
    const removed = await removeClientNotificationRecipient(recipientId);
    if (!removed) {
      return res.status(404).json({ message: 'Destinatario no encontrado.' });
    }

    await logClientAudit(user?.id, 'CLIENT_RECIPIENT_REMOVE', req.ip, recipientId, 'client_notification_recipient');
    return res.json({ message: 'Destinatario eliminado correctamente.' });
  } catch (error) {
    console.error('Error eliminando destinatario de alerta de clientes:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el destinatario.' });
  }
};
