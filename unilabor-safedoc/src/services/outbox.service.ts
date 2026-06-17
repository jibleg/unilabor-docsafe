import pool from '../config/db';

/**
 * Bandeja de salida: registro unico de TODOS los envios salientes (correo y SMS)
 * para trazabilidad. Tabla `notification_log` (canal, destinatario, asunto/cuerpo,
 * plantilla/tipo, estado y error). Sin dependencias de los servicios de envio para
 * evitar ciclos de importacion.
 */

export type OutboxChannel = 'email' | 'sms';
export type OutboxStatus = 'sent' | 'failed' | 'skipped';

export interface OutboundEntry {
  channel: OutboxChannel;
  recipient: string;
  subject?: string | null;
  body?: string | null;
  template: string;
  assignmentId?: number | null;
  status: OutboxStatus;
  error?: string | null;
}

/** Inserta un registro en la bandeja de salida. Nunca lanza (no bloquea el envio). */
export const recordOutbound = async (entry: OutboundEntry): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO public.notification_log
         (channel, recipient, subject, body, template, assignment_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        entry.channel,
        entry.recipient,
        entry.subject ?? null,
        entry.body ?? null,
        entry.template,
        entry.assignmentId ?? null,
        entry.status,
        entry.error ?? null,
      ],
    );
  } catch (logError) {
    console.error('No se pudo registrar el envio en la bandeja de salida:', logError);
  }
};

export interface OutboxRow {
  id: number;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  template: string;
  assignment_id: number | null;
  status: string;
  error: string | null;
  sent_at: string;
  employee_name: string | null;
  course_title: string | null;
}

export interface OutboxFilters {
  channel?: OutboxChannel;
  status?: OutboxStatus;
  limit?: number;
}

/** Listado de la bandeja de salida (vista RH), con filtros opcionales. */
export const listOutbox = async (filters: OutboxFilters = {}): Promise<OutboxRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.channel) {
    values.push(filters.channel);
    conditions.push(`n.channel = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`n.status = $${values.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  values.push(limit);

  const result = await pool.query(
    `SELECT n.id, n.channel, n.recipient, n.subject, n.body, n.template, n.assignment_id,
            n.status, n.error, n.sent_at,
            e.full_name AS employee_name, c.title AS course_title
       FROM public.notification_log n
       LEFT JOIN public.evaluation_assignments a ON a.id = n.assignment_id
       LEFT JOIN public.employees e ON e.id = a.employee_id
       LEFT JOIN public.evaluation_templates t ON t.id = a.template_id
       LEFT JOIN public.training_courses c ON c.id = t.training_course_id
       ${whereClause}
      ORDER BY n.sent_at DESC
      LIMIT $${values.length};`,
    values,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    channel: String(row.channel),
    recipient: String(row.recipient),
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    template: String(row.template),
    assignment_id: row.assignment_id !== null ? Number(row.assignment_id) : null,
    status: String(row.status),
    error: row.error ? String(row.error) : null,
    sent_at: String(row.sent_at),
    employee_name: row.employee_name ? String(row.employee_name) : null,
    course_title: row.course_title ? String(row.course_title) : null,
  }));
};
