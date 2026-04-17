// src/types/index.ts
import { Request } from 'express';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ModuleCode = 'QUALITY' | 'RH';

export interface ModuleAccess {
  code: ModuleCode;
  name: string;
  description?: string | null;
  icon?: string | null;
  role: UserRole;
  is_active: boolean;
  sort_order?: number;
}

export interface JWTPayload {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Esta es la interfaz que te está pidiendo el controlador
export interface AuthRequest extends Request {
  user?: JWTPayload;
}
