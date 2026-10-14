/**
 * Cliente ISAPI minimo para relojes HikVision: Digest MD5 (fallback Basic),
 * JSON, XML plano y multipart (foto del rostro). Sin dependencias.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isoLocal } from './events.js';

const md5 = (s) => createHash('md5').update(s).digest('hex');
export const TIMEOUT_MS = 15_000;
/** Las capturas esperan a que la persona ponga el dedo o el rostro frente al equipo. */
export const CAPTURE_TIMEOUT_MS = 60_000;

const ISAPI_XML_NS = 'xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0"';

/** Resumen corto de una respuesta de error del reloj (XML o JSON): estado, subestado y mensaje. */
export function summarizeError(text) {
  const pick = (xml, json) => text.match(xml)?.[1] ?? text.match(json)?.[1];
  const parts = [
    pick(/<statusString>([^<]*)</, /"statusString"\s*:\s*"([^"]*)"/),
    pick(/<subStatusCode>([^<]*)</, /"subStatusCode"\s*:\s*"([^"]*)"/),
    pick(/<errorMsg>([^<]*)</, /"errorMsg"\s*:\s*"([^"]*)"/),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : text.replace(/\s+/g, ' ').slice(0, 200);
}

/** Texto de una etiqueta XML plana (<tag>valor</tag>); null si no esta. */
export function xmlTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim() || null;
}

/** Primer JPEG dentro de un cuerpo binario (p. ej. multipart): de FFD8FF al ultimo FFD9. */
export function extractJpeg(buffer) {
  const start = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (start < 0) return null;
  const end = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return end > start ? buffer.subarray(start, end + 2) : null;
}

/** Cabecera Authorization: Digest ... para un reto WWW-Authenticate. */
export function digestAuthorization(challenge, method, uri, username, password, cnonce = randomBytes(8).toString('hex')) {
  const fields = {};
  for (const m of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) fields[m[1]] = m[2] ?? m[3];
  const realm = fields.realm ?? '';
  const nonce = fields.nonce ?? '';
  const qop = (fields.qop ?? '').split(',')[0].trim() || null;
  const nc = '00000001';
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [`username="${username}"`, `realm="${realm}"`, `nonce="${nonce}"`, `uri="${uri}"`, `response="${response}"`];
  if (fields.opaque) parts.push(`opaque="${fields.opaque}"`);
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (fields.algorithm) parts.push(`algorithm=${fields.algorithm}`);
  return `Digest ${parts.join(', ')}`;
}

export class IsapiClient {
  constructor(terminal) {
    this.t = terminal;
  }

  get base() {
    return `http://${this.t.ip}:${this.t.port ?? 80}`;
  }

  /** Peticion con Digest: primer intento sin credenciales, segundo con la respuesta al reto. */
  async request(method, path, body, headers = {}, timeoutMs = TIMEOUT_MS) {
    const url = `${this.base}${path}`;
    const first = await fetch(url, { method, body: body ?? undefined, headers, signal: AbortSignal.timeout(timeoutMs) });
    if (first.status !== 401) return first;
    const challenge = first.headers.get('www-authenticate') ?? '';
    const auth = challenge.toLowerCase().startsWith('digest')
      ? digestAuthorization(challenge, method, path, this.t.username, this.t.password)
      : `Basic ${Buffer.from(`${this.t.username}:${this.t.password}`).toString('base64')}`;
    return fetch(url, { method, body: body ?? undefined, headers: { ...headers, Authorization: auth }, signal: AbortSignal.timeout(timeoutMs) });
  }

  /**
   * GET con credenciales desde el primer intento. Las rutas /LOCALS/pic/... no piden
   * autenticacion: sin credenciales el reloj contesta 404 en vez de 401, y `request` nunca
   * llega a firmar. Se toma el reto de una ruta protegida y se firma la ruta de la foto.
   */
  async getAuthed(path, timeoutMs = TIMEOUT_MS) {
    const probe = await fetch(`${this.base}/ISAPI/System/deviceInfo`, { signal: AbortSignal.timeout(timeoutMs) });
    await probe.arrayBuffer();
    const challenge = probe.headers.get('www-authenticate') ?? '';
    const auth = challenge.toLowerCase().startsWith('digest')
      ? digestAuthorization(challenge, 'GET', path, this.t.username, this.t.password)
      : `Basic ${Buffer.from(`${this.t.username}:${this.t.password}`).toString('base64')}`;
    return fetch(`${this.base}${path}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(timeoutMs) });
  }

  async json(method, path, body, timeoutMs = TIMEOUT_MS) {
    const r = await this.request(method, path, body === undefined ? null : JSON.stringify(body), { 'Content-Type': 'application/json' }, timeoutMs);
    const text = await r.text();
    if (!r.ok) throw new Error(`ISAPI ${method} ${path} -> ${r.status}: ${summarizeError(text)}`);
    return text ? JSON.parse(text) : {};
  }

  /** Peticion con cuerpo XML; devuelve el estado, el tipo de contenido y el cuerpo binario. */
  async xmlRequest(method, path, xmlBody, timeoutMs = TIMEOUT_MS) {
    const r = await this.request(method, path, `<?xml version="1.0" encoding="UTF-8"?>${xmlBody}`, { 'Content-Type': 'application/xml' }, timeoutMs);
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!r.ok) throw new Error(`ISAPI ${method} ${path} -> ${r.status}: ${summarizeError(buffer.toString('utf8'))}`);
    return { status: r.status, contentType: r.headers.get('content-type') ?? '', buffer };
  }

  /** Campos de un XML plano (deviceInfo, time). */
  async xml(path) {
    const r = await this.request('GET', path);
    const text = await r.text();
    if (!r.ok) throw new Error(`ISAPI GET ${path} -> ${r.status}`);
    const fields = {};
    for (const m of text.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) fields[m[1]] = m[2];
    return fields;
  }

  async multipart(path, jsonField, json, file, method = 'POST') {
    const boundary = `----docsafe${randomBytes(8).toString('hex')}`;
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="${jsonField}"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(json)}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(head), file.data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const r = await this.request(method, path, body, { 'Content-Type': `multipart/form-data; boundary=${boundary}` });
    const text = await r.text();
    if (!r.ok) throw new Error(`ISAPI ${method} ${path} -> ${r.status}: ${summarizeError(text)}`);
    return text ? JSON.parse(text) : {};
  }
}

// -- Operaciones de alto nivel ----------------------------------------------

export async function terminalInfo(c) {
  const info = await c.xml('/ISAPI/System/deviceInfo');
  let deviceTime = null;
  try { deviceTime = (await c.xml('/ISAPI/System/time')).localTime ?? null; } catch { /* sin hora */ }
  let people = null;
  try {
    const count = await c.json('GET', '/ISAPI/AccessControl/UserInfo/Count?format=json');
    people = Number(count?.UserInfoCount?.userNumber ?? NaN);
    if (!Number.isFinite(people)) people = null;
  } catch { /* el equipo no reporta conteo */ }
  return { serial: info.serialNumber ?? '', model: info.model ?? '', firmware: info.firmwareVersion ?? '', deviceTime, people };
}

/** Eventos de control de acceso (major 5) en un rango, paginando de 30 en 30. */
export async function searchEvents(c, from, to, maxTotal = 5000) {
  const searchID = randomBytes(8).toString('hex');
  const events = [];
  let position = 0;
  while (events.length < maxTotal) {
    const r = await c.json('POST', '/ISAPI/AccessControl/AcsEvent?format=json', {
      AcsEventCond: { searchID, searchResultPosition: position, maxResults: 30, major: 5, minor: 0, startTime: isoLocal(from), endTime: isoLocal(to) },
    });
    const list = r.AcsEvent?.InfoList ?? [];
    events.push(...list);
    position += list.length;
    if (r.AcsEvent?.responseStatusStrg !== 'MORE' || list.length === 0) break;
  }
  return events;
}

export async function syncPerson(c, employeeNo, name) {
  const person = {
    employeeNo, name, userType: 'normal',
    Valid: { enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2037-12-31T23:59:59', timeType: 'local' },
    doorRight: '1', RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
  };
  const found = await c.json('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', {
    UserInfoSearchCond: { searchID: randomBytes(4).toString('hex'), searchResultPosition: 0, maxResults: 1, EmployeeNoList: [{ employeeNo }] },
  });
  if ((found.UserInfoSearch?.numOfMatches ?? 0) > 0) await c.json('PUT', '/ISAPI/AccessControl/UserInfo/Modify?format=json', { UserInfo: person });
  else await c.json('POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', { UserInfo: person });
}

export async function removePerson(c, employeeNo) {
  await c.json('PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', { UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } });
}

/** Prueba cada variante de la peticion (el firmware decide si habla XML o JSON) y junta los errores para diagnosticar. */
async function firstSuccess(attempts, failure) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const value = await attempt();
      if (value) return value;
      errors.push('respuesta sin datos');
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`${failure} Detalle: ${errors.join(' | ')}`);
}

/** Captura guiada de huella en el equipo (la persona pone el dedo); depende del modelo. */
export async function captureFingerprint(c, employeeNo, finger) {
  const fingerData = await firstSuccess([
    async () => {
      const r = await c.xmlRequest('POST', '/ISAPI/AccessControl/CaptureFingerPrint',
        `<CaptureFingerPrintCond ${ISAPI_XML_NS}><fingerNo>${finger}</fingerNo></CaptureFingerPrintCond>`, CAPTURE_TIMEOUT_MS);
      return xmlTag(r.buffer.toString('utf8'), 'fingerData');
    },
    async () => (await c.json('POST', '/ISAPI/AccessControl/CaptureFingerPrint?format=json', { CaptureFingerPrintCond: { fingerNo: finger } }, CAPTURE_TIMEOUT_MS)).CaptureFingerPrint?.fingerData,
  ], 'El reloj no devolvio la huella (no se coloco el dedo a tiempo o el equipo no soporta la captura remota). Enrola directamente en el equipo.');
  await c.json('POST', '/ISAPI/AccessControl/FingerPrintDownload?format=json', {
    FingerPrintCfg: { employeeNo, enableCardReader: [1], fingerPrintID: finger, fingerType: 'normalFP', fingerData },
  });
}

/** Foto del rostro capturada por el equipo: base64 (JSON), JPEG dentro de multipart o una URL a descargar. */
async function readCapturedFace(c, contentType, buffer) {
  const jpeg = extractJpeg(buffer);
  if (jpeg) return jpeg;
  const text = buffer.toString('utf8');
  let base64 = xmlTag(text, 'faceData');
  let url = xmlTag(text, 'faceDataUrl');
  if (!base64 && !url && text.trim().startsWith('{')) {
    const json = JSON.parse(text).CaptureFaceData ?? {};
    base64 = json.faceData ?? null;
    url = json.faceDataUrl ?? null;
  }
  if (base64) return Buffer.from(base64, 'base64');
  if (url) {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const r = await c.request('GET', path);
    if (!r.ok) throw new Error(`ISAPI GET ${path} -> ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`respuesta no reconocida (${contentType || 'sin tipo'}): ${summarizeError(text)}`);
}

export async function captureFace(c, employeeNo) {
  const image = await firstSuccess([
    async () => {
      const r = await c.xmlRequest('POST', '/ISAPI/AccessControl/CaptureFaceData',
        `<CaptureFaceDataCond ${ISAPI_XML_NS}><captureInfrared>false</captureInfrared><dataType>binary</dataType></CaptureFaceDataCond>`, CAPTURE_TIMEOUT_MS);
      return readCapturedFace(c, r.contentType, r.buffer);
    },
    async () => {
      const r = await c.request('POST', '/ISAPI/AccessControl/CaptureFaceData?format=json',
        JSON.stringify({ CaptureFaceDataCond: { captureInfrared: false, dataType: 'binary' } }), { 'Content-Type': 'application/json' }, CAPTURE_TIMEOUT_MS);
      const buffer = Buffer.from(await r.arrayBuffer());
      if (!r.ok) throw new Error(`ISAPI POST CaptureFaceData -> ${r.status}: ${summarizeError(buffer.toString('utf8'))}`);
      return readCapturedFace(c, r.headers.get('content-type') ?? '', buffer);
    },
  ], 'El reloj no devolvio el rostro (nadie se coloco frente a la camara o el equipo no soporta la captura remota). Enrola directamente en el equipo.');
  await c.multipart('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', 'FaceDataRecord',
    { faceLibType: 'blackFD', FDID: '1', FPID: employeeNo }, { name: `${employeeNo}.jpg`, mime: 'image/jpeg', data: image });
}

/**
 * Sube la fotografia de rostro de una persona (JPEG enviado desde DocSafe) a la biblioteca de rostros del equipo.
 * Si la persona ya tiene rostro, lo reemplaza (FDSetUp). La persona debe existir en el reloj (sync_person).
 */
export async function uploadFace(c, employeeNo, jpeg) {
  const record = { faceLibType: 'blackFD', FDID: '1', FPID: employeeNo };
  const file = { name: `${employeeNo}.jpg`, mime: 'image/jpeg', data: jpeg };
  try {
    await c.multipart('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', 'FaceDataRecord', record, file);
  } catch (err) {
    // Ya tenia rostro (o el equipo lo rechazo por duplicado): se intenta reemplazarlo.
    try {
      await c.multipart('/ISAPI/Intelligent/FDLib/FDSetUp?format=json', 'FaceDataRecord', record, file, 'PUT');
    } catch (second) {
      throw new Error(`El reloj rechazo la fotografia (verifica que sea un rostro de frente, nítido y que la persona exista en el equipo). ${second.message}`);
    }
  }
}

/** Apunta el push (HTTP listening) del reloj al agente. Mejor esfuerzo. */
export async function configurePush(c, agentIp, port) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><HttpHostNotification><id>1</id><url>/evento</url><protocolType>HTTP</protocolType><parameterFormatType>JSON</parameterFormatType><addressingFormatType>ipaddress</addressingFormatType><ipAddress>${agentIp}</ipAddress><portNo>${port}</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod></HttpHostNotification>`;
  const r = await c.request('PUT', '/ISAPI/Event/notification/httpHosts/1', xml, { 'Content-Type': 'application/xml' });
  return r.ok;
}

/** Todas las personas registradas en el reloj (paginado de 30 en 30). `faceURL` solo viene si la persona tiene rostro. */
export async function listPeople(c) {
  const people = [];
  const searchID = randomBytes(4).toString('hex');
  for (let position = 0; position < 20_000;) {
    const r = await c.json('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', {
      UserInfoSearchCond: { searchID, searchResultPosition: position, maxResults: 30 },
    });
    const list = r.UserInfoSearch?.UserInfo ?? [];
    people.push(...list.map((u) => ({
      employeeNo: String(u.employeeNo), name: String(u.name ?? '').trim(),
      numOfFace: Number(u.numOfFace ?? 0), faceURL: u.faceURL ?? null,
    })));
    position += list.length;
    if (r.UserInfoSearch?.responseStatusStrg !== 'MORE' || list.length === 0) break;
  }
  return people;
}

/** Foto de rostro de una persona (JPEG) a partir de su `faceURL`; null si el reloj no devuelve un JPEG. */
export async function downloadFace(c, faceURL) {
  const url = new URL(faceURL, c.base);
  const r = await c.getAuthed(`${url.pathname}${url.search}`);
  if (!r.ok) throw new Error(`ISAPI GET ${url.pathname} -> ${r.status}`);
  return extractJpeg(Buffer.from(await r.arrayBuffer()));
}
