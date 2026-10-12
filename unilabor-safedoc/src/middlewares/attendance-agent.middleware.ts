import type { NextFunction, Request, Response } from 'express';
import { handleAttendanceError } from '../controllers/attendance/attendance-http';
import { authenticateAgentKey, type AuthenticatedAgent } from '../services/attendance/agent-auth.service';

/** Autentica al agente local por su clave (Bearer 64 hex); deja el agente en res.locals.agent. */
export const authenticateAgent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.locals.agent = await authenticateAgentKey(req.headers.authorization);
    next();
  } catch (error) {
    handleAttendanceError(res, error, 'No se pudo autenticar al agente');
  }
};

export const getAuthenticatedAgent = (res: Response): AuthenticatedAgent => res.locals.agent as AuthenticatedAgent;
