import { localMsToInstant } from './timezone';

/**
 * Funciones puras de la ingesta de checadas del reloj HikVision: mapeo de
 * estado/metodo, desfase de hora y deteccion del tipo de imagen.
 */

export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';
export type VerificationMethod = 'face' | 'fingerprint' | 'card' | 'pin' | 'other';

const ATTENDANCE_STATUS_MAP: Record<string, PunchType> = {
  checkin: 'in',
  overtimein: 'in',
  checkout: 'out',
  overtimeout: 'out',
  breakout: 'break_start',
  breakin: 'break_end',
};

/** attendanceStatus de HikVision -> tipo de checada (otro valor -> null). */
export const mapAttendanceStatus = (status: string | null | undefined): PunchType | null =>
  ATTENDANCE_STATUS_MAP[String(status ?? '').trim().toLowerCase()] ?? null;

/** Metodo reportado por el agente (en ingles o espanol) -> verification_method. */
export const mapVerificationMethod = (method: string | null | undefined): VerificationMethod => {
  const value = String(method ?? '').trim().toLowerCase();
  if (value === 'face' || value === 'rostro') return 'face';
  if (value === 'fingerprint' || value === 'huella') return 'fingerprint';
  if (value === 'card' || value === 'tarjeta') return 'card';
  if (value === 'pin' || value === 'pin_terminal') return 'pin';
  return 'other';
};

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/**
 * Hora del evento a instante. Sin zona explicita se interpreta como hora local
 * de pared de la zona del modulo. Devuelve null si no es una fecha valida.
 */
export const parseDeviceTime = (value: string, timeZone: string): Date | null => {
  const text = value.trim();
  if (HAS_OFFSET.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = NAIVE_ISO.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const localMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(localMs)) return null;
  return localMsToInstant(localMs, timeZone);
};

export const HISTORIC_EVENT_MS = 3_600_000;

export interface DriftVerdict {
  needsReview: boolean;
  reason: string | null;
}

/**
 * Desfase entre la hora del reloj y la del servidor. Pasa del umbral y menos de
 * 1 h => revision; mas de 1 h se considera evento historico (recuperacion) y no se marca.
 */
export const evaluateClockDrift = (deviceTime: Date, serverNow: Date, maxMinutes: number): DriftVerdict => {
  const diffMs = Math.abs(deviceTime.getTime() - serverNow.getTime());
  if (diffMs > maxMinutes * 60_000 && diffMs < HISTORIC_EVENT_MS) {
    const minutes = Math.round(diffMs / 60_000);
    return { needsReview: true, reason: `Desfase de hora del reloj: ${minutes} min (maximo ${maxMinutes} min)` };
  }
  return { needsReview: false, reason: null };
};

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export interface DetectedImage {
  extension: 'jpg' | 'png' | 'webp';
  bytes: Buffer;
}

/** Decodifica base64 (con o sin prefijo data:) y valida tipo por firma y tamano. */
export const decodePhoto = (photoBase64: string | null | undefined): DetectedImage | null => {
  if (!photoBase64) return null;
  const raw = photoBase64.replace(/^data:[^;]+;base64,/, '');
  if (raw.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8) return null;
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', bytes };
  }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', bytes };
  }
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { extension: 'webp', bytes };
  }
  return null;
};
