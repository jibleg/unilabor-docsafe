import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';
import { getUserPermissionCodes } from '../services/permission.service';

export interface JWTPayload {
  id: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  mustChangePassword: boolean;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;
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
    // 401 (no 403) para que el frontend distinga "sesion expirada/invalida"
    // (-> logout + redirect) de "permisos insuficientes" (403 de requirePermission).
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
};

// RBAC por accion. Autoriza si el usuario tiene AL MENOS UNO de los permisos
// indicados (semantica OR). Unico guard de autorizacion del sistema tras
// deprecar los guards por rol de modulo (Fase 5).
export const requirePermission = (required: string | string[]) => {
  const requiredCodes = (Array.isArray(required) ? required : [required]).map((code) =>
    code.trim().toUpperCase(),
  );

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Sesion invalida o expirada' });
    }

    try {
      const permissions = await getUserPermissionCodes(req.user.id);
      const hasPermission = requiredCodes.some((code) => permissions.has(code));

      if (!hasPermission) {
        return res.status(403).json({
          message: 'No tienes el permiso necesario para realizar esta accion',
        });
      }

      next();
    } catch (error) {
      console.error('Error validando permiso:', error);
      return res.status(500).json({ message: 'No se pudo validar el permiso' });
    }
  };
};
