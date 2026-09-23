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
      SELECT o.id, o.scheduled_for, COALESCE(p.plan_code, 'VERIFICACION') AS plan_code,
             COALESCE(p.title, 'Verificacion post-reparacion') AS plan_title,
             a.asset_code, a.name AS asset_name,
             op.full_name AS op_name, op.email AS op_email, op.phone AS op_phone,
             rs.full_name AS rs_name, rs.email AS rs_email, rs.phone AS rs_phone
        FROM public.${cfg.ordersTable} o
        LEFT JOIN public.${cfg.plansTable} p ON p.id = o.plan_id
        JOIN public.helpdesk_assets a ON a.id = o.asset_id
        LEFT JOIN public.employees op ON op.id = a.assigned_employee_id
        LEFT JOIN public.employees rs ON rs.id = a.responsible_employee_id
       WHERE o.status IN ('SCHEDULED', 'RESCHEDULED')
         AND o.reminder_sent_at IS NULL
         AND COALESCE(o.window_starts_on, o.scheduled_for) <= (CURRENT_DATE + ($1 || ' days')::interval)
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

const ESCALATION_AFTER_DAYS_DEFAULT = 3;

export const getEscalationAfterDays = (): number => {
  const raw = Number(process.env.SERVICE_ESCALATION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : ESCALATION_AFTER_DAYS_DEFAULT;
};

/**
 * Programa de Mantenimiento, nivel 2: aviso de VENCIDA al operador y responsable
 * el dia siguiente al "hasta" de la ventana (una sola vez por orden).
 */
export const processMaintenanceOverdue = async (): Promise<number> => {
  if (!(await tableExists('helpdesk_maintenance_orders'))) {
    return 0;
  }
  const candidates = await pool.query(
    `
      SELECT o.id, o.order_code, o.scheduled_for, o.window_ends_on, COALESCE(p.title, 'Verificacion post-reparacion') AS plan_title,
             a.asset_code, a.name AS asset_name,
             op.full_name AS op_name, op.email AS op_email, op.phone AS op_phone,
             rs.full_name AS rs_name, rs.email AS rs_email, rs.phone AS rs_phone
        FROM public.helpdesk_maintenance_orders o
        LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
        JOIN public.helpdesk_assets a ON a.id = o.asset_id
        LEFT JOIN public.employees op ON op.id = a.assigned_employee_id
        LEFT JOIN public.employees rs ON rs.id = a.responsible_employee_id
       WHERE o.status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
         AND o.overdue_notified_at IS NULL
         AND o.window_ends_on IS NOT NULL
         AND o.window_ends_on < CURRENT_DATE
       ORDER BY o.window_ends_on ASC;
    `,
  );
  let notified = 0;
  for (const row of candidates.rows) {
    const recipients = collectRecipients(row);
    if (recipients.length === 0) {
      continue;
    }
    const limit = formatDate(String(row.window_ends_on));
    const assetLabel = `${row.asset_code} — ${row.asset_name}`;
    const subject = `Mantenimiento VENCIDO: ${row.asset_code} (${row.order_code})`;
    for (const r of recipients) {
      await sendGenericNotification(
        r,
        subject,
        `Hola ${r.name},\nLa orden ${row.order_code} (${row.plan_title}) del equipo ${assetLabel} vencio el ${limit} sin registrar su ejecucion.\nRegistra el servicio o reprograma con justificacion en SafeDoc > Programa de Mantenimiento.`,
        `SafeDoc: mantenimiento VENCIDO ${row.asset_code} (${row.order_code}), limite ${limit}.`,
        'maintenance_overdue',
      );
    }
    await pool.query(`UPDATE public.helpdesk_maintenance_orders SET overdue_notified_at = NOW() WHERE id = $1;`, [row.id]);
    notified += 1;
  }
  return notified;
};

/**
 * Nivel 3: escalamiento de ordenes de activos CRITICOS vencidas mas de N dias,
 * a los responsables del area (estructura organizacional) y al correo de
 * coordinacion de Help Desk (HELPDESK_ESCALATION_EMAIL). Una sola vez por orden.
 */
export const processMaintenanceEscalation = async (): Promise<number> => {
  if (!(await tableExists('helpdesk_maintenance_orders'))) {
    return 0;
  }
  const afterDays = getEscalationAfterDays();
  const candidates = await pool.query(
    `
      SELECT o.id, o.order_code, o.window_ends_on, COALESCE(p.title, 'Verificacion post-reparacion') AS plan_title,
             a.id AS asset_id, a.asset_code, a.name AS asset_name, a.area_id, ar.name AS area_name,
             (SELECT COALESCE(json_agg(json_build_object('name', u.full_name, 'email', u.email)), '[]'::json)
                FROM public.helpdesk_area_responsibles rp JOIN public.users u ON u.id = rp.user_id AND u.is_active = TRUE
               WHERE rp.area_id = a.area_id) AS area_responsibles
        FROM public.helpdesk_maintenance_orders o
        LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
        JOIN public.helpdesk_assets a ON a.id = o.asset_id
        LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
       WHERE o.status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
         AND o.escalation_notified_at IS NULL
         AND UPPER(COALESCE(cr.code, '')) = 'CRITICAL'
         AND o.window_ends_on IS NOT NULL
         AND o.window_ends_on < CURRENT_DATE - ($1 || ' days')::interval
       ORDER BY o.window_ends_on ASC;
    `,
    [afterDays],
  );
  const coordinatorEmail = (process.env.HELPDESK_ESCALATION_EMAIL || '').trim() || null;
  let notified = 0;
  for (const row of candidates.rows) {
    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const responsibles: Array<{ name: string; email: string | null }> = Array.isArray(row.area_responsibles) ? row.area_responsibles : [];
    for (const r of responsibles) {
      if (r.email && !seen.has(r.email.toLowerCase())) {
        seen.add(r.email.toLowerCase());
        recipients.push({ name: r.name ?? '', email: r.email, phone: null });
      }
    }
    if (coordinatorEmail && !seen.has(coordinatorEmail.toLowerCase())) {
      recipients.push({ name: 'Coordinacion Help Desk', email: coordinatorEmail, phone: null });
    }
    if (recipients.length === 0) {
      continue;
    }
    const limit = formatDate(String(row.window_ends_on));
    const subject = `ESCALAMIENTO: activo critico ${row.asset_code} con mantenimiento vencido (${row.order_code})`;
    for (const r of recipients) {
      await sendGenericNotification(
        r,
        subject,
        `Hola ${r.name},\nEl activo CRITICO ${row.asset_code} — ${row.asset_name} (area ${row.area_name ?? 'N/E'}) tiene la orden ${row.order_code} (${row.plan_title}) vencida desde el ${limit}, mas de ${afterDays} dia(s).\nSe requiere intervencion: registrar el servicio, reprogramar con justificacion o poner el equipo fuera de servicio.`,
        `SafeDoc ESCALAMIENTO: ${row.asset_code} critico, orden ${row.order_code} vencida desde ${limit}.`,
        'maintenance_escalation',
      );
    }
    await pool.query(`UPDATE public.helpdesk_maintenance_orders SET escalation_notified_at = NOW() WHERE id = $1;`, [row.id]);
    notified += 1;
  }
  return notified;
};

/** Un ciclo del scheduler: recordatorios, vencidas y escalamiento. */
export const runServiceReminderTick = async (): Promise<{ maintenance: number; calibration: number; overdue: number; escalated: number }> => {
  const maintenance = await processServiceReminders('maintenance');
  const calibration = await processServiceReminders('calibration');
  const overdue = await processMaintenanceOverdue();
  const escalated = await processMaintenanceEscalation();
  return { maintenance, calibration, overdue, escalated };
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
