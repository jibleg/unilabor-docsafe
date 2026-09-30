import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { getAgreementDashboard } from '../services/agreement-dashboard.service';
import { getUserPermissionCodes } from '../services/permission.service';

/**
 * GET /providers/dashboard/contracts — panorama ejecutivo de Acuerdos. Incluye
 * proveedores y/o clientes segun los permisos de lectura del usuario.
 */
export const getAgreementDashboardController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  try {
    const permissions = await getUserPermissionCodes(req.user.id);
    const includes = {
      providers: permissions.has('PROVIDERS.DOCUMENTS.READ'),
      clients: permissions.has('PROVIDERS.CLIENTS.DOCUMENTS.READ'),
    };
    if (!includes.providers && !includes.clients) {
      return res.status(403).json({ message: 'No tienes permiso para consultar los acuerdos.' });
    }
    return res.json({ dashboard: await getAgreementDashboard(includes) });
  } catch (error) {
    console.error('Error cargando el panorama de acuerdos:', error);
    return res.status(500).json({ message: 'No se pudo cargar el panorama de acuerdos.' });
  }
};
