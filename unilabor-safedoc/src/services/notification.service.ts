import pool from '../config/db';
import { getLabsMobileConfig } from '../config/env';
import { sendGenericEmail } from './email.service';

/**
 * Notificaciones del modulo de evaluaciones por canales abstractos (correo y SMS).
 * - EmailChannel: reusa el SMTP existente.
 * - SmsChannel: LabsMobile (API JSON). Si no hay credenciales, queda deshabilitado
 *   y se registra 'skipped' (no rompe el flujo).
 * Todo envio queda en `notification_log` para trazabilidad ISO.
 */

type ChannelName = 'email' | 'sms';
type NotificationStatus = 'sent' | 'failed' | 'skipped';

const recordNotification = async (
  channel: ChannelName,
  recipient: string,
  template: string,
  assignmentId: number | null,
  status: NotificationStatus,
  error: string | null,
): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO public.notification_log (channel, recipient, template, assignment_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [channel, recipient, template, assignmentId, status, error],
    );
  } catch (logError) {
    console.error('No se pudo registrar la notificacion en la bitacora:', logError);
  }
};

interface NotificationChannel {
  readonly name: ChannelName;
  send(recipient: string, subject: string, message: string): Promise<void>;
}

const emailChannel: NotificationChannel = {
  name: 'email',
  async send(recipient, subject, message) {
    const html = message
      .split('\n')
      .map((line) => `<p style="margin:0 0 8px">${line}</p>`)
      .join('');
    await sendGenericEmail(recipient, subject, html);
  },
};

const smsChannel: NotificationChannel = {
  name: 'sms',
  async send(recipient, _subject, message) {
    const config = getLabsMobileConfig();
    if (!config) {
      const error = new Error('SMS_NOT_CONFIGURED');
      (error as any).code = 'SMS_NOT_CONFIGURED';
      throw error;
    }
    const msisdn = recipient.replace(/[^\d]/g, '');
    const auth = Buffer.from(`${config.username}:${config.token}`).toString('base64');
    const response = await fetch('https://api.labsmobile.com/json/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        tac: 1,
        recipient: [{ msisdn }],
        ...(config.sender ? { sender: config.sender } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`LabsMobile HTTP ${response.status}`);
    }
    const data = (await response.json().catch(() => ({}))) as { code?: string | number; message?: string };
    if (data.code !== undefined && String(data.code) !== '0') {
      throw new Error(`LabsMobile code ${data.code}: ${data.message ?? 'error'}`);
    }
  },
};

/** Envia por un canal y registra el resultado (sent/failed/skipped). No relanza. */
const dispatch = async (
  channel: NotificationChannel,
  recipient: string | null,
  subject: string,
  message: string,
  template: string,
  assignmentId: number | null,
): Promise<boolean> => {
  if (!recipient || recipient.trim().length === 0) {
    await recordNotification(channel.name, '(sin destino)', template, assignmentId, 'skipped', 'recipient_missing');
    return false;
  }
  try {
    await channel.send(recipient, subject, message);
    await recordNotification(channel.name, recipient, template, assignmentId, 'sent', null);
    return true;
  } catch (error: any) {
    const status: NotificationStatus = error?.code === 'SMS_NOT_CONFIGURED' ? 'skipped' : 'failed';
    await recordNotification(
      channel.name,
      recipient,
      template,
      assignmentId,
      status,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const formatDeadline = (iso: string): string =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });

interface AvailableContext {
  assignmentId: number;
  employeeName: string;
  email: string | null;
  phone: string | null;
  courseTitle: string;
  templateTitle: string;
  deadlineAt: string;
}

/** Aviso al colaborador (correo + SMS) de que tiene una evaluacion disponible 72h. */
export const notifyEvaluationAvailable = async (assignmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT e.full_name, e.email, e.phone, c.title AS course_title, t.title AS template_title, a.deadline_at
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       JOIN public.employees e ON e.id = a.employee_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    return;
  }
  const row = result.rows[0];
  const ctx: AvailableContext = {
    assignmentId,
    employeeName: String(row.full_name),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    courseTitle: String(row.course_title),
    templateTitle: String(row.template_title),
    deadlineAt: String(row.deadline_at),
  };

  const deadline = formatDeadline(ctx.deadlineAt);
  const subject = `Evaluacion de capacitacion disponible: ${ctx.courseTitle}`;
  const emailBody =
    `Hola ${ctx.employeeName},\n` +
    `Tienes disponible la evaluacion "${ctx.templateTitle}" de la capacitacion "${ctx.courseTitle}".\n` +
    `Cuentas con 72 horas para realizarla (hasta el ${deadline}).\n` +
    `Ingresa a SafeDoc, en tu modulo de evaluaciones, para responderla.\n` +
    `Si no alcanzas a realizarla en el plazo, contacta a RH para una autorizacion extemporanea.`;
  const smsBody =
    `SafeDoc: tienes una evaluacion de "${ctx.courseTitle}" disponible. ` +
    `Tienes 72h (hasta ${deadline}). Ingresa a SafeDoc para responderla.`;

  const emailSent = await dispatch(emailChannel, ctx.email, subject, emailBody, 'evaluation_available', assignmentId);
  const smsSent = await dispatch(smsChannel, ctx.phone, subject, smsBody, 'evaluation_available', assignmentId);

  if (emailSent) {
    await pool.query(
      `UPDATE public.evaluation_assignments SET notified_email_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [assignmentId],
    );
  }
  if (smsSent) {
    await pool.query(
      `UPDATE public.evaluation_assignments SET notified_sms_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [assignmentId],
    );
  }
};

/** Aviso a RH (correo) de que un colaborador no acredito y requiere recapacitacion. */
export const notifyNotAccredited = async (assignmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT e.full_name AS employee_name, c.title AS course_title, a.percentage, a.created_by_user_id,
            u.email AS creator_email
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       JOIN public.employees e ON e.id = a.employee_id
       LEFT JOIN public.users u ON u.id = a.created_by_user_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    return;
  }
  const row = result.rows[0];

  const rhEmail = await resolveRhEmail(row.creator_email ? String(row.creator_email) : null);
  const percentage = row.percentage !== null ? Number(row.percentage) : 0;
  const subject = `Colaborador no acreditado: ${row.course_title}`;
  const body =
    `El colaborador ${row.employee_name} no acredito la evaluacion de la capacitacion "${row.course_title}" ` +
    `(calificacion ${percentage}%).\n` +
    `Se requiere programar su recapacitacion.`;

  await dispatch(emailChannel, rhEmail, subject, body, 'not_accredited_rh', assignmentId);
};

const resolveRhEmail = async (creatorEmail: string | null): Promise<string | null> => {
  if (creatorEmail) {
    return creatorEmail;
  }
  const configured = process.env.NOTIFY_RH_EMAIL?.trim();
  if (configured) {
    return configured;
  }
  const admin = await pool.query(
    `SELECT email FROM public.users WHERE is_active = TRUE ORDER BY (role = 'ADMIN') DESC, created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].email) : null;
};

/** Listado de la bitacora de notificaciones (vista RH). */
export const listNotificationLog = async (limit = 100): Promise<Array<Record<string, unknown>>> => {
  const result = await pool.query(
    `SELECT n.id, n.channel, n.recipient, n.template, n.assignment_id, n.status, n.error, n.sent_at,
            e.full_name AS employee_name, c.title AS course_title
       FROM public.notification_log n
       LEFT JOIN public.evaluation_assignments a ON a.id = n.assignment_id
       LEFT JOIN public.employees e ON e.id = a.employee_id
       LEFT JOIN public.evaluation_templates t ON t.id = a.template_id
       LEFT JOIN public.training_courses c ON c.id = t.training_course_id
      ORDER BY n.sent_at DESC
      LIMIT $1;`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    channel: String(row.channel),
    recipient: String(row.recipient),
    template: String(row.template),
    assignment_id: row.assignment_id !== null ? Number(row.assignment_id) : null,
    status: String(row.status),
    error: row.error ? String(row.error) : null,
    sent_at: String(row.sent_at),
    employee_name: row.employee_name ? String(row.employee_name) : null,
    course_title: row.course_title ? String(row.course_title) : null,
  }));
};

/** Hook best-effort: notifica a RH cuando una evaluacion queda no acreditada. */
export const tryNotifyNotAccredited = async (assignmentId: number, failed: boolean): Promise<void> => {
  if (!failed) {
    return;
  }
  try {
    await notifyNotAccredited(assignmentId);
  } catch (error) {
    console.error('No se pudo notificar el no-acreditado a RH:', error);
  }
};

/** Hook best-effort: notifica disponibilidad al asignar. */
export const tryNotifyEvaluationAvailable = async (assignmentId: number): Promise<void> => {
  try {
    await notifyEvaluationAvailable(assignmentId);
  } catch (error) {
    console.error('No se pudo notificar la disponibilidad de la evaluacion:', error);
  }
};
