import pool from '../config/db';
import { sendGenericNotification } from './notification.service';

interface TicketNotifyRecipient {
  name: string;
  email: string | null;
  phone: string | null;
}

interface TicketNotifyRow {
  ticket_code: string;
  title: string;
  assigned_name: string | null;
  assigned_email: string | null;
  assigned_phone: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
}

const getTicketNotifyContext = async (ticketId: number): Promise<TicketNotifyRow | null> => {
  const result = await pool.query(
    `
      SELECT
        t.ticket_code, t.title,
        ae.full_name AS assigned_name, ae.email AS assigned_email, ae.phone AS assigned_phone,
        re.full_name AS requester_name, re.email AS requester_email, re.phone AS requester_phone
      FROM public.helpdesk_tickets t
      LEFT JOIN public.employees ae ON ae.id = t.assigned_employee_id
      LEFT JOIN public.employees re ON re.id = t.requester_employee_id
      WHERE t.id = $1
      LIMIT 1;
    `,
    [ticketId],
  );
  return result.rows[0] ?? null;
};

// Ambas notificaciones son best-effort (fire-and-forget desde las mutations,
// nunca relanzan) y se omiten en silencio si no hay email/telefono capturado
// -mismo criterio que los recordatorios de mantenimiento/calibracion.
export const notifyTicketAssigned = async (ticketId: number): Promise<void> => {
  try {
    const row = await getTicketNotifyContext(ticketId);
    if (!row || (!row.assigned_email && !row.assigned_phone)) {
      return;
    }

    const recipient: TicketNotifyRecipient = {
      name: row.assigned_name ?? '',
      email: row.assigned_email,
      phone: row.assigned_phone,
    };
    const subject = `Se te asigno la solicitud ${row.ticket_code}`;
    const emailBody =
      `Hola ${recipient.name},\n` +
      `Se te asigno la solicitud de soporte ${row.ticket_code}: "${row.title}".\n` +
      `Ingresa a SafeDoc, modulo de Mesa de Ayuda, para atenderla.`;
    const smsBody = `SafeDoc: se te asigno la solicitud ${row.ticket_code}. Ingresa a SafeDoc para atenderla.`;

    await sendGenericNotification(recipient, subject, emailBody, smsBody, 'HELPDESK_TICKET_ASSIGNED');
  } catch (error) {
    console.error(`No se pudo notificar la asignacion del ticket ${ticketId}:`, error);
  }
};

export const notifyTicketSolved = async (ticketId: number): Promise<void> => {
  try {
    const row = await getTicketNotifyContext(ticketId);
    if (!row || (!row.requester_email && !row.requester_phone)) {
      return;
    }

    const recipient: TicketNotifyRecipient = {
      name: row.requester_name ?? '',
      email: row.requester_email,
      phone: row.requester_phone,
    };
    const subject = `Tu solicitud ${row.ticket_code} fue atendida`;
    const emailBody =
      `Hola ${recipient.name},\n` +
      `Tu solicitud de soporte ${row.ticket_code}: "${row.title}" fue atendida.\n` +
      `Ingresa a SafeDoc, portal de autoservicio, para confirmar el funcionamiento y firmar tu conformidad.`;
    const smsBody = `SafeDoc: tu solicitud ${row.ticket_code} fue atendida. Ingresa a SafeDoc para confirmar el funcionamiento.`;

    await sendGenericNotification(recipient, subject, emailBody, smsBody, 'HELPDESK_TICKET_SOLVED');
  } catch (error) {
    console.error(`No se pudo notificar la solucion del ticket ${ticketId}:`, error);
  }
};
