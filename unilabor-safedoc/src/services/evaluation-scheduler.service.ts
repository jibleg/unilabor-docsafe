import cron from 'node-cron';
import pool from '../config/db';
import { notifyEvaluationExpiredToRh, notifyEvaluationReminder } from './notification.service';

/**
 * Scheduler en proceso (node-cron) del ciclo de 72h:
 * - Recordatorio cuando faltan <= 24h (una sola vez, marca reminder_sent_at).
 * - Marcado de vencidas (deadline pasado) + aviso a RH. Idempotente.
 *
 * Estados accionables (vigentes): pending, in_progress, authorized_late.
 */

export const REMINDER_WINDOW_HOURS = 24;
const ACTIONABLE_STATUSES = ['pending', 'in_progress', 'authorized_late'];

/** Logica pura para pruebas: dado el deadline y el reloj, que corresponde hacer. */
export const evaluateTiming = (
  deadlineMs: number,
  reminderAlreadySent: boolean,
  nowMs: number,
  reminderWindowHours = REMINDER_WINDOW_HOURS,
): { expired: boolean; needsReminder: boolean } => {
  if (deadlineMs <= nowMs) {
    return { expired: true, needsReminder: false };
  }
  const windowMs = reminderWindowHours * 60 * 60 * 1000;
  const needsReminder = !reminderAlreadySent && deadlineMs - nowMs <= windowMs;
  return { expired: false, needsReminder };
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.evaluation_assignments') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

/** Envia recordatorios a las asignaciones por vencer (<= 24h) sin recordatorio previo. */
export const processReminders = async (now: Date = new Date()): Promise<number> => {
  const iso = now.toISOString();
  const candidates = await pool.query(
    `SELECT id FROM public.evaluation_assignments
      WHERE status = ANY($2)
        AND reminder_sent_at IS NULL
        AND deadline_at > $1::timestamptz
        AND deadline_at <= ($1::timestamptz + ($3 || ' hours')::interval);`,
    [iso, ACTIONABLE_STATUSES, REMINDER_WINDOW_HOURS],
  );
  for (const row of candidates.rows) {
    const assignmentId = Number(row.id);
    await notifyEvaluationReminder(assignmentId);
    await pool.query(
      `UPDATE public.evaluation_assignments SET reminder_sent_at = $2, updated_at = NOW() WHERE id = $1;`,
      [assignmentId, iso],
    );
  }
  return candidates.rows.length;
};

/** Marca como vencidas las asignaciones cuya ventana paso y avisa a RH. Idempotente. */
export const processExpirations = async (now: Date = new Date()): Promise<number> => {
  const iso = now.toISOString();
  const expired = await pool.query(
    `UPDATE public.evaluation_assignments
        SET status = 'expired', updated_at = NOW()
      WHERE status = ANY($2) AND deadline_at <= $1::timestamptz
      RETURNING id;`,
    [iso, ACTIONABLE_STATUSES],
  );
  for (const row of expired.rows) {
    await notifyEvaluationExpiredToRh(Number(row.id));
  }
  return expired.rows.length;
};

/** Un ciclo del scheduler: recordatorios y luego vencimientos. */
export const runSchedulerTick = async (now: Date = new Date()): Promise<{ reminders: number; expired: number }> => {
  if (!(await tableExists())) {
    return { reminders: 0, expired: 0 };
  }
  const reminders = await processReminders(now);
  const expired = await processExpirations(now);
  return { reminders, expired };
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Arranca el scheduler in-process (cada 15 min). Guardado por env
 * SCHEDULER_ENABLED=false para no duplicar en despliegues multi-instancia.
 */
export const startEvaluationScheduler = (): void => {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('Scheduler de evaluaciones deshabilitado (SCHEDULER_ENABLED=false).');
    return;
  }
  if (scheduledTask) {
    return;
  }
  const expression = process.env.SCHEDULER_CRON || '*/15 * * * *';
  // Arranque defensivo: una falla al programar el cron (p. ej. incompatibilidad de
  // node-cron con la version de Node del servidor) NO debe tumbar la API.
  try {
    scheduledTask = cron.schedule(expression, () => {
      void runSchedulerTick().catch((error) => {
        console.error('Error en el ciclo del scheduler de evaluaciones:', error);
      });
    });
    console.log(`Scheduler de evaluaciones activo (cron "${expression}").`);
  } catch (error) {
    console.error('No se pudo iniciar el scheduler de evaluaciones; la API continua sin el:', error);
  }
};
