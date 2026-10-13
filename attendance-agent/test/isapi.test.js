import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { digestAuthorization, extractJpeg, summarizeError, xmlTag } from '../src/isapi.js';
import { normalizeConfig } from '../src/config.js';
import { parseMultipart, parsePush, pushToQueueEvent } from '../src/listener.js';

const md5 = (s) => createHash('md5').update(s).digest('hex');

test('digest con qop=auth calcula la respuesta RFC 2617', () => {
  const header = digestAuthorization('Digest realm="R", qop="auth", nonce="abc", opaque="o"', 'GET', '/x', 'admin', 'pw', 'cn');
  const expected = md5(`${md5('admin:R:pw')}:abc:00000001:cn:auth:${md5('GET:/x')}`);
  assert.ok(header.startsWith('Digest '));
  assert.ok(header.includes(`response="${expected}"`));
  assert.ok(header.includes('qop=auth') && header.includes('opaque="o"'));
});

test('digest sin qop', () => {
  const header = digestAuthorization('Digest realm="R", nonce="abc"', 'POST', '/y', 'u', 'p');
  assert.ok(header.includes(`response="${md5(`${md5('u:R:p')}:abc:${md5('POST:/y')}`)}"`));
});

test('configuracion: valida y completa defaults', () => {
  const key = 'a'.repeat(64);
  const cfg = normalizeConfig({ docsafeUrl: 'https://x.mx/', agentKey: key, terminals: [{ name: 'A', ip: '1.1.1.1', username: 'u', password: 'p' }] });
  assert.equal(cfg.docsafeUrl, 'https://x.mx');
  assert.equal(cfg.terminals[0].port, 80);
  assert.equal(cfg.intervals.orders, 15);
  assert.equal(cfg.listenPort, 8085);
  assert.throws(() => normalizeConfig({ docsafeUrl: 'x', agentKey: 'corta', terminals: [] }));
  assert.throws(() => normalizeConfig({ agentKey: key, terminals: [] }), /docsafeUrl/);
});

test('push multipart con evento y foto', () => {
  const event = { eventType: 'AccessControllerEvent', dateTime: '2026-10-12T08:00:00-06:00', AccessControllerEvent: { serialNo: 7, employeeNoString: 'T9', attendanceStatus: 'checkOut', currentVerifyMode: 'fp' } };
  const b = 'BOUND';
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="event_log"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(event)}\r\n`),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="Picture"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  assert.equal(parseMultipart(body, b).length, 2);
  const { event: parsed, photoBase64 } = parsePush(`multipart/form-data; boundary=${b}`, body);
  const queued = pushToQueueEvent('S1', parsed, photoBase64);
  assert.equal(queued.employeeNo, 'T9');
  assert.equal(queued.method, 'fingerprint');
  assert.equal(queued.photoBase64, Buffer.from([0xff, 0xd8, 0xff]).toString('base64'));
});

test('push JSON de otro tipo de evento se ignora', () => {
  const { event } = parsePush('application/json', Buffer.from(JSON.stringify({ eventType: 'heartBeat' })));
  assert.equal(pushToQueueEvent('S1', event, null), null);
});

test('summarizeError resume respuestas de error XML y JSON', () => {
  const xml = '<?xml version="1.0"?><ResponseStatus><statusCode>6</statusCode><statusString>Invalid Content</statusString><subStatusCode>badXmlContent</subStatusCode></ResponseStatus>';
  assert.equal(summarizeError(xml), 'Invalid Content / badXmlContent');
  const json = '{"statusCode": 6, "statusString": "Invalid Content", "subStatusCode": "badJsonContent", "errorMsg": "employeeNo"}';
  assert.equal(summarizeError(json), 'Invalid Content / badJsonContent / employeeNo');
  assert.equal(summarizeError('texto   libre\ncon saltos'), 'texto libre con saltos');
});

test('xmlTag y extractJpeg', () => {
  assert.equal(xmlTag('<a><fingerData>QUJD</fingerData></a>', 'fingerData'), 'QUJD');
  assert.equal(xmlTag('<a></a>', 'fingerData'), null);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const body = Buffer.concat([Buffer.from('--b\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg, Buffer.from('\r\n--b--')]);
  assert.deepEqual(extractJpeg(body), jpeg);
  assert.equal(extractJpeg(Buffer.from('sin imagen')), null);
});
