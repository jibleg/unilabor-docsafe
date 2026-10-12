/**
 * Cliente ISAPI minimo para relojes HikVision: Digest MD5 (fallback Basic),
 * JSON, XML plano y multipart (foto del rostro). Sin dependencias.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isoLocal } from './events.js';

const md5 = (s) => createHash('md5').update(s).digest('hex');
export const TIMEOUT_MS = 15_000;

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
  async request(method, path, body, headers = {}) {
    const url = `${this.base}${path}`;
    const first = await fetch(url, { method, body: body ?? undefined, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (first.status !== 401) return first;
    const challenge = first.headers.get('www-authenticate') ?? '';
    const auth = challenge.toLowerCase().startsWith('digest')
      ? digestAuthorization(challenge, method, path, this.t.username, this.t.password)
      : `Basic ${Buffer.from(`${this.t.username}:${this.t.password}`).toString('base64')}`;
    return fetch(url, { method, body: body ?? undefined, headers: { ...headers, Authorization: auth }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }

  async json(method, path, body) {
    const r = await this.request(method, path, body === undefined ? null : JSON.stringify(body), { 'Content-Type': 'application/json' });
    const text = await r.text();
    if (!r.ok) throw new Error(`ISAPI ${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
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

  async multipart(path, jsonField, json, file) {
    const boundary = `----docsafe${randomBytes(8).toString('hex')}`;
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="${jsonField}"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(json)}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(head), file.data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const r = await this.request('POST', path, body, { 'Content-Type': `multipart/form-data; boundary=${boundary}` });
    const text = await r.text();
    if (!r.ok) throw new Error(`ISAPI POST ${path} -> ${r.status}: ${text.slice(0, 200)}`);
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

/** Captura guiada de huella en el equipo; depende del modelo (verificar con el equipo real). */
export async function captureFingerprint(c, employeeNo, finger) {
  const cap = await c.json('POST', '/ISAPI/AccessControl/CaptureFingerPrint', { CaptureFingerPrintCond: { fingerNo: finger } });
  const data = cap.CaptureFingerPrint?.fingerData;
  if (!data) throw new Error('El reloj no devolvio la huella (no se coloco el dedo o el equipo no soporta la captura remota). Enrola directamente en el equipo.');
  await c.json('POST', '/ISAPI/AccessControl/FingerPrintDownload?format=json', {
    FingerPrintCfg: { employeeNo, enableCardReader: [1], fingerPrintID: finger, fingerType: 'normalFP', fingerData: data },
  });
}

export async function captureFace(c, employeeNo) {
  const cap = await c.json('POST', '/ISAPI/AccessControl/CaptureFaceData', { CaptureFaceDataCond: { captureInfrared: false, dataType: 'binary' } });
  const data = cap.CaptureFaceData?.faceData;
  if (!data) throw new Error('El reloj no devolvio el rostro (nadie se coloco frente a la camara o el equipo no soporta la captura remota). Enrola directamente en el equipo.');
  await c.multipart('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', 'FaceDataRecord',
    { faceLibType: 'blackFD', FDID: '1', FPID: employeeNo }, { name: `${employeeNo}.jpg`, mime: 'image/jpeg', data: Buffer.from(data, 'base64') });
}

/** Apunta el push (HTTP listening) del reloj al agente. Mejor esfuerzo. */
export async function configurePush(c, agentIp, port) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><HttpHostNotification><id>1</id><url>/evento</url><protocolType>HTTP</protocolType><parameterFormatType>JSON</parameterFormatType><addressingFormatType>ipaddress</addressingFormatType><ipAddress>${agentIp}</ipAddress><portNo>${port}</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod></HttpHostNotification>`;
  const r = await c.request('PUT', '/ISAPI/Event/notification/httpHosts/1', xml, { 'Content-Type': 'application/xml' });
  return r.ok;
}
