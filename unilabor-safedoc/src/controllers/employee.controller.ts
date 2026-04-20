import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployeeSummary,
  listEmployees,
  listLinkableUsers,
  type EmployeePayload,
  updateEmployee,
} from '../services/employee.service';

const getText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const parseEmployeeId = (value: unknown): number | null => {
  const parsedValue = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
};

const mapEmployeeError = (res: Response, error: any) => {
  if (error?.code === 'EMPLOYEES_TABLE_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'La tabla employees no existe. Ejecuta la migracion base de RH antes de continuar.',
    });
  }

  if (error?.code === 'EMPLOYEE_EMAIL_ALREADY_EXISTS') {
    return res.status(409).json({ message: 'Ya existe un colaborador con ese correo.' });
  }

  if (error?.code === 'LINKED_USER_NOT_FOUND') {
    return res.status(404).json({ message: 'El usuario vinculado no existe.' });
  }

  if (error?.code === 'LINKED_USER_INACTIVE') {
    return res.status(400).json({ message: 'No puedes vincular un usuario inactivo.' });
  }

  if (error?.code === 'USER_ALREADY_LINKED_TO_EMPLOYEE') {
    return res.status(409).json({ message: 'Ese usuario ya esta vinculado a otro colaborador.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'El codigo o correo del colaborador ya existe.' });
  }

  return null;
};

const logEmployeeAudit = async (userId: string | undefined, action: string, ipAddress: string | undefined) => {
  if (!userId) {
    return;
  }

  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'RH',
    entity_type: 'employee',
    entity_id: parseEmployeeId(action.split(':')[1]),
    employee_id: parseEmployeeId(action.split(':')[1]),
  });
};

export const listEmployeesController = async (_req: AuthRequest, res: Response) => {
  try {
    const employees = await listEmployees();
    return res.json({ employees });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando colaboradores:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los colaboradores.' });
  }
};

export const getEmployeeSummaryController = async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getEmployeeSummary();
    return res.json({ summary });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo resumen RH:', error);
    return res.status(500).json({ message: 'No se pudo obtener el resumen de colaboradores.' });
  }
};

export const listLinkableUsersController = async (_req: AuthRequest, res: Response) => {
  try {
    const users = await listLinkableUsers();
    return res.json({ users });
  } catch (error) {
    console.error('Error obteniendo usuarios vinculables:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los usuarios del sistema.' });
  }
};

export const getEmployeeByIdController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  try {
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Colaborador no encontrado.' });
    }

    return res.json({ employee });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo colaborador:', error);
    return res.status(500).json({ message: 'No se pudo obtener el colaborador.' });
  }
};

export const createEmployeeController = async (req: AuthRequest, res: Response) => {
  const full_name = getText(req.body?.full_name);
  const email = getText(req.body?.email);

  if (!full_name || !email) {
    return res.status(400).json({ message: 'Nombre completo y correo son obligatorios.' });
  }

  try {
    const employee = await createEmployee({
      employee_code: getText(req.body?.employee_code),
      user_id: getText(req.body?.user_id),
      full_name,
      email,
      area: getText(req.body?.area),
      position: getText(req.body?.position),
    });

    await logEmployeeAudit(req.user?.id, `RH_EMPLOYEE_CREATE:${employee.id}`, req.ip);

    return res.status(201).json({
      message: 'Colaborador creado correctamente.',
      employee,
    });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando colaborador:', error);
    return res.status(500).json({ message: 'No se pudo crear el colaborador.' });
  }
};

export const updateEmployeeController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  const payload: Record<string, unknown> = {};

  if (req.body?.employee_code !== undefined) {
    payload.employee_code = getText(req.body?.employee_code);
  }
  if (req.body?.user_id !== undefined) {
    payload.user_id = getText(req.body?.user_id);
  }
  if (req.body?.full_name !== undefined) {
    payload.full_name = getText(req.body?.full_name) ?? '';
  }
  if (req.body?.email !== undefined) {
    payload.email = getText(req.body?.email) ?? '';
  }
  if (req.body?.area !== undefined) {
    payload.area = getText(req.body?.area);
  }
  if (req.body?.position !== undefined) {
    payload.position = getText(req.body?.position);
  }

  if (
      payload.employee_code === undefined &&
      payload.user_id === undefined &&
      payload.full_name === undefined &&
      payload.email === undefined &&
      payload.area === undefined &&
      payload.position === undefined
  ) {
    return res.status(400).json({
      message: 'Debes enviar al menos un campo para actualizar al colaborador.',
    });
  }

  if (typeof payload.full_name === 'string' && payload.full_name.trim().length === 0) {
    return res.status(400).json({ message: 'El nombre completo no puede quedar vacio.' });
  }

  if (typeof payload.email === 'string' && payload.email.trim().length === 0) {
    return res.status(400).json({ message: 'El correo no puede quedar vacio.' });
  }

  try {
    const employee = await updateEmployee(employeeId, payload as Partial<EmployeePayload>);
    if (!employee) {
      return res.status(404).json({ message: 'Colaborador no encontrado.' });
    }

    await logEmployeeAudit(req.user?.id, `RH_EMPLOYEE_UPDATE:${employeeId}`, req.ip);

    return res.json({
      message: 'Colaborador actualizado correctamente.',
      employee,
    });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando colaborador:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el colaborador.' });
  }
};

export const deleteEmployeeController = async (req: AuthRequest, res: Response) => {
  const employeeId = parseEmployeeId(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  try {
    const employee = await deactivateEmployee(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Colaborador no encontrado.' });
    }

    await logEmployeeAudit(req.user?.id, `RH_EMPLOYEE_DELETE:${employeeId}`, req.ip);

    return res.json({
      message: 'Colaborador inactivado correctamente.',
      employee,
    });
  } catch (error: any) {
    const mappedError = mapEmployeeError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error inactivando colaborador:', error);
    return res.status(500).json({ message: 'No se pudo inactivar el colaborador.' });
  }
};
