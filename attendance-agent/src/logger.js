/**
 * Log del agente: imprime en la terminal y lo guarda en un archivo con la hora LOCAL (con su desfase
 * respecto a UTC, p. ej. 2026-10-13T12:29:33-06:00). Rota por tamano para no crecer sin limite:
 * agente.log -> agente.log.1 -> ... -> agente.log.<maxFiles>.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** Hora local con desfase: AAAA-MM-DDTHH:MM:SS-06:00. */
export function localTimestamp(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T`
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Rota el archivo si ya paso del tamano maximo. */
export function rotateIfNeeded(path, maxBytes, maxFiles) {
  if (!existsSync(path) || statSync(path).size < maxBytes) return false;
  rmSync(`${path}.${maxFiles}`, { force: true });
  for (let i = maxFiles - 1; i >= 1; i -= 1) {
    if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`);
  }
  renameSync(path, `${path}.1`);
  return true;
}

/** Crea el logger. logPath vacio o false = solo terminal. Un fallo al escribir el archivo nunca detiene al agente. */
export function createLogger({ logPath, maxBytes = 5 * 1024 * 1024, maxFiles = 5, now = () => new Date(), out = console.log } = {}) {
  if (logPath) {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch { /* se intentara al escribir */ }
  }
  return (message) => {
    const line = `${localTimestamp(now())} ${message}`;
    out(line);
    if (!logPath) return;
    try {
      rotateIfNeeded(logPath, maxBytes, maxFiles);
      appendFileSync(logPath, `${line}\n`);
    } catch { /* sin disco o sin permiso: el log en pantalla sigue funcionando */ }
  };
}
