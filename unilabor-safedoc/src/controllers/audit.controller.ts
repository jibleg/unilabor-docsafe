import type { Response } from 'express';
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

// La autorizacion es una sola capacidad de sistema (ADMIN.AUDIT.READ, aplicada
// por requirePermission en la ruta): el auditor del sistema consulta la bitacora
// de CUALQUIER modulo. `module_code` es solo un filtro, no un control de acceso
// por modulo (en RBAC no existen permisos de auditoria por modulo).
export const getAuditLogsController = async (req: AuthRequest, res: Response) => {
  const moduleCode = resolveRequestedModule(req.query.module_code) ?? 'QUALITY';
  const employeeId = parsePositiveInt(req.query.employee_id);
  const limit = parsePositiveInt(req.query.limit) ?? 100;

  try {
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
