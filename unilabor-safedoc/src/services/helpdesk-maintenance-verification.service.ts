import pool from '../config/db';
import type { Queryable } from '../utils/transaction';
import { addDaysIso, requiresPostRepairVerification, todayIso } from './helpdesk-maintenance-recurrence';
import { insertScheduledOrder } from './helpdesk-maintenance-projection.service';

/**
 * Verificacion post-reparacion (ISO 15189:2022 6.4.5): tras registrar la
 * solucion de un ticket sobre un activo CRITICO o ALTO, se genera una orden de
 * verificacion en el calendario. Mientras siga abierta, el activo permanece
 * "operativo condicionado" y el ticket no puede validar el retorno a operacion.
 * Activos medios/bajos cierran el ticket sin esta orden.
 */

const VERIFICATION_WINDOW_DAYS = 3;

export interface PostRepairVerificationResult {
  order_id: number | null;
  created: boolean;
  reason: string;
}

export const createPostRepairVerificationOrder = async (
  ticketId: number,
  userId?: string | null,
  executor: Queryable = pool,
): Promise<PostRepairVerificationResult> => {
  const ticket = await executor.query(
    `
      SELECT t.id, t.asset_id, cr.code AS criticality_code
        FROM public.helpdesk_tickets t
        LEFT JOIN public.helpdesk_assets a ON a.id = t.asset_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
       WHERE t.id = $1
       LIMIT 1;
    `,
    [ticketId],
  );
  const row = ticket.rows[0];
  if (!row || !row.asset_id) {
    return { order_id: null, created: false, reason: 'El ticket no tiene activo asociado.' };
  }
  const criticality = row.criticality_code ? String(row.criticality_code) : null;
  if (!requiresPostRepairVerification(criticality)) {
    return { order_id: null, created: false, reason: 'La criticidad del activo no exige verificacion post-reparacion.' };
  }
  const existing = await executor.query(
    `SELECT id FROM public.helpdesk_maintenance_orders WHERE ticket_id = $1 AND service_kind = 'POST_REPAIR_VERIFICATION' AND status <> 'CLOSED' LIMIT 1;`,
    [ticketId],
  );
  if (existing.rows[0]) {
    return { order_id: Number(existing.rows[0].id), created: false, reason: 'Ya existe una verificacion pendiente.' };
  }
  const scheduledFor = addDaysIso(todayIso(), 1);
  const orderId = await insertScheduledOrder(executor, {
    planId: null,
    assetId: Number(row.asset_id),
    scheduledFor,
    beforeDays: 1,
    afterDays: VERIFICATION_WINDOW_DAYS,
    criticalityCode: criticality,
    serviceKind: 'POST_REPAIR_VERIFICATION',
    isProjected: false,
    ticketId,
    userId: userId ?? null,
  });

  const conditionalStatus = await executor.query(
    `SELECT id FROM public.helpdesk_operational_statuses WHERE UPPER(code) = 'CONDITIONAL' LIMIT 1;`,
  );
  if (conditionalStatus.rows[0]) {
    await executor.query(
      `UPDATE public.helpdesk_assets SET operational_status_id = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1;`,
      [Number(row.asset_id), Number(conditionalStatus.rows[0].id), userId ?? null],
    );
    await executor.query(
      `INSERT INTO public.helpdesk_asset_history (asset_id, action, summary, new_values, created_by_user_id) VALUES ($1, 'MAINTENANCE_STATUS_CHANGE', $2, $3, $4);`,
      [
        Number(row.asset_id),
        'Operativo condicionado hasta cerrar la verificacion post-reparacion.',
        JSON.stringify({ ticket_id: ticketId, maintenance_order_id: orderId, operational_status: 'CONDITIONAL' }),
        userId ?? null,
      ],
    );
  }
  return { order_id: orderId, created: Boolean(orderId), reason: 'Verificacion post-reparacion programada.' };
};

/** Orden de verificacion abierta ligada al ticket (bloquea validar el retorno a operacion). */
export const getPendingPostRepairVerification = async (
  ticketId: number,
  executor: Queryable = pool,
): Promise<{ id: number; order_code: string; scheduled_for: string } | null> => {
  const result = await executor.query(
    `SELECT id, order_code, scheduled_for FROM public.helpdesk_maintenance_orders
      WHERE ticket_id = $1 AND service_kind = 'POST_REPAIR_VERIFICATION' AND status <> 'CLOSED'
      ORDER BY scheduled_for ASC LIMIT 1;`,
    [ticketId],
  );
  const row = result.rows[0];
  return row ? { id: Number(row.id), order_code: String(row.order_code), scheduled_for: String(row.scheduled_for).slice(0, 10) } : null;
};

/**
 * Al cerrar una verificacion post-reparacion con resultado conforme, el activo
 * regresa a OPERATIVO. Con resultado no conforme se queda condicionado y el
 * hallazgo debe derivar en una nueva solicitud correctiva.
 */
export const restoreAssetAfterVerification = async (
  assetId: number,
  orderId: number,
  conforming: boolean,
  userId?: string | null,
  executor: Queryable = pool,
): Promise<void> => {
  if (!conforming) {
    return;
  }
  const operational = await executor.query(`SELECT id FROM public.helpdesk_operational_statuses WHERE UPPER(code) = 'OPERATIONAL' LIMIT 1;`);
  if (!operational.rows[0]) {
    return;
  }
  await executor.query(
    `UPDATE public.helpdesk_assets SET operational_status_id = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1;`,
    [assetId, Number(operational.rows[0].id), userId ?? null],
  );
  await executor.query(
    `INSERT INTO public.helpdesk_asset_history (asset_id, action, summary, new_values, created_by_user_id) VALUES ($1, 'MAINTENANCE_STATUS_CHANGE', $2, $3, $4);`,
    [assetId, 'Retorno a operativo tras verificacion post-reparacion conforme.', JSON.stringify({ maintenance_order_id: orderId, operational_status: 'OPERATIONAL' }), userId ?? null],
  );
};
