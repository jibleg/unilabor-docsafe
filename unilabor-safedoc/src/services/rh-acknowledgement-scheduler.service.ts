import cron from 'node-cron';
import pool from '../config/db';
import { expireOverdueAcknowledgements } from './rh-document-acknowledgement.service';

/**
 * Scheduler in-process de los acuses de lectura (RH-ACK-04):
 * - Recordatorio cuando falta <= 24h del plazo (una sola vez, marca
 *   reminder_sent_at).
 * - Marcado de vencidos. Idempotente.
 *
 * Espeja el scheduler de evaluaciones y comparte sus guardas de entorno.
 */

export const REMINDER_WINDOW_HOURS = 24;

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.rh_document_acknowledgements') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

/**
 * Marca los acuses por vencer para recordatorio. Devuelve cuantos se marcaron.
 *
 * El envio efectivo aun no esta conectado: se deja el sello en BD para que el
 * tablero de RH pueda mostrar "recordado" y para no re-marcar en cada ciclo.
 */
export const markPendingReminders = async (now: Date = new Date()): Promise<number> => {
  const result = await pool.query(
    `UPDATE public.rh_document_acknowledgements
        SET reminder_sent_at = $1::timestamptz, updated_at = NOW()
      WHERE status IN ('pending', 'in_progress', 'read')
        AND reminder_sent_at IS NULL
        AND deadline_at > $1::timestamptz
        AND deadline_at <= ($1::timestamptz + make_interval(hours => $2))
      RETURNING id;`,
    [now.toISOString(), REMINDER_WINDOW_HOURS],
  );
  return result.rowCount ?? 0;
};

export const runAcknowledgementSchedulerTick = async (
  now: Date = new Date(),
): Promise<{ reminders: number; expired: number }> => {
  if (!(await tableExists())) {
    return { reminders: 0, expired: 0 };
  }
  const reminders = await markPendingReminders(now);
  const expired = await expireOverdueAcknowledgements();
  return { reminders, expired };
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export const startAcknowledgementScheduler = (): void => {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('Scheduler de acuses deshabilitado (SCHEDULER_ENABLED=false).');
    return;
  }
  if (scheduledTask) {
    return;
  }
  const expression = process.env.SCHEDULER_CRON || '*/15 * * * *';
  // Igual que el de evaluaciones: una falla al programar el cron no debe tumbar
  // la API.
  try {
    scheduledTask = cron.schedule(expression, () => {
      void runAcknowledgementSchedulerTick().catch((error) => {
        console.error('Error en el ciclo del scheduler de acuses:', error);
      });
    });
    console.log(`Scheduler de acuses activo (cron "${expression}").`);
  } catch (error) {
    console.error('No se pudo iniciar el scheduler de acuses; la API continua sin el:', error);
  }
};
