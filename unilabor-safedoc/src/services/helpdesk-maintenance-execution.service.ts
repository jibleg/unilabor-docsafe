import pool from '../config/db';
import { withTransaction, type Queryable } from '../utils/transaction';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { computeNextDate, type MaintenanceIntervalUnit } from './helpdesk-maintenance-recurrence';
import { ensurePlanProjection, clearUntouchedProjection, resyncPlanNextDue } from './helpdesk-maintenance-projection.service';
import { getMaintenanceOrderById, type HelpdeskMaintenanceOrderRecord } from './helpdesk-maintenance.service';
import { archiveMaintenanceConstancia } from './helpdesk-maintenance-constancia.service';
import { restoreAssetAfterVerification } from './helpdesk-maintenance-verification.service';
import { createHelpdeskTicket } from './helpdesk-ticket.mutations';
import { listAssetDocuments, uploadAssetDocument, type HelpdeskAssetDocumentRecord, type UploadedAssetFile } from './helpdesk-asset-document.service';

/**
 * Ejecucion y cierre de ordenes del Programa de Mantenimiento.
 *
 * Reglas (ISO 15189:2022 6.4.5 / 6.4.7):
 * - Checklist: las tareas obligatorias no pueden quedar sin registrar.
 * - Evidencia: obligatoria (documento adjunto) cuando la rutina lo exige y el
 *   servicio es externo; en servicio interno basta documento o nota.
 * - Firmas: la del ejecutor siempre que se capture; la del responsable del
 *   activo es obligatoria en servicio externo o activo critico/alto. Sin ella
 *   la orden queda PENDING_VALIDATION hasta que el responsable la valide.
 * - Hallazgo no conforme en activo critico/alto: obliga a abrir la solicitud
 *   correctiva ligada a la orden.
 * - Al cerrar (CLOSED) se genera la constancia PDF, el evento del expediente y
 *   la siguiente ocurrencia (anclaje fijo o flotante).
 */

export type ChecklistResult = 'OK' | 'NOT_OK' | 'NA' | 'PENDING';

export interface MaintenanceExecutionChecklistItem {
  plan_task_id?: number | null | undefined;
  task_text: string;
  result: ChecklistResult | string;
  notes?: string | null | undefined;
}

export interface MaintenanceExecutionPayload {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings?: string | null | undefined;
  provider_name?: string | null | undefined;
  supplier_id?: number | null | undefined;
  executed_by_employee_id?: number | null | undefined;
  downtime_minutes?: number | null | undefined;
  evidence_notes?: string | null | undefined;
  checklist?: MaintenanceExecutionChecklistItem[] | undefined;
  technician_signature?: string | null | undefined;
  responsible_signature?: string | null | undefined;
  open_corrective_ticket?: boolean | undefined;
  corrective_title?: string | null | undefined;
  corrective_description?: string | null | undefined;
}

export interface MaintenanceValidationPayload {
  responsible_signature: string;
  validation_notes?: string | null | undefined;
}

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = publicMessage;
  throw error;
};

const normalizeChecklistResult = (value: unknown): ChecklistResult => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'OK' || raw === 'DONE' || raw === 'COMPLETED' || raw === 'CONFORME') return 'OK';
  if (raw === 'NOT_OK' || raw === 'FAILED' || raw === 'NO_CONFORME') return 'NOT_OK';
  if (raw === 'NA' || raw === 'N/A' || raw === 'SKIPPED' || raw === 'NO_APLICA') return 'NA';
  return 'PENDING';
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const writeSignature = (dataUrl: string | null | undefined, prefix: string): string | null => {
  const raw = normalizeText(dataUrl);
  if (!raw) {
    return null;
  }
  const buffer = decodeSignaturePng(raw);
  if (!buffer) {
    throwCoded('HELPDESK_MAINTENANCE_INVALID_SIGNATURE', 'La firma electronica es invalida o esta vacia.');
  }
  return writeSignaturePng(buffer as Buffer, prefix);
};

const STRICT = new Set(['CRITICAL', 'HIGH']);

const assertChecklistComplete = (order: HelpdeskMaintenanceOrderRecord, checklist: MaintenanceExecutionChecklistItem[]): void => {
  if (!order.checklist_required) {
    return;
  }
  const requiredIds = new Set(order.checklist.filter((item) => item.plan_task_id).map((item) => Number(item.plan_task_id)));
  if (requiredIds.size === 0) {
    return;
  }
  const answered = new Set(
    checklist
      .filter((item) => item.plan_task_id && normalizeChecklistResult(item.result) !== 'PENDING')
      .map((item) => Number(item.plan_task_id)),
  );
  const missing = [...requiredIds].filter((id) => !answered.has(id));
  if (missing.length > 0) {
    throwCoded('HELPDESK_MAINTENANCE_CHECKLIST_INCOMPLETE', `Faltan ${missing.length} tarea(s) del checklist por registrar (conforme, no conforme o no aplica).`);
  }
};

const assertEvidence = async (order: HelpdeskMaintenanceOrderRecord, payload: MaintenanceExecutionPayload): Promise<void> => {
  if (!order.evidence_required) {
    return;
  }
  const docs = await listAssetDocuments(order.asset_id, { maintenanceOrderId: order.id });
  const hasDocument = docs.some((d) => d.document_kind_code !== 'MAINTENANCE_CONSTANCIA');
  if (hasDocument) {
    return;
  }
  if (order.executor_kind === 'EXTERNAL_PROVIDER') {
    throwCoded('HELPDESK_MAINTENANCE_EVIDENCE_REQUIRED', 'El servicio lo realizo un proveedor: adjunta su reporte o certificado como evidencia antes de cerrar.');
  }
  if (!normalizeText(payload.evidence_notes)) {
    throwCoded('HELPDESK_MAINTENANCE_EVIDENCE_REQUIRED', 'Adjunta al menos una evidencia (foto o reporte) o describe la evidencia en las notas.');
  }
};

const saveChecklist = async (orderId: number, checklist: MaintenanceExecutionChecklistItem[], client: Queryable): Promise<void> => {
  await client.query('DELETE FROM public.helpdesk_maintenance_order_checklist WHERE order_id = $1;', [orderId]);
  for (const [index, item] of checklist.entries()) {
    const taskText = normalizeText(item.task_text);
    if (!taskText) {
      continue;
    }
    await client.query(
      `INSERT INTO public.helpdesk_maintenance_order_checklist (order_id, plan_task_id, task_text, result, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [orderId, item.plan_task_id ?? null, taskText, normalizeChecklistResult(item.result), normalizeText(item.notes), (index + 1) * 10],
    );
  }
};

const openCorrectiveTicket = async (
  order: HelpdeskMaintenanceOrderRecord,
  payload: MaintenanceExecutionPayload,
  userId: string | null | undefined,
): Promise<number | null> => {
  const requestType = await pool.query(
    `SELECT id FROM public.helpdesk_request_types WHERE UPPER(code) IN ('CORRECTIVE_MAINTENANCE', 'REPAIR', 'FAILURE') ORDER BY CASE UPPER(code) WHEN 'CORRECTIVE_MAINTENANCE' THEN 1 WHEN 'REPAIR' THEN 2 ELSE 3 END LIMIT 1;`,
  );
  const findings = normalizeText(payload.findings) ?? 'Hallazgo no conforme durante el mantenimiento.';
  const ticket = await createHelpdeskTicket(
    {
      asset_id: order.asset_id,
      request_type_id: requestType.rows[0]?.id ? Number(requestType.rows[0].id) : null,
      requester_employee_id: order.executed_by_employee_id ?? order.asset?.responsible_employee_id ?? null,
      title: normalizeText(payload.corrective_title) ?? `Hallazgo en ${order.order_code}: ${order.asset?.asset_code ?? ''}`,
      description: normalizeText(payload.corrective_description) ?? `${findings}\n\nOrigen: orden de mantenimiento ${order.order_code}${order.plan ? ` (${order.plan.plan_code} · ${order.plan.title})` : ''}.`,
      operational_impact: 'Derivado de mantenimiento con hallazgo no conforme.',
    },
    userId,
  );
  return ticket.id;
};

/** Cierra (o deja en validacion) la orden con el registro completo de ejecucion. */
export const closeMaintenanceOrder = async (
  orderId: number,
  payload: MaintenanceExecutionPayload,
  userId?: string | null,
): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  const current = await getMaintenanceOrderById(orderId);
  if (!current) {
    return null;
  }
  if (current.status === 'CLOSED') {
    throwCoded('HELPDESK_MAINTENANCE_ORDER_INVALID_STATE', 'Esta orden de mantenimiento ya esta cerrada.');
  }
  if (current.status === 'PENDING_VALIDATION') {
    throwCoded('HELPDESK_MAINTENANCE_ORDER_INVALID_STATE', 'La orden ya fue ejecutada y espera la validacion del responsable del activo.');
  }

  const checklist = payload.checklist ?? [];
  assertChecklistComplete(current, checklist);
  await assertEvidence(current, payload);

  const hasNonConforming = checklist.some((item) => normalizeChecklistResult(item.result) === 'NOT_OK');
  const strictAsset = STRICT.has(String(current.asset?.criticality_code ?? '').toUpperCase());
  if (hasNonConforming && strictAsset && !payload.open_corrective_ticket && !current.derived_ticket_id) {
    throwCoded(
      'HELPDESK_MAINTENANCE_CORRECTIVE_REQUIRED',
      'Hay tareas no conformes en un activo critico o alto: abre la solicitud correctiva desde esta orden para poder cerrarla.',
    );
  }
  if (current.executor_kind === 'EXTERNAL_PROVIDER' && !payload.supplier_id && !normalizeText(payload.provider_name)) {
    throwCoded('HELPDESK_MAINTENANCE_SUPPLIER_REQUIRED', 'Indica el proveedor que realizo el servicio.');
  }

  const technicianSignaturePath = writeSignature(payload.technician_signature, 'SIGN-MNT-TECH');
  const responsibleSignaturePath = writeSignature(payload.responsible_signature, 'SIGN-MNT-RESP');
  const needsValidation = current.requires_responsible_signature && !responsibleSignaturePath;
  const nextStatus = needsValidation ? 'PENDING_VALIDATION' : 'CLOSED';

  let derivedTicketId: number | null = current.derived_ticket_id;
  if (payload.open_corrective_ticket && !derivedTicketId) {
    derivedTicketId = await openCorrectiveTicket(current, payload, userId);
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_maintenance_orders
           SET status = $2,
               started_at = COALESCE(started_at, NOW()),
               completed_at = $3,
               completed_by_user_id = $4,
               performed_activities = $5,
               findings = $6,
               provider_name = $7,
               supplier_id = $8,
               executed_by_employee_id = $9,
               downtime_minutes = $10,
               result = $11,
               evidence_notes = $12,
               technician_signature_path = COALESCE($13, technician_signature_path),
               responsible_signature_path = COALESCE($14, responsible_signature_path),
               validated_at = CASE WHEN $14 IS NOT NULL THEN NOW() ELSE validated_at END,
               validated_by_user_id = CASE WHEN $14 IS NOT NULL THEN $4 ELSE validated_by_user_id END,
               derived_ticket_id = COALESCE($15, derived_ticket_id),
               is_projected = FALSE,
               updated_by_user_id = $4,
               updated_at = NOW()
         WHERE id = $1;
      `,
      [
        orderId,
        nextStatus,
        payload.completed_at,
        userId ?? null,
        payload.performed_activities.trim(),
        normalizeText(payload.findings),
        normalizeText(payload.provider_name),
        payload.supplier_id ?? null,
        payload.executed_by_employee_id ?? null,
        payload.downtime_minutes ?? null,
        payload.result.trim(),
        normalizeText(payload.evidence_notes),
        technicianSignaturePath,
        responsibleSignaturePath,
        derivedTicketId,
      ],
    );
    await saveChecklist(orderId, checklist, client);
    if (nextStatus === 'CLOSED') {
      await finalizeClosedOrder(orderId, userId, client);
    }
  });

  const closed = await getMaintenanceOrderById(orderId);
  if (closed && closed.status === 'CLOSED') {
    await archiveMaintenanceConstancia(closed, userId);
    return getMaintenanceOrderById(orderId);
  }
  return closed;
};

/** El responsable del activo valida con su firma una orden en PENDING_VALIDATION. */
export const validateMaintenanceOrder = async (
  orderId: number,
  payload: MaintenanceValidationPayload,
  userId?: string | null,
): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  const current = await getMaintenanceOrderById(orderId);
  if (!current) {
    return null;
  }
  if (current.status !== 'PENDING_VALIDATION') {
    throwCoded('HELPDESK_MAINTENANCE_ORDER_INVALID_STATE', 'Solo se validan ordenes ejecutadas que esperan la firma del responsable.');
  }
  const signaturePath = writeSignature(payload.responsible_signature, 'SIGN-MNT-RESP');
  if (!signaturePath) {
    throwCoded('HELPDESK_MAINTENANCE_INVALID_SIGNATURE', 'La firma del responsable es obligatoria para validar.');
  }
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_maintenance_orders
           SET status = 'CLOSED',
               responsible_signature_path = $2,
               validated_at = NOW(),
               validated_by_user_id = $3,
               evidence_notes = CASE WHEN $4::text IS NULL THEN evidence_notes ELSE COALESCE(evidence_notes, '') || E'\\nValidacion: ' || $4 END,
               updated_by_user_id = $3,
               updated_at = NOW()
         WHERE id = $1;
      `,
      [orderId, signaturePath, userId ?? null, normalizeText(payload.validation_notes)],
    );
    await finalizeClosedOrder(orderId, userId, client);
  });
  const closed = await getMaintenanceOrderById(orderId);
  if (closed) {
    await archiveMaintenanceConstancia(closed, userId);
  }
  return getMaintenanceOrderById(orderId);
};

/**
 * Efectos de un cierre definitivo: siguiente ocurrencia (fijo/flotante) y, en
 * verificaciones post-reparacion, retorno del activo a operativo si fue conforme.
 */
const finalizeClosedOrder = async (orderId: number, userId: string | null | undefined, client: Queryable): Promise<void> => {
  const row = await client.query(
    `
      SELECT o.plan_id, o.asset_id, o.service_kind, o.scheduled_for, o.completed_at::date AS completed_on,
             p.schedule_mode, p.anchor_mode, p.custom_interval_value, p.custom_interval_unit, p.recurrence_end_on, p.recurrence_max_occurrences,
             f.interval_months,
             (SELECT COUNT(*)::int FROM public.helpdesk_maintenance_order_checklist c WHERE c.order_id = o.id AND c.result = 'NOT_OK') AS not_ok
        FROM public.helpdesk_maintenance_orders o
        LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
        LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
       WHERE o.id = $1;
    `,
    [orderId],
  );
  const o = row.rows[0];
  if (!o) {
    return;
  }
  if (o.service_kind === 'POST_REPAIR_VERIFICATION') {
    await restoreAssetAfterVerification(Number(o.asset_id), orderId, Number(o.not_ok ?? 0) === 0, userId, client);
    return;
  }
  if (!o.plan_id) {
    return;
  }
  const planId = Number(o.plan_id);
  if (o.schedule_mode === 'CALENDAR') {
    await resyncPlanNextDue(planId, userId, client);
    return;
  }
  if (o.anchor_mode === 'FLOATING') {
    // Flotante: la cadena se recalcula desde la fecha real de ejecucion.
    const completedOn = o.completed_on ? String(o.completed_on).slice(0, 10) : null;
    await clearUntouchedProjection(planId, client);
    const rule = {
      interval_months: o.interval_months ? Number(o.interval_months) : null,
      custom_interval_value: o.custom_interval_value ? Number(o.custom_interval_value) : null,
      custom_interval_unit: (o.custom_interval_unit as MaintenanceIntervalUnit | null) ?? null,
      anchor_mode: 'FLOATING' as const,
      recurrence_end_on: o.recurrence_end_on ? String(o.recurrence_end_on).slice(0, 10) : null,
      recurrence_max_occurrences: o.recurrence_max_occurrences ? Number(o.recurrence_max_occurrences) : null,
    };
    const base = completedOn ?? String(o.scheduled_for).slice(0, 10);
    if (computeNextDate(rule, base)) {
      await ensurePlanProjection(planId, { baseDate: base, userId }, client);
    }
    await resyncPlanNextDue(planId, userId, client);
    return;
  }
  await ensurePlanProjection(planId, { userId }, client);
};

export const listOrderEvidence = async (orderId: number): Promise<HelpdeskAssetDocumentRecord[]> => {
  const order = await getMaintenanceOrderById(orderId);
  if (!order) {
    return [];
  }
  return listAssetDocuments(order.asset_id, { maintenanceOrderId: orderId });
};

export const attachOrderEvidence = async (
  orderId: number,
  file: UploadedAssetFile,
  title: string,
  userId?: string | null,
): Promise<HelpdeskAssetDocumentRecord> => {
  const order = await getMaintenanceOrderById(orderId);
  if (!order) {
    return throwCoded('HELPDESK_MAINTENANCE_ORDER_NOT_FOUND', 'La orden de mantenimiento no existe.');
  }
  if (order.status === 'CLOSED') {
    throwCoded('HELPDESK_MAINTENANCE_ORDER_INVALID_STATE', 'La orden ya esta cerrada; la evidencia debe adjuntarse antes del cierre.');
  }
  const kind = await pool.query(`SELECT id FROM public.helpdesk_document_kinds WHERE UPPER(code) = 'MAINTENANCE_EVIDENCE' LIMIT 1;`);
  const document = await uploadAssetDocument(
    order.asset_id,
    file,
    {
      title: title.trim() || `Evidencia ${order.order_code}`,
      document_kind_id: kind.rows[0]?.id ? Number(kind.rows[0].id) : null,
      maintenance_order_id: orderId,
      issued_on: new Date().toISOString().slice(0, 10),
    },
    userId,
  );
  await pool.query(`UPDATE public.helpdesk_maintenance_orders SET is_projected = FALSE, updated_at = NOW() WHERE id = $1;`, [orderId]);
  return document;
};
