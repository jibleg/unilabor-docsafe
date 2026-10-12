/**
 * Errores de dominio del modulo de asistencias. Los controladores los traducen
 * a HTTP con `handleAttendanceError` (ver controllers/attendance/attendance-http.ts).
 */
export type AttendanceErrorCode =
  | 'ATTENDANCE_INVALID'
  | 'ATTENDANCE_NOT_FOUND'
  | 'ATTENDANCE_CONFLICT'
  | 'ATTENDANCE_FORBIDDEN'
  | 'ATTENDANCE_UNAUTHENTICATED';

export class AttendanceError extends Error {
  readonly code: AttendanceErrorCode;
  readonly publicMessage: string;
  readonly details: unknown;

  constructor(code: AttendanceErrorCode, publicMessage: string, details?: unknown) {
    super(`${code}: ${publicMessage}`);
    this.name = 'AttendanceError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

export const invalid = (message: string, details?: unknown): never => {
  throw new AttendanceError('ATTENDANCE_INVALID', message, details);
};
export const notFound = (message: string): never => {
  throw new AttendanceError('ATTENDANCE_NOT_FOUND', message);
};
export const conflict = (message: string, details?: unknown): never => {
  throw new AttendanceError('ATTENDANCE_CONFLICT', message, details);
};

export const ERROR_HTTP_STATUS: Record<AttendanceErrorCode, number> = {
  ATTENDANCE_INVALID: 400,
  ATTENDANCE_NOT_FOUND: 404,
  ATTENDANCE_CONFLICT: 409,
  ATTENDANCE_FORBIDDEN: 403,
  ATTENDANCE_UNAUTHENTICATED: 401,
};
