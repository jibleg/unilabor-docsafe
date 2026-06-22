import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  getText,
  getNumberId,
  logHelpdeskAudit,
  mapHelpdeskError,
} from './helpdesk-controller.shared';
import { getHelpdeskAssetById } from '../services/helpdesk-asset.service';
import {
  createLifecycleEvent,
  getLifecycleEventById,
  listAssetLifecycleEvents,
  updateLifecycleEvent,
  type HelpdeskLifecycleEventPayload,
} from '../services/helpdesk-lifecycle.service';
import { listAssetDocuments } from '../services/helpdesk-asset-document.service';
import { generateLifecycleActa } from '../services/helpdesk-acta.service';

const getLifecycleEventPayload = (body: any): HelpdeskLifecycleEventPayload | null => {
  const eventTypeId = getNumberId(body?.event_type_id);
  const eventDate = getText(body?.event_date);
  const title = getText(body?.title);

  if (!eventTypeId || !eventDate || !title) {
    return null;
  }

  const cost = body?.cost === undefined || body?.cost === null || body?.cost === '' ? null : Number(body.cost);

  return {
    event_type_id: eventTypeId,
    event_date: eventDate,
    title,
    description: getText(body?.description),
    maintenance_order_id: getNumberId(body?.maintenance_order_id),
    ticket_id: getNumberId(body?.ticket_id),
    supplier_id: getNumberId(body?.supplier_id),
    performed_by_employee_id: getNumberId(body?.performed_by_employee_id),
    performed_by_provider: getText(body?.performed_by_provider),
    cost: cost !== null && Number.isFinite(cost) ? cost : null,
    currency: getText(body?.currency),
    calibration_certificate_no: getText(body?.calibration_certificate_no),
    calibration_due_on: getText(body?.calibration_due_on),
    disposal_reason_id: getNumberId(body?.disposal_reason_id),
    from_location_id: getNumberId(body?.from_location_id),
    to_location_id: getNumberId(body?.to_location_id),
    notes: getText(body?.notes),
  };
};

export const listAssetLifecycleEventsController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const events = await listAssetLifecycleEvents(assetId);
    return res.json({ events });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error listando eventos de ciclo de vida:', error);
    return res.status(500).json({ message: 'No se pudieron obtener los eventos del equipo.' });
  }
};

export const getAssetExpedientController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await getHelpdeskAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    const [events, documents] = await Promise.all([
      listAssetLifecycleEvents(assetId),
      listAssetDocuments(assetId, { currentOnly: true }),
    ]);
    return res.json({ asset, events, documents });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error obteniendo expediente del equipo:', error);
    return res.status(500).json({ message: 'No se pudo obtener el expediente del equipo.' });
  }
};

export const createLifecycleEventController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  const payload = getLifecycleEventPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Tipo de evento, fecha y titulo son obligatorios.' });
  }

  try {
    const event = await createLifecycleEvent(assetId, payload, req.user?.id ?? null);
    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_LIFECYCLE_EVENT_CREATE:${event.id}`,
      req.ip,
      event.id,
      'helpdesk_lifecycle_event',
    );

    // Generacion automatica de acta (baja) / reporte (mantenimiento) — best-effort.
    let generatedDocumentId: number | null = null;
    try {
      const asset = await getHelpdeskAssetById(assetId);
      if (asset) {
        const generated = await generateLifecycleActa(asset, event, req.user?.id ?? null);
        generatedDocumentId = generated?.id ?? null;
      }
    } catch (genError) {
      console.error('No se pudo generar el acta/reporte automatico del evento:', genError);
    }

    return res.status(201).json({
      message: 'Evento de ciclo de vida registrado correctamente.',
      event: { ...event, generated_act_document_id: generatedDocumentId ?? event.generated_act_document_id },
    });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error creando evento de ciclo de vida:', error);
    return res.status(500).json({ message: 'No se pudo registrar el evento del equipo.' });
  }
};

export const updateLifecycleEventController = async (req: AuthRequest, res: Response) => {
  const eventId = getNumberId(req.params.eventId);
  if (!eventId) {
    return res.status(400).json({ message: 'ID de evento invalido.' });
  }

  const payload = getLifecycleEventPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Tipo de evento, fecha y titulo son obligatorios.' });
  }

  try {
    const event = await updateLifecycleEvent(eventId, payload, req.user?.id ?? null);
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    await logHelpdeskAudit(
      req.user?.id,
      `HELPDESK_LIFECYCLE_EVENT_UPDATE:${eventId}`,
      req.ip,
      eventId,
      'helpdesk_lifecycle_event',
    );

    return res.json({ message: 'Evento actualizado correctamente.', event });
  } catch (error: any) {
    const mapped = mapHelpdeskError(res, error);
    if (mapped) {
      return mapped;
    }
    console.error('Error actualizando evento de ciclo de vida:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el evento.' });
  }
};

export { getLifecycleEventById };
