import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
