// src/types/index.ts
import { Request } from 'express';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface JWTPayload {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Esta es la interfaz que te está pidiendo el controlador
export interface AuthRequest extends Request {
  user?: JWTPayload;
}