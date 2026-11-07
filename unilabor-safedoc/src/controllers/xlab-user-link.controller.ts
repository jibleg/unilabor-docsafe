import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { XlabUnavailableError } from '../config/xlab-db';
import type { XlabUserLinkBody } from '../schemas/xlab-user-link.schema';
import {
  auditXlabLinkChange,
  createEmployeeXlabLink,
  deleteEmployeeXlabLink,
  getEmployeeXlabLink,
  listAvailableXlabUsers,
  updateEmployeeXlabLink,
} from '../services/xlab-user-link.service';

/** Administracion de RH del vinculo DocSafe <-> XLab desde la ficha del colaborador. */

const STATUS_BY_CODE: Record<string, number> = {
  XLAB_LINK_EMPLOYEE_NOT_FOUND: 404,
  XLAB_LINK_NOT_FOUND: 404,
  XLAB_LINK_USER_NOT_FOUND: 404,
  XLAB_LINK_NO_DOCSAFE_USER: 400,
  XLAB_LINK_USER_INACTIVE: 400,
  XLAB_LINK_ALREADY_LINKED: 409,
  XLAB_LINK_USER_TAKEN: 409,
};

const parseEmployeeId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const fail = (res: Response, error: any, context: string, message: string) => {
  if (error instanceof XlabUnavailableError) {
    return res.status(503).json({ message: 'XLab no esta disponible por el momento. Intenta mas tarde.' });
  }
  const status = STATUS_BY_CODE[error?.code];
  if (status) {
    return res.status(status).json({ message: error.publicMessage });
  }
  console.error(context, error);
  return res.status(500).json({ message });
};

/** GET /employees/xlab-users?q= */
export const listAvailableXlabUsersController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ users: await listAvailableXlabUsers(String(req.query.q ?? '')) });
  } catch (error) {
    return fail(res, error, 'Error listando usuarios de XLab:', 'No se pudieron cargar los usuarios de XLab.');
  }
};

/** GET /employees/:id/xlab-link */
export const getEmployeeXlabLinkController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json({ link: await getEmployeeXlabLink(employeeId) });
  } catch (error) {
    return fail(res, error, 'Error consultando vinculo con XLab:', 'No se pudo consultar el vinculo con XLab.');
  }
};

/** POST /employees/:id/xlab-link {cve_usuario} */
export const createEmployeeXlabLinkController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) return res.status(400).json({ message: 'ID invalido.' });
  const actorId = req.user?.id;
  if (!actorId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const { cve_usuario } = req.body as XlabUserLinkBody;
  try {
    const link = await createEmployeeXlabLink(employeeId, cve_usuario, actorId);
    await auditXlabLinkChange(req, 'RH_XLAB_LINK_CREATE', link);
    return res.status(201).json({ link: await getEmployeeXlabLink(employeeId) });
  } catch (error) {
    return fail(res, error, 'Error creando vinculo con XLab:', 'No se pudo crear el vinculo con XLab.');
  }
};

/** PUT /employees/:id/xlab-link {cve_usuario} */
export const updateEmployeeXlabLinkController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) return res.status(400).json({ message: 'ID invalido.' });
  const actorId = req.user?.id;
  if (!actorId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const { cve_usuario } = req.body as XlabUserLinkBody;
  try {
    const link = await updateEmployeeXlabLink(employeeId, cve_usuario, actorId);
    await auditXlabLinkChange(req, 'RH_XLAB_LINK_UPDATE', link);
    return res.json({ link: await getEmployeeXlabLink(employeeId) });
  } catch (error) {
    return fail(res, error, 'Error cambiando vinculo con XLab:', 'No se pudo cambiar el vinculo con XLab.');
  }
};

/** DELETE /employees/:id/xlab-link */
export const deleteEmployeeXlabLinkController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) return res.status(400).json({ message: 'ID invalido.' });
  try {
    await auditXlabLinkChange(req, 'RH_XLAB_LINK_DELETE', await deleteEmployeeXlabLink(employeeId));
    return res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'Error quitando vinculo con XLab:', 'No se pudo quitar el vinculo con XLab.');
  }
};
