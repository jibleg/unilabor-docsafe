/**
 * Reloj HikVision simulado (ISAPI minimo) para probar el agente sin equipo:
 *   node simulator/terminal-simulada.js [puerto=8800] [--serie=SIM320MFWX0001]
 * Credenciales: admin / Sim12345 (Digest). Implementa deviceInfo, time, httpHosts,
 * UserInfo (Count/Search/Record/Modify/Delete), FaceDataRecord, CaptureFingerPrint,
 * FingerPrintDownload, CaptureFaceData y AcsEvent (paginado), mas control fuera de ISAPI:
 *   POST /sim/checar  {"employeeNo":"T001","attendanceStatus":"checkIn","push":true,"create":false,"offsetMinutes":0}
 *   GET  /sim/estado
 * Con `push`, el evento se envia al host HTTP configurado (el agente), como hace el reloj.
 */
import { createServer, request as httpRequest } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a)) ?? 8800);
const SERIAL = args.find((a) => a.startsWith('--serie='))?.slice(8) ?? 'SIM320MFWX0001';
const USER = 'admin';
const PASSWORD = 'Sim12345';
const REALM = 'DS-K1T320MFWX-B';

const people = new Map();
const events = [];
let serialNo = 1000;
let pushHost = null;
const md5 = (s) => createHash('md5').update(s).digest('hex');
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const zone = () => {
  const o = -new Date().getTimezoneOffset();
  const a = Math.abs(o);
  return `${o >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};

function authorized(req) {
  const h = String(req.headers.authorization ?? '');
  if (!h.startsWith('Digest ')) return false;
  const c = {};
  for (const m of h.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) c[m[1]] = m[2] ?? m[3];
  const ha1 = md5(`${USER}:${REALM}:${PASSWORD}`);
  const ha2 = md5(`${req.method}:${c.uri}`);
  const expected = c.qop ? md5(`${ha1}:${c.nonce}:${c.nc}:${c.cnonce}:${c.qop}:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`);
  return c.username === USER && c.response === expected;
}

const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

function pushEvent(e) {
  if (!pushHost) return;
  const body = JSON.stringify({
    ipAddress: '127.0.0.1', dateTime: e.time, eventType: 'AccessControllerEvent', eventDescription: 'Access Controller Event',
    AccessControllerEvent: {
      deviceName: 'Simulada', majorEventType: e.major, subEventType: e.minor, serialNo: e.serialNo, employeeNoString: e.employeeNoString,
      name: e.name, attendanceStatus: e.attendanceStatus, currentVerifyMode: e.currentVerifyMode, major: e.major, minor: e.minor,
    },
  });
  const boundary = `----sim${randomBytes(6).toString('hex')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="event_log"\r\nContent-Type: application/json\r\n\r\n${body}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="Picture"; filename="pic.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    TINY_JPEG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = httpRequest({ host: pushHost.ip, port: pushHost.port, path: pushHost.url, method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length } });
  r.on('error', (err) => console.log('push fallo:', err.message));
  r.end(payload);
}

function recordEvent(employeeNo, attendanceStatus, mode, offsetMinutes) {
  const p = people.get(employeeNo);
  if (!p) return null;
  const at = new Date(Date.now() + offsetMinutes * 60_000);
  const e = {
    serialNo: ++serialNo, time: isoLocal(at) + zone(), employeeNoString: employeeNo, name: p.name,
    attendanceStatus, currentVerifyMode: mode, major: 5, minor: 75,
  };
  events.push(e);
  return e;
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (t) => chunks.push(t));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const raw = Buffer.concat(chunks);
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const xml = (s) => { res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end(s); };

    if (path.startsWith('/sim/')) {
      if (path === '/sim/estado') return json(200, { serial: SERIAL, people: [...people.values()], events: events.length, pushHost });
      if (path === '/sim/checar') {
        const b = JSON.parse(raw.toString() || '{}');
        if (b.create && !people.has(b.employeeNo)) people.set(b.employeeNo, { employeeNo: b.employeeNo, name: b.name ?? `Persona ${b.employeeNo}`, hasFace: false, hasFingerprint: false });
        const e = recordEvent(b.employeeNo, b.attendanceStatus ?? 'checkIn', b.mode ?? 'faceOrFpOrCardOrPw', Number(b.offsetMinutes ?? 0));
        if (!e) return json(404, { error: 'persona no registrada en el reloj' });
        if (b.push !== false) pushEvent(e);
        return json(200, { ok: true, serialNo: e.serialNo });
      }
      return json(404, {});
    }
    if (!authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", nonce="${randomBytes(8).toString('hex')}", opaque="sim"` });
      return res.end();
    }
    const text = raw.toString();
    const body = () => (text ? JSON.parse(text) : {});

    if (path === '/ISAPI/System/deviceInfo') return xml(`<DeviceInfo><deviceName>Simulada</deviceName><model>DS-K1T320MFWX-B</model><serialNumber>${SERIAL}</serialNumber><firmwareVersion>V3.5.2</firmwareVersion></DeviceInfo>`);
    if (path === '/ISAPI/System/time') return xml(`<Time><localTime>${isoLocal(new Date())}${zone()}</localTime></Time>`);
    if (path === '/ISAPI/Event/notification/httpHosts/1' && req.method === 'PUT') {
      pushHost = { ip: /<ipAddress>([^<]+)/.exec(text)?.[1] ?? '127.0.0.1', port: Number(/<portNo>(\d+)/.exec(text)?.[1] ?? 80), url: /<url>([^<]+)/.exec(text)?.[1] ?? '/' };
      return xml('<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>');
    }
    if (path === '/ISAPI/AccessControl/UserInfo/Count') return json(200, { UserInfoCount: { userNumber: people.size } });
    if (path === '/ISAPI/AccessControl/UserInfo/Search') {
      const cond = body().UserInfoSearchCond ?? {};
      const wanted = cond.EmployeeNoList?.map((x) => x.employeeNo);
      const list = (wanted ? wanted.map((n) => people.get(n)).filter(Boolean) : [...people.values()]).map((p) => ({ employeeNo: p.employeeNo, name: p.name }));
      return json(200, { UserInfoSearch: { responseStatusStrg: list.length ? 'OK' : 'NO MATCH', numOfMatches: list.length, totalMatches: list.length, UserInfo: list } });
    }
    if (path === '/ISAPI/AccessControl/UserInfo/Record' || path === '/ISAPI/AccessControl/UserInfo/Modify') {
      const u = body().UserInfo;
      const prev = people.get(u.employeeNo);
      people.set(u.employeeNo, { employeeNo: u.employeeNo, name: u.name, hasFace: prev?.hasFace ?? false, hasFingerprint: prev?.hasFingerprint ?? false });
      return json(200, { statusCode: 1, statusString: 'OK' });
    }
    if (path === '/ISAPI/AccessControl/UserInfo/Delete') {
      for (const x of body().UserInfoDelCond?.EmployeeNoList ?? []) people.delete(x.employeeNo);
      return json(200, { statusCode: 1, statusString: 'OK' });
    }
    if (path === '/ISAPI/Intelligent/FDLib/FaceDataRecord') {
      const fpid = /"FPID"\s*:\s*"([^"]+)"/.exec(text)?.[1];
      const p = fpid ? people.get(fpid) : null;
      if (!p) return json(400, { statusCode: 4, statusString: 'la persona no existe' });
      p.hasFace = true;
      return json(200, { statusCode: 1, statusString: 'OK' });
    }
    if (path === '/ISAPI/AccessControl/CaptureFingerPrint') return json(200, { CaptureFingerPrint: { fingerData: Buffer.from('huella-simulada').toString('base64') } });
    if (path === '/ISAPI/AccessControl/FingerPrintDownload') {
      const p = people.get(body().FingerPrintCfg?.employeeNo);
      if (!p) return json(400, { statusCode: 4, statusString: 'la persona no existe' });
      p.hasFingerprint = true;
      return json(200, { statusCode: 1, statusString: 'OK' });
    }
    if (path === '/ISAPI/AccessControl/CaptureFaceData') return json(200, { CaptureFaceData: { faceData: TINY_JPEG.toString('base64') } });
    if (path === '/ISAPI/AccessControl/AcsEvent') {
      const c = body().AcsEventCond ?? {};
      const from = String(c.startTime ?? '0000').slice(0, 19);
      const to = String(c.endTime ?? '9999').slice(0, 19);
      const all = events.filter((e) => e.time.slice(0, 19) >= from && e.time.slice(0, 19) <= to);
      const pos = Number(c.searchResultPosition ?? 0);
      const page = all.slice(pos, pos + Number(c.maxResults ?? 30));
      return json(200, { AcsEvent: { searchID: c.searchID, responseStatusStrg: pos + page.length < all.length ? 'MORE' : (page.length ? 'OK' : 'NO MATCH'), numOfMatches: page.length, totalMatches: all.length, InfoList: page } });
    }
    json(404, { statusCode: 4, statusString: `sin implementar: ${path}` });
  });
}).listen(PORT, () => console.log(`reloj simulado ${SERIAL} en http://127.0.0.1:${PORT} (usuario ${USER} / ${PASSWORD})`));
