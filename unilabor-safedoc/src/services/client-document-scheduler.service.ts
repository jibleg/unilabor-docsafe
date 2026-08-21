import cron from 'node-cron';
import pool from '../config/db';
import { sendGenericNotification } from './notification.service';

/**
 * Scheduler in-process (node-cron) de alertas de vencimiento de documentos de
 * cliente (contratos, convenios, polizas, etc.). Espejo de
 * `provider-document-scheduler.service.ts`: el destinatario es una lista
 * configurable de usuarios (`client_notification_recipients`), porque un
 * contrato no tiene un responsable individual capturado. Idempotente via
 * `reminder_sent_at`.
 *
 * Env:
 *   CLIENT_DOCUMENT_REMINDER_ENABLED=false  -> deshabilita
 *   CLIENT_DOCUMENT_REMINDER_CRON            -> expresion cron (default diario 08:30)
 *   CLIENT_DOCUMENT_REMINDER_DAYS            -> ventana de aviso en dias (default 30)
 */

export const DEFAULT_REMINDER_WINDOW_DAYS = 30;

export const getReminderWindowDays = (): number => {
  const raw = Number(process.env.CLIENT_DOCUMENT_REMINDER_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_REMINDER_WINDOW_DAYS;
};

// `expiry_date` es una columna DATE: `pg` la devuelve como Date (medianoche
// local), no como texto "YYYY-MM-DD". Formatear con String(date) da un
// toString() legible por humanos que rompe el re-parseo; toISOString().slice
// dado que estas columnas no llevan hora.
const formatDate = (value: unknown): string => {
  const isoDate = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' });
};

interface ReminderRecipient {
  name: string;
  email: string | null;
}

const getRecipients = async (): Promise<ReminderRecipient[]> => {
  const result = await pool.query(`
    SELECT u.full_name, u.email
    FROM public.client_notification_recipients r
    INNER JOIN public.users u ON u.id = r.user_id;
  `);

  return result.rows
    .map((row) => ({ name: String(row.full_name ?? ''), email: row.email ? String(row.email) : null }))
    .filter((recipient) => Boolean(recipient.email));
};

/** Procesa los recordatorios pendientes. Devuelve cuantos documentos avisó. */
export const processClientDocumentReminders = async (): Promise<number> => {
  const windowDays = getReminderWindowDays();

  const candidates = await pool.query(
    `
      SELECT d.id, d.title, d.expiry_date, cl.name AS client_name, cat.name AS category_name
      FROM public.client_documents d
      INNER JOIN public.clients cl ON cl.id = d.client_id
      LEFT JOIN public.client_document_categories cat ON cat.id = d.category_id
      WHERE d.status = 'active'
        AND d.reminder_sent_at IS NULL
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date <= (CURRENT_DATE + ($1 || ' days')::interval)
      ORDER BY d.expiry_date ASC;
    `,
    [windowDays],
  );

  if (candidates.rows.length === 0) {
    return 0;
  }

  const recipients = await getRecipients();
  if (recipients.length === 0) {
    // Sin destinatarios configurados: no marcamos, para reintentar cuando se de alta alguno.
    return 0;
  }

  let notified = 0;
  for (const row of candidates.rows) {
    const date = formatDate(row.expiry_date);
    const categoryLabel = row.category_name ? ` (${row.category_name})` : '';
    const subject = `Vencimiento de documento de cliente: ${row.client_name} — ${date}`;

    for (const recipient of recipients) {
      const emailBody =
        `Hola ${recipient.name},\n` +
        `El documento "${row.title}"${categoryLabel} del cliente ${row.client_name} vence el ${date}.\n` +
        `Revisa su renovacion o reemplazo en el modulo Acuerdos con los Clientes de SafeDoc.`;
      await sendGenericNotification({ email: recipient.email, phone: null }, subject, emailBody, '', 'client_document_reminder');
    }

    await pool.query('UPDATE public.client_documents SET reminder_sent_at = NOW() WHERE id = $1;', [row.id]);
    notified += 1;
  }

  return notified;
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Arranca el scheduler in-process de alertas de vencimiento de documentos de
 * cliente (default diario 08:30, para no chocar con el de proveedores en el
 * mismo minuto). Guardado por CLIENT_DOCUMENT_REMINDER_ENABLED=false. Arranque
 * defensivo: una falla al programar el cron NO tumba la API.
 */
export const startClientDocumentReminderScheduler = (): void => {
  if (process.env.CLIENT_DOCUMENT_REMINDER_ENABLED === 'false') {
    console.log('Scheduler de alertas de documentos de cliente deshabilitado (CLIENT_DOCUMENT_REMINDER_ENABLED=false).');
    return;
  }
  if (scheduledTask) {
    return;
  }
  const expression = process.env.CLIENT_DOCUMENT_REMINDER_CRON || '30 8 * * *';
  try {
    scheduledTask = cron.schedule(expression, () => {
      void processClientDocumentReminders().catch((error) => {
        console.error('Error en el ciclo del scheduler de alertas de documentos de cliente:', error);
      });
    });
    console.log(`Scheduler de alertas de documentos de cliente activo (cron "${expression}").`);
  } catch (error) {
    console.error('No se pudo iniciar el scheduler de alertas de documentos de cliente; la API continua sin el:', error);
  }
};
