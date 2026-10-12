import type { Response } from 'express';
import { AttendanceError, ERROR_HTTP_STATUS } from '../../services/attendance/attendance-errors';

/** Entero positivo de un parametro de ruta/consulta, o null si no es valido. */
export const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Fecha 'YYYY-MM-DD' valida de un parametro de consulta, o null. */
export const parseDateParam = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
};

/**
 * Traduce un error a respuesta HTTP. Los AttendanceError llevan su mensaje
 * publico; cualquier otro es un 500 generico (el detalle va solo al log).
 */
export const handleAttendanceError = (res: Response, error: unknown, fallbackMessage: string): Response => {
  if (error instanceof AttendanceError) {
    return res.status(ERROR_HTTP_STATUS[error.code]).json({
      message: error.publicMessage,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  console.error(`[attendance] ${fallbackMessage}:`, error);
  return res.status(500).json({ message: fallbackMessage });
};
