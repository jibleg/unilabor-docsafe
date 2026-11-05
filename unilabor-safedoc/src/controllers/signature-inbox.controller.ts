import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { renderSupervisionChecklistPdf } from '../services/rh-supervision-checklist-close.service';
import { describeRoles } from '../services/rh-supervision-signature.rules';
import {
  countSignatureInboxPending,
  getSignatureInboxDetail,
  listSignatureInbox,
  signFromInbox,
} from '../services/rh-supervision-signature.service';
import type { SignatureInboxSignBody } from '../schemas/rh-supervision-checklist.schema';
import { myEmployeeId } from './my-supervision.controller';
import { audit, closedAuditMetadata, closedMessage, fail, parseId } from './rh-supervision-checklist.controller';

/**
 * Buzon de firmas (ANA-REG-060): cada firmante coloca su firma desde su propia
 * sesion. Solo requiere sesion; cada endpoint comprueba que el colaborador de
 * la sesion sea realmente firmante de ESA lista (supervisor, responsable del
 * area o el colaborador evaluado). Nadie firma por otro: el rol no viaja en la
 * peticion, se deduce de la sesion. Montado en /api/my/signature-inbox.
 */

/** GET /my/signature-inbox */
export const listSignatureInboxController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await listSignatureInbox(await myEmployeeId(req)));
  } catch (error) {
    return fail(res, error, 'Error listando el buzon de firmas', 'No se pudo cargar tu buzon de firmas.');
  }
};

/** GET /my/signature-inbox/count  (badge del menu; sin expediente vinculado no hay nada que firmar) */
export const countSignatureInboxController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ count: await countSignatureInboxPending(await myEmployeeId(req)) });
  } catch (error: any) {
    if (error?.code === 'RH_SUPERVISION_NO_EMPLOYEE') return res.json({ count: 0 });
    return fail(res, error, 'Error contando el buzon de firmas', 'No se pudo consultar tu buzon de firmas.');
  }
};

/** GET /my/signature-inbox/:id */
export const getSignatureInboxDetailController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json(await getSignatureInboxDetail(id, await myEmployeeId(req)));
  } catch (error) {
    return fail(res, error, 'Error abriendo lista del buzon de firmas', 'No se pudo abrir la lista.');
  }
};

/** GET /my/signature-inbox/:id/pdf  (mismo PDF de la lista: en firma con marca de agua, cerrada con sus firmas) */
export const getSignatureInboxPdfController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await getSignatureInboxDetail(id, await myEmployeeId(req));
    const { record, pdf } = await renderSupervisionChecklistPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${record.folio}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF del buzon de firmas', 'No se pudo generar el PDF.');
  }
};

/** POST /my/signature-inbox/:id/sign {signature} */
export const signFromInboxController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const body = req.body as SignatureInboxSignBody;
  try {
    const result = await signFromInbox({ id, userId, employeeId: await myEmployeeId(req), signature: body.signature });
    const { checklist } = result;
    await audit(req, `RH_SUPERVISION_SIGNED:${id}`, id, checklist.employee_id, {
      roles: result.signed_roles,
      pending_roles: result.pending_roles,
      enrollment_id: checklist.enrollment_id,
    });
    const signedAs = describeRoles(result.signed_roles);
    let message: string;
    if (result.closed) {
      const closed = { record: checklist, practical: result.practical };
      // Entre firmas simultaneas solo una peticion sella el cierre: esa es la que lo audita.
      if (result.closed_by_this_request) {
        await audit(req, `RH_SUPERVISION_CLOSED:${id}`, id, checklist.employee_id, { ...closedAuditMetadata(closed), closed_via: 'last_signature' });
      }
      message = `Firmaste como ${signedAs}. Con las tres firmas reunidas: ${closedMessage(closed)}`;
    } else if (result.close_error) {
      await audit(req, `RH_SUPERVISION_AUTO_CLOSE_FAILED:${id}`, id, checklist.employee_id, { reason: result.close_error });
      message = `Firmaste como ${signedAs}. Ya estan las tres firmas, pero la lista no pudo cerrarse sola: ${result.close_error} Recursos Humanos debe reintentar el cierre.`;
    } else {
      message = `Firmaste como ${signedAs} la lista ${checklist.folio}. Falta la firma de ${describeRoles(result.pending_roles)}.`;
    }
    return res.status(201).json({ ...result, message });
  } catch (error) {
    return fail(res, error, 'Error firmando desde el buzon de firmas', 'No se pudo registrar tu firma.');
  }
};
