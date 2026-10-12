/**
 * Funciones puras de eventos: normalizacion de la hora, metodo de verificacion
 * HikVision, conversion a la forma que espera DocSafe y corte de lotes por tamano.
 */

/** Metodo de identificacion segun currentVerifyMode / minor de HikVision. */
export function methodOfEvent(e) {
  const mode = String(e?.currentVerifyMode ?? '').toLowerCase();
  if (mode.includes('face')) return 'face';
  if (mode.includes('fp') || mode.includes('finger')) return 'fingerprint';
  if (mode.includes('card')) return 'card';
  if (mode.includes('pw') || mode.includes('password')) return 'pin';
  if (e?.minor === 75) return 'face';
  if (e?.minor === 38) return 'fingerprint';
  if (e?.minor === 1) return 'card';
  return 'other';
}

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Desfase de la zona de esta PC para una fecha, como "+hh:mm" / "-hh:mm". */
export function localOffsetString(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Hora del reloj con desfase explicito (si viene sin zona se usa la de esta PC). Null si es invalida. */
export function normalizeDeviceTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const withOffset = HAS_OFFSET.test(text) ? text : `${text.replace(' ', 'T')}${localOffsetString(new Date(text))}`;
  const date = new Date(withOffset);
  return Number.isNaN(date.getTime()) ? null : withOffset;
}

/** Evento ISAPI (AcsEvent / push) -> evento de cola, o null si no es una checada con numero de empleado. */
export function toQueueEvent(terminalSerial, e, photoBase64 = null) {
  const employeeNo = e?.employeeNoString ?? (e?.employeeNo != null ? String(e.employeeNo) : null);
  const serial = e?.serialNo ?? e?.serial;
  const deviceTime = normalizeDeviceTime(e?.time ?? e?.dateTime);
  if (!employeeNo || serial == null || !deviceTime) return null;
  return {
    terminalSerial,
    serial: String(serial),
    employeeNo: String(employeeNo),
    deviceTime,
    attendanceStatus: e.attendanceStatus ?? null,
    method: methodOfEvent(e),
    photoBase64,
  };
}

/** Forma que viaja a DocSafe (sin campos internos de la cola). */
export function toWireEvent(e) {
  const wire = { serial: e.serial, employeeNo: e.employeeNo, deviceTime: e.deviceTime, method: e.method };
  if (e.attendanceStatus) wire.attendanceStatus = e.attendanceStatus;
  if (e.photoBase64) wire.photoBase64 = e.photoBase64;
  return wire;
}

/**
 * Corta una lista de eventos para que el cuerpo no pase de maxBytes (DocSafe
 * acepta 5 MB por peticion). Siempre devuelve al menos un evento si hay alguno.
 */
export function takeWithinSize(events, maxBytes = 3_500_000, maxCount = 100) {
  const taken = [];
  let size = 0;
  for (const event of events) {
    const eventSize = 300 + (event.photoBase64?.length ?? 0);
    if (taken.length > 0 && (size + eventSize > maxBytes || taken.length >= maxCount)) break;
    taken.push(event);
    size += eventSize;
  }
  return taken;
}

/** Hora local sin zona como la espera ISAPI (YYYY-MM-DDTHH:mm:ss). */
export function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
