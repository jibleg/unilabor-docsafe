import cron from 'node-cron';
import pool from '../config/db';
import { sendGenericNotification } from './notification.service';
import { expireOverdueReadings } from './quality-reading.service';

/**
 * Scheduler in-process de la sala de lectura (SL-05):
 * - Recordatorio cuando falta <= 24h del plazo, una sola vez por lectura.
 * - Marcado de vencidas. Idempotente.
 *
 * A diferencia del scheduler de acuses de RH, aqui el aviso SI se envia: el
 * lector es un usuario del sistema, asi que su correo esta a la mano. El sello
 * `reminder_sent_at` se escribe despues de intentar el envio, para no dar por
 * recordada una lectura que nunca se aviso.
 */

export const REMINDER_WINDOW_HOURS = 24;

interface PendingReminder {
  id: number;
  email: string | null;
  phone: string | null;
  user_name: string;
  document_title: string;
  deadline_at: string;
}

const tablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.quality_reading_acknowledgements') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const formatDeadline = (value: string | Date): string =>
  new Date(value).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });

/** Lecturas en curso cuyo plazo vence dentro de la ventana y no se han avisado. */
export const findReadingsDueForReminder = async (
  now: Date = new Date(),
): Promise<PendingReminder[]> => {
  const result = await pool.query(
    `SELECT a.id, u.email, u.full_name AS user_name, e.phone,
            p.title_snapshot AS document_title, a.deadline_at
       FROM public.quality_reading_acknowledgements a
       INNER JOIN public.quality_reading_publications p ON p.id = a.publication_id
       INNER JOIN public.users u ON u.id = a.user_id
       LEFT JOIN public.employees e ON e.id = a.employee_id
      WHERE a.status IN ('pending', 'in_progress', 'read')
        AND a.reminder_sent_at IS NULL
        AND a.deadline_at > $1::timestamptz
        AND a.deadline_at <= ($1::timestamptz + make_interval(hours => $2));`,
    [now.toISOString(), REMINDER_WINDOW_HOURS],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    user_name: String(row.user_name ?? ''),
    document_title: String(row.document_title),
    deadline_at: String(row.deadline_at),
  }));
};

const markReminderSent = async (readingId: number, now: Date): Promise<void> => {
  await pool.query(
    `UPDATE public.quality_reading_acknowledgements
        SET reminder_sent_at = $2::timestamptz, updated_at = NOW()
      WHERE id = $1;`,
    [readingId, now.toISOString()],
  );
};

/** Envia los recordatorios pendientes. Devuelve cuantos se marcaron. */
export const sendPendingReminders = async (now: Date = new Date()): Promise<number> => {
  const pending = await findReadingsDueForReminder(now);
  let marked = 0;

  for (const reading of pending) {
    const subject = 'Recordatorio: documento del SGC pendiente de leer y firmar';
    const deadline = formatDeadline(reading.deadline_at);
    const emailBody =
      `<p>Hola ${reading.user_name}:</p>` +
      `<p>Tienes pendiente leer y firmar el documento <strong>${reading.document_title}</strong>.</p>` +
      `<p>El plazo vence el <strong>${deadline}</strong>.</p>` +
      '<p>Ingresa a SafeDoc, en Calidad &rarr; Sala de lectura.</p>';
    const smsBody =
      `SafeDoc: te falta leer y firmar "${reading.document_title}". Vence el ${deadline}.`;

    try {
      await sendGenericNotification(
        { email: reading.email, phone: reading.phone },
        subject,
        emailBody,
        smsBody,
        'QUALITY_READING_REMINDER',
      );
    } catch (error) {
      // Un fallo de envio no debe frenar al resto ni marcar como recordada:
      // el proximo ciclo lo reintenta.
      console.error(`No se pudo enviar el recordatorio de la lectura ${reading.id}:`, error);
      continue;
    }

    await markReminderSent(reading.id, now);
    marked += 1;
  }

  return marked;
};

export const runQualityReadingSchedulerTick = async (
  now: Date = new Date(),
): Promise<{ reminders: number; expired: number }> => {
  if (!(await tablesExist())) {
    return { reminders: 0, expired: 0 };
  }
  const reminders = await sendPendingReminders(now);
  const expired = await expireOverdueReadings();
  return { reminders, expired };
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export const startQualityReadingScheduler = (): void => {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('Scheduler de sala de lectura deshabilitado (SCHEDULER_ENABLED=false).');
    return;
  }
  if (scheduledTask) {
    return;
  }

  const expression = process.env.SCHEDULER_CRON || '*/15 * * * *';
  // Igual que los otros schedulers: una falla al programar el cron no debe
  // tumbar la API.
  try {
    scheduledTask = cron.schedule(expression, () => {
      void runQualityReadingSchedulerTick().catch((error) => {
        console.error('Error en el ciclo del scheduler de sala de lectura:', error);
      });
    });
    console.log(`Scheduler de sala de lectura activo (cron "${expression}").`);
  } catch (error) {
    console.error(
      'No se pudo iniciar el scheduler de sala de lectura; la API continua sin el:',
      error,
    );
  }
};
