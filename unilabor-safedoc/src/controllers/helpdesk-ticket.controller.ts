import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { listHelpdeskAssetsByEmployee } from '../services/helpdesk-asset.service';
import { getEmployeeByUserId } from '../services/employee.service';
import { getPreventiveDueCount } from '../services/helpdesk-maintenance.service';
import {
  addHelpdeskTicketComment,
  addMyHelpdeskTicketComment,
  assignHelpdeskTicket,
  cancelHelpdeskTicket,
  changeHelpdeskTicketWorkingStatus,
  closeHelpdeskTicket,
  confirmMyHelpdeskTicketFunctionality,
  createHelpdeskTicket,
  createMyHelpdeskTicket,
  evaluateHelpdeskTicketIsoRisk,
  getHelpdeskDashboardMetrics,
  getHelpdeskSummaryWithTickets,
  getHelpdeskTicketById,
  getHelpdeskTicketStats,
  getMyHelpdeskTicketById,
  listHelpdeskTicketCatalogs,
  listTicketHistory,
  listHelpdeskTickets,
  listMyHelpdeskTickets,
  releaseHelpdeskTicketTechnically,
  resolveTicketSignaturePath,
  solveHelpdeskTicket,
  updateHelpdeskTicket,
  validateHelpdeskTicketReturn,
} from '../services/helpdesk-ticket.service';
import {
  getText,
  getNumberId,
  getBoolean,
  mapHelpdeskError,
  getTicketPayload,
  getTicketSolutionPayload,
  getTicketReturnPayload,
  getTicketIsoRiskPayload,
  getTicketTechnicalReleasePayload,
  getTicketAssignPayload,
  getTicketStatusChangePayload,
  getTicketClosePayload,
  getTicketCancelPayload,
  getTicketConfirmFunctionalityPayload,
  logHelpdeskAudit,
} from './helpdesk-controller.shared';

export const getHelpdeskSummaryController = async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getHelpdeskSummaryWithTickets();
    const preventiveDue = await getPreventiveDueCount();
    return res.json({
      summary: {
        ...summary,
        preventive_due: preventiveDue,
      },
    });
  } catch (error) {
    console.error('Error obteniendo resumen Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el resumen de Helpdesk.' });
  }
};

export const listMyHelpdeskAssetsController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeByUserId(req.user.id);
    if (!employee) {
      return res.status(409).json({ message: 'Tu usuario no esta vinculado a un colaborador activo de RH.' });
    }

    const assets = await listHelpdeskAssetsByEmployee(employee.id);
    return res.json({ employee, assets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando mis activos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar tus equipos asignados.' });
  }
};

export const listMyHelpdeskTicketsController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const tickets = await listMyHelpdeskTickets(req.user.id);
    return res.json({ tickets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando mis tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar tus solicitudes.' });
  }
};

export const getMyHelpdeskTicketByIdController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const ticket = await getMyHelpdeskTicketById(ticketId, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    return res.json({ ticket });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cargar tu solicitud.' });
  }
};

export const createMyHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await createMyHelpdeskTicket(payload, req.user.id);
    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_CREATE:${ticket.id}`, req.ip, ticket.id, 'helpdesk_ticket');

    return res.status(201).json({
      message: 'Solicitud registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar tu solicitud.' });
  }
};

export const addMyHelpdeskTicketCommentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const comment = getText(req.body?.comment);
  if (!comment) {
    return res.status(400).json({ message: 'El comentario es obligatorio.' });
  }

  try {
    const ticket = await addMyHelpdeskTicketComment(ticketId, comment, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_COMMENT:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Comentario agregado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error comentando mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo agregar el comentario.' });
  }
};

export const confirmMyHelpdeskTicketFunctionalityController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketConfirmFunctionalityPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Firma tu confirmacion de funcionamiento.' });
  }

  try {
    const ticket = await confirmMyHelpdeskTicketFunctionality(ticketId, payload, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_CONFIRM:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Funcionamiento confirmado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error confirmando funcionamiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo confirmar el funcionamiento.' });
  }
};

export const getHelpdeskDashboardController = async (_req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getHelpdeskDashboardMetrics();
    return res.json({ dashboard });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo dashboard Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el dashboard de Helpdesk.' });
  }
};

export const listHelpdeskTicketCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listHelpdeskTicketCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos de tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos de tickets.' });
  }
};

export const listHelpdeskTicketsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listHelpdeskTickets({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las solicitudes.' });
  }
};

export const getHelpdeskTicketStatsController = async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getHelpdeskTicketStats();
    return res.json({ summary });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo resumen de tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el resumen de solicitudes.' });
  }
};

export const getHelpdeskTicketByIdController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    return res.json({ ticket });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener la solicitud.' });
  }
};

export const createHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await createHelpdeskTicket(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_CREATE:${ticket.id}`, req.ip, ticket.id, 'helpdesk_ticket');

    return res.status(201).json({
      message: 'Solicitud registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la solicitud.' });
  }
};

export const updateHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await updateHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_UPDATE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Solicitud actualizada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la solicitud.' });
  }
};

export const addHelpdeskTicketCommentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const comment = getText(req.body?.comment);
  if (!comment) {
    return res.status(400).json({ message: 'El comentario es obligatorio.' });
  }

  try {
    const ticket = await addHelpdeskTicketComment(ticketId, comment, getBoolean(req.body?.is_internal), req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_COMMENT:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Comentario agregado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error agregando comentario Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo agregar el comentario.' });
  }
};

export const evaluateHelpdeskTicketIsoRiskController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketIsoRiskPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Nivel de riesgo y evaluacion de impacto son obligatorios.' });
  }

  try {
    const ticket = await evaluateHelpdeskTicketIsoRisk(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_ISO_RISK:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Evaluacion ISO/riesgo registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error registrando evaluacion ISO/riesgo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la evaluacion ISO/riesgo.' });
  }
};

export const releaseHelpdeskTicketTechnicallyController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketTechnicalReleasePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El resumen de liberacion tecnica es obligatorio.' });
  }

  try {
    const ticket = await releaseHelpdeskTicketTechnically(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_TECHNICAL_RELEASE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Liberacion tecnica documentada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error documentando liberacion tecnica Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo documentar la liberacion tecnica.' });
  }
};

export const solveHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketSolutionPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Fecha de solucion y resumen tecnico son obligatorios.' });
  }

  try {
    const ticket = await solveHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_SOLVE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Solucion tecnica registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error registrando solucion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la solucion tecnica.' });
  }
};

export const viewHelpdeskTicketSignatureController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }
  const party = req.query.party === 'closer' ? 'closer' : 'requester';

  try {
    const absolutePath = await resolveTicketSignaturePath(ticketId, party);
    if (!absolutePath) {
      return res.status(404).json({ message: 'Firma no encontrada.' });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(absolutePath);
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error visualizando firma del ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo visualizar la firma.' });
  }
};

export const getHelpdeskTicketHistoryController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const history = await listTicketHistory(ticketId);
    return res.json({ history });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo historial de ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el historial de la solicitud.' });
  }
};

export const assignHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketAssignPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El responsable a asignar es obligatorio.' });
  }

  try {
    const ticket = await assignHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_ASSIGN:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Responsable asignado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error asignando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo asignar el responsable.' });
  }
};

export const changeHelpdeskTicketWorkingStatusController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketStatusChangePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El estado destino es obligatorio.' });
  }

  try {
    const ticket = await changeHelpdeskTicketWorkingStatus(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_STATUS_CHANGE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Estado del ticket actualizado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error moviendo estado de ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el estado del ticket.' });
  }
};

export const closeHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketClosePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Las notas de cierre son obligatorias.' });
  }

  try {
    const ticket = await closeHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_CLOSE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Ticket cerrado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cerrando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cerrar el ticket.' });
  }
};

export const cancelHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketCancelPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El motivo de cancelacion es obligatorio.' });
  }

  try {
    const ticket = await cancelHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_CANCEL:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Ticket cancelado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cancelando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cancelar el ticket.' });
  }
};

export const validateHelpdeskTicketReturnController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketReturnPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'La fecha de retorno a operacion es obligatoria.' });
  }

  try {
    const ticket = await validateHelpdeskTicketReturn(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_VALIDATE_RETURN:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Retorno a operacion validado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error validando retorno Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo validar el retorno a operacion.' });
  }
};

