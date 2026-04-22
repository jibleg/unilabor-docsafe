import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { listUserModuleAccess } from '../services/module-access.service';

export interface JWTPayload {
  id: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  mustChangePassword: boolean;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

type ModuleCode = 'QUALITY' | 'RH' | 'HELPDESK';

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JWTPayload;
    req.user = decoded;

    const isChangePasswordRoute =
      req.method === 'PATCH' &&
      (req.originalUrl.endsWith('/api/users/change-password') || req.path === '/change-password');

    if (decoded.mustChangePassword && !isChangePasswordRoute) {
      return res.status(428).json({
        message: 'Debes cambiar tu contrasena temporal para continuar',
        mustChangePassword: true,
      });
    }

    next();
  } catch (_error) {
    return res.status(403).json({ message: 'Token invalido o expirado' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'No tienes los permisos necesarios para realizar esta accion',
      });
    }
    next();
  };
};

export const authorizeModuleAccess = (moduleCode: ModuleCode) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Sesion invalida o expirada' });
    }

    try {
      const availableModules = await listUserModuleAccess(req.user.id, req.user.role);
      const moduleAccess = availableModules.find((entry) => entry.code === moduleCode);

      if (!moduleAccess) {
        return res.status(403).json({ message: `No tienes acceso al modulo ${moduleCode}` });
      }

      next();
    } catch (error) {
      console.error('Error validando acceso al modulo:', error);
      return res.status(500).json({ message: 'No se pudo validar el acceso al modulo' });
    }
  };
};

export const authorizeModuleRole = (moduleCode: ModuleCode, roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Sesion invalida o expirada' });
    }

    try {
      const availableModules = await listUserModuleAccess(req.user.id, req.user.role);
      const moduleAccess = availableModules.find((entry) => entry.code === moduleCode);

      if (!moduleAccess) {
        return res.status(403).json({ message: `No tienes acceso al modulo ${moduleCode}` });
      }

      if (!roles.includes(moduleAccess.role)) {
        return res.status(403).json({
          message: 'No tienes los permisos necesarios para realizar esta accion en este modulo',
        });
      }

      next();
    } catch (error) {
      console.error('Error validando rol por modulo:', error);
      return res.status(500).json({ message: 'No se pudo validar el permiso por modulo' });
    }
  };
};
