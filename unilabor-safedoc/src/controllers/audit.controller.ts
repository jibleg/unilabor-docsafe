import type { Response } from 'express';
import { listUserModuleAccess } from '../services/module-access.service';
import { listAuditLogs } from '../services/audit.service';
import type { AuthRequest, ModuleCode } from '../types';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const resolveRequestedModule = (value: unknown): ModuleCode | undefined => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'QUALITY' || normalized === 'RH' || normalized === 'HELPDESK') {
    return normalized;
  }

  return undefined;
};

const canReadAuditForModule = async (
  userId: string,
  globalRole: string,
  moduleCode: ModuleCode,
): Promise<boolean> => {
  const modules = await listUserModuleAccess(userId, globalRole as any);
  const moduleAccess = modules.find((entry) => entry.code === moduleCode);

  if (!moduleAccess) {
    return false;
  }

  if (moduleCode === 'QUALITY') {
    return moduleAccess.role === 'ADMIN';
  }

  return moduleAccess.role === 'ADMIN' || moduleAccess.role === 'EDITOR';
};

export const getAuditLogsController = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user?.id || !user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  const moduleCode = resolveRequestedModule(req.query.module_code) ?? 'QUALITY';
  const employeeId = parsePositiveInt(req.query.employee_id);
  const limit = parsePositiveInt(req.query.limit) ?? 100;

  try {
    const canReadAudit = await canReadAuditForModule(user.id, user.role, moduleCode);
    if (!canReadAudit) {
      return res.status(403).json({
        message: 'No tienes permisos para consultar la auditoria del modulo solicitado.',
      });
    }

    const logs = await listAuditLogs({
      module_code: moduleCode,
      ...(employeeId ? { employee_id: employeeId } : {}),
      limit,
    });

    return res.json({ logs });
  } catch (error) {
    console.error('Error consultando auditoria:', error);
    return res.status(500).json({ message: 'No se pudo consultar la auditoria.' });
  }
};
