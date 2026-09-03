import pool from '../config/db';
import { getLabsMobileConfig, getWhapiConfig, isOutboundNotifyEnabled } from '../config/env';
import { sendGenericEmail } from './email.service';
import { recordOutbound } from './outbox.service';

/**
 * Notificaciones del modulo de evaluaciones por canales (correo, SMS y
 * WhatsApp). Cada canal registra su propio envio en la bandeja de salida
 * (correo en email.service; SMS/WhatsApp aqui). `dispatch` solo registra el
 * caso "sin destino" y devuelve si se envio.
 */

interface SendContext {
  subject: string;
  message: string;
  template: string;
  assignmentId: number | null;
}

interface NotificationChannel {
  readonly name: 'email' | 'sms' | 'whatsapp';
  send(recipient: string, context: SendContext): Promise<void>;
}

// Numero nacional MX de 10 digitos -> anteponer lada de pais 52 (Whapi exige
// formato internacional sin '+'). Datos legacy con lada (>=11 digitos) se usan
// tal cual. Mismo criterio que smsChannel.
const toInternationalMx = (recipient: string): string => {
  const digits = recipient.replace(/[^\d]/g, '');
  return digits.length === 10 ? `52${digits}` : digits;
};

const whatsappChannel: NotificationChannel = {
  name: 'whatsapp',
  async send(recipient, context) {
    const config = getWhapiConfig();
    if (!config) {
      await recordOutbound({
        channel: 'whatsapp',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'skipped',
        error: 'WHATSAPP_NOT_CONFIGURED',
      });
      const error = new Error('WHATSAPP_NOT_CONFIGURED');
      (error as any).code = 'WHATSAPP_NOT_CONFIGURED';
      throw error;
    }
    try {
      const response = await fetch(`${config.apiBase}/messages/text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toInternationalMx(recipient),
          body: context.message,
        }),
      });
      if (!response.ok) {
        throw new Error(`Whapi HTTP ${response.status}`);
      }
      await recordOutbound({
        channel: 'whatsapp',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'sent',
      });
    } catch (error) {
      await recordOutbound({
        channel: 'whatsapp',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};

const emailChannel: NotificationChannel = {
  name: 'email',
  async send(recipient, context) {
    const html = context.message
      .split('\n')
      .map((line) => `<p style="margin:0 0 8px">${line}</p>`)
      .join('');
    // email.service registra el envio (sent/failed) en la bandeja de salida.
    await sendGenericEmail(recipient, context.subject, html, {
      template: context.template,
      assignmentId: context.assignmentId,
      bodyText: context.message,
    });
  },
};

const smsChannel: NotificationChannel = {
  name: 'sms',
  async send(recipient, context) {
    const config = getLabsMobileConfig();
    if (!config) {
      await recordOutbound({
        channel: 'sms',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'skipped',
        error: 'SMS_NOT_CONFIGURED',
      });
      const error = new Error('SMS_NOT_CONFIGURED');
      (error as any).code = 'SMS_NOT_CONFIGURED';
      throw error;
    }
    // Numero nacional MX de 10 digitos -> anteponer lada de pais 52 para LabsMobile.
    // Si ya trae lada (>= 11 digitos, p. ej. datos antiguos '+52...'), se usa tal cual.
    const digits = recipient.replace(/[^\d]/g, '');
    const msisdn = digits.length === 10 ? `52${digits}` : digits;
    const auth = Buffer.from(`${config.username}:${config.token}`).toString('base64');
    try {
      const response = await fetch(config.apiBase, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: context.message,
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
      await recordOutbound({
        channel: 'sms',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'sent',
      });
    } catch (error) {
      await recordOutbound({
        channel: 'sms',
        recipient,
        body: context.message,
        template: context.template,
        assignmentId: context.assignmentId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};

/** Envia por un canal; el canal registra su envio. No relanza. */
const dispatch = async (
  channel: NotificationChannel,
  recipient: string | null,
  subject: string,
  message: string,
  template: string,
  assignmentId: number | null,
): Promise<boolean> => {
  if (!isOutboundNotifyEnabled()) {
    await recordOutbound({
      channel: channel.name,
      recipient: recipient ?? '(sin destino)',
      subject,
      body: message,
      template,
      assignmentId,
      status: 'skipped',
      error: 'notify_disabled',
    });
    return false;
  }
  if (!recipient || recipient.trim().length === 0) {
    await recordOutbound({
      channel: channel.name,
      recipient: '(sin destino)',
      subject,
      body: message,
      template,
      assignmentId,
      status: 'skipped',
      error: 'recipient_missing',
    });
    return false;
  }
  try {
    await channel.send(recipient, { subject, message, template, assignmentId });
    return true;
  } catch {
    return false;
  }
};

/**
 * Envio generico por correo + SMS, reutilizable fuera de evaluaciones (p. ej.
 * recordatorios de mantenimiento/calibracion). Registra en la bandeja de salida
 * con assignment_id nulo; `template` distingue el tipo de aviso.
 */
export const sendGenericNotification = async (
  recipient: { email: string | null; phone: string | null },
  subject: string,
  emailBody: string,
  smsBody: string,
  template: string,
): Promise<{ emailSent: boolean; smsSent: boolean }> => {
  const emailSent = await dispatch(emailChannel, recipient.email, subject, emailBody, template, null);
  const smsSent = await dispatch(smsChannel, recipient.phone, subject, smsBody, template, null);
  return { emailSent, smsSent };
};

/** Envio suelto por WhatsApp (Whapi Cloud), fuera del flujo de evaluaciones. */
export const sendWhatsAppNotification = async (
  phone: string | null,
  message: string,
  template: string,
): Promise<boolean> => dispatch(whatsappChannel, phone, template, message, template, null);


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

/** Recordatorio (correo + SMS) cuando la ventana esta por vencer (<= 24h). */
export const notifyEvaluationReminder = async (assignmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT e.full_name, e.email, e.phone, c.title AS course_title, a.deadline_at
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
  const deadline = formatDeadline(String(row.deadline_at));
  const subject = `Recordatorio: tu evaluacion "${row.course_title}" esta por vencer`;
  const emailBody =
    `Hola ${row.full_name},\n` +
    `Te recordamos que tu evaluacion de "${row.course_title}" vence pronto (${deadline}).\n` +
    `Ingresa a SafeDoc para realizarla antes de que se cierre la ventana.`;
  const smsBody = `SafeDoc: tu evaluacion de "${row.course_title}" vence el ${deadline}. Realizala pronto.`;

  await dispatch(emailChannel, row.email ? String(row.email) : null, subject, emailBody, 'evaluation_reminder', assignmentId);
  await dispatch(smsChannel, row.phone ? String(row.phone) : null, subject, smsBody, 'evaluation_reminder', assignmentId);
};

/** Aviso a RH (correo) de que una evaluacion vencio sin realizarse. */
export const notifyEvaluationExpiredToRh = async (assignmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT e.full_name AS employee_name, c.title AS course_title, u.email AS creator_email
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
  const subject = `Evaluacion vencida: ${row.course_title}`;
  const body =
    `El colaborador ${row.employee_name} no realizo la evaluacion de "${row.course_title}" dentro de las 72 horas.\n` +
    `La evaluacion quedo vencida. Puedes autorizar una realizacion extemporanea desde SafeDoc.`;
  await dispatch(emailChannel, rhEmail, subject, body, 'evaluation_expired_rh', assignmentId);
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
