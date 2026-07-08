import cron from 'node-cron';
import pool from '../config/db';
import { sendGenericNotification } from './notification.service';

/**
 * Scheduler in-process (node-cron) de recordatorios de servicio: avisa al
 * operador y al responsable del activo, por correo y SMS, cuando un
 * mantenimiento o una calibracion esta por vencer (dentro de la ventana de
 * dias configurada). Idempotente por orden via `reminder_sent_at`.
 *
 * Corre en paralelo al scheduler de evaluaciones. Env:
 *   SERVICE_REMINDER_ENABLED=false  -> deshabilita
 *   SERVICE_REMINDER_CRON           -> expresion cron (default diario 07:00)
 *   SERVICE_REMINDER_DAYS           -> ventana de aviso en dias (default 7)
 */

export const DEFAULT_REMINDER_WINDOW_DAYS = 7;

export const getReminderWindowDays = (): number => {
  const raw = Number(process.env.SERVICE_REMINDER_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_REMINDER_WINDOW_DAYS;
};

type ServiceKind = 'maintenance' | 'calibration';

interface KindConfig {
  ordersTable: string;
  plansTable: string;
  label: string;
  template: string;
}

// Nombres de tabla desde una lista fija (no entran datos del usuario): seguro interpolar.
const KINDS: Record<ServiceKind, KindConfig> = {
  maintenance: {
    ordersTable: 'helpdesk_maintenance_orders',
    plansTable: 'helpdesk_maintenance_plans',
    label: 'mantenimiento',
    template: 'maintenance_reminder',
  },
  calibration: {
    ordersTable: 'helpdesk_calibration_orders',
    plansTable: 'helpdesk_calibration_plans',
    label: 'calibracion',
    template: 'calibration_reminder',
  },
};

const tableExists = async (table: string): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists;`, [table]);
  return Boolean(result.rows[0]?.exists);
};

const formatDate = (value: string): string =>
  new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' });

interface Recipient {
  name: string;
  email: string | null;
  phone: string | null;
}

// Operador y responsable del activo, deduplicados y solo con algun contacto.
const collectRecipients = (row: any): Recipient[] => {
  const raw: Recipient[] = [
    { name: String(row.op_name ?? ''), email: row.op_email ? String(row.op_email) : null, phone: row.op_phone ? String(row.op_phone) : null },
    { name: String(row.rs_name ?? ''), email: row.rs_email ? String(row.rs_email) : null, phone: row.rs_phone ? String(row.rs_phone) : null },
  ];
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of raw) {
    if (!r.name && !r.email && !r.phone) {
      continue;
    }
    if (!r.email && !r.phone) {
      continue; // sin canal de contacto: nada que enviar
    }
    const key = (r.email ?? '').toLowerCase() || (r.phone ?? '');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(r);
  }
  return out;
};

/** Procesa los recordatorios pendientes de un tipo de servicio. Devuelve cuantas ordenes avisó. */
export const processServiceReminders = async (kind: ServiceKind): Promise<number> => {
  const cfg = KINDS[kind];
  if (!(await tableExists(cfg.ordersTable))) {
    return 0;
  }

  const windowDays = getReminderWindowDays();
  const candidates = await pool.query(
    `
      SELECT o.id, o.scheduled_for, p.plan_code, p.title AS plan_title,
             a.asset_code, a.name AS asset_name,
             op.full_name AS op_name, op.email AS op_email, op.phone AS op_phone,
             rs.full_name AS rs_name, rs.email AS rs_email, rs.phone AS rs_phone
        FROM public.${cfg.ordersTable} o
        JOIN public.${cfg.plansTable} p ON p.id = o.plan_id
        JOIN public.helpdesk_assets a ON a.id = o.asset_id
        LEFT JOIN public.employees op ON op.id = a.assigned_employee_id
        LEFT JOIN public.employees rs ON rs.id = a.responsible_employee_id
       WHERE o.status IN ('SCHEDULED', 'RESCHEDULED')
         AND o.reminder_sent_at IS NULL
         AND o.scheduled_for <= (CURRENT_DATE + ($1 || ' days')::interval)
       ORDER BY o.scheduled_for ASC;
    `,
    [windowDays],
  );

  let notified = 0;
  for (const row of candidates.rows) {
    const recipients = collectRecipients(row);
    if (recipients.length === 0) {
      // Sin contacto: no marcamos, para reintentar cuando se capture correo/telefono.
      continue;
    }

    const date = formatDate(String(row.scheduled_for));
    const assetLabel = `${row.asset_code} — ${row.asset_name}`;
    const subject = `Recordatorio de ${cfg.label}: ${row.asset_code} programado para ${date}`;

    for (const r of recipients) {
      const emailBody =
        `Hola ${r.name},\n` +
        `El equipo ${assetLabel} tiene ${cfg.label} programada para el ${date}.\n` +
        `Plan ${row.plan_code}: ${row.plan_title}.\n` +
        `Como operador/responsable del equipo, coordina su atencion oportuna.\n` +
        `Consulta el detalle en SafeDoc.`;
      const smsBody = `SafeDoc: ${cfg.label} de ${row.asset_code} programada el ${date} (plan ${row.plan_code}).`;
      await sendGenericNotification(r, subject, emailBody, smsBody, cfg.template);
    }

    await pool.query(`UPDATE public.${cfg.ordersTable} SET reminder_sent_at = NOW() WHERE id = $1;`, [row.id]);
    notified += 1;
  }

  return notified;
};

/** Un ciclo del scheduler: recordatorios de mantenimiento y calibracion. */
export const runServiceReminderTick = async (): Promise<{ maintenance: number; calibration: number }> => {
  const maintenance = await processServiceReminders('maintenance');
  const calibration = await processServiceReminders('calibration');
  return { maintenance, calibration };
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Arranca el scheduler in-process de recordatorios de servicio (default diario 07:00).
 * Guardado por SERVICE_REMINDER_ENABLED=false. Arranque defensivo: una falla al
 * programar el cron NO tumba la API.
 */
export const startServiceReminderScheduler = (): void => {
  if (process.env.SERVICE_REMINDER_ENABLED === 'false') {
    console.log('Scheduler de recordatorios de servicio deshabilitado (SERVICE_REMINDER_ENABLED=false).');
    return;
  }
  if (scheduledTask) {
    return;
  }
  const expression = process.env.SERVICE_REMINDER_CRON || '0 7 * * *';
  try {
    scheduledTask = cron.schedule(expression, () => {
      void runServiceReminderTick().catch((error) => {
        console.error('Error en el ciclo del scheduler de recordatorios de servicio:', error);
      });
    });
    console.log(`Scheduler de recordatorios de servicio activo (cron "${expression}").`);
  } catch (error) {
    console.error('No se pudo iniciar el scheduler de recordatorios de servicio; la API continua sin el:', error);
  }
};
