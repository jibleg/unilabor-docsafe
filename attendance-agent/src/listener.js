/**
 * Servidor HTTP en la LAN que recibe el push del reloj (ISAPI HTTP listening):
 * JSON directo o multipart con la parte `event_log` y la foto. Solo guarda
 * eventos de control de acceso con numero de empleado.
 */
import { createServer } from 'node:http';
import { toQueueEvent } from './events.js';

/** Partes de un cuerpo multipart/form-data. */
export function parseMultipart(body, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let i = body.indexOf(sep);
  while (i !== -1) {
    const end = body.indexOf(sep, i + sep.length);
    if (end === -1) break;
    const chunk = body.subarray(i + sep.length, end);
    const headEnd = chunk.indexOf('\r\n\r\n');
    if (headEnd !== -1) {
      const head = chunk.subarray(0, headEnd).toString();
      parts.push({
        name: /name="([^"]+)"/.exec(head)?.[1] ?? '',
        type: /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? '',
        data: chunk.subarray(headEnd + 4, chunk.length - 2),
      });
    }
    i = end;
  }
  return parts;
}

/** Extrae {event, photoBase64} de la peticion del reloj. */
export function parsePush(contentType, body) {
  let event = null;
  let photoBase64 = null;
  if (contentType.startsWith('multipart/')) {
    const boundary = /boundary=([^;]+)/.exec(contentType)?.[1]?.replace(/^"|"$/g, '') ?? '';
    for (const p of parseMultipart(body, boundary)) {
      if (p.type.includes('json') || p.name === 'event_log') {
        try { event = JSON.parse(p.data.toString()); } catch { /* parte no JSON */ }
      } else if (p.type.startsWith('image/')) {
        photoBase64 = p.data.toString('base64');
      }
    }
  } else if (body.length > 0) {
    try { event = JSON.parse(body.toString()); } catch { /* XML u otro formato: se ignora */ }
  }
  return { event, photoBase64 };
}

/** Evento de cola a partir del push, o null si no es una checada. */
export function pushToQueueEvent(terminalSerial, event, photoBase64) {
  const acs = event?.AccessControllerEvent;
  if (event?.eventType !== 'AccessControllerEvent' || !acs) return null;
  return toQueueEvent(terminalSerial, { ...acs, time: event.dateTime ?? new Date().toISOString() }, photoBase64);
}

export function startListener(port, queue, serialOfIp, log) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const { event, photoBase64 } = parsePush(String(req.headers['content-type'] ?? ''), Buffer.concat(chunks));
        const remoteIp = (req.socket.remoteAddress ?? '').replace('::ffff:', '');
        const serial = serialOfIp(remoteIp);
        const queued = serial ? pushToQueueEvent(serial, event, photoBase64) : null;
        if (queued && queue.add(queued)) log(`push ${serial} #${queued.employeeNo} ${queued.attendanceStatus ?? ''} serial ${queued.serial}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (err) {
        log(`push invalido: ${err.message}`);
        res.writeHead(400);
        res.end();
      }
    });
  });
  server.listen(port, () => log(`escuchando el push del reloj en el puerto ${port}`));
  return server;
}
