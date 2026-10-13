import test from 'node:test';
import assert from 'node:assert/strict';
import { methodOfEvent, normalizeDeviceTime, takeWithinSize, toQueueEvent, toWireEvent } from '../src/events.js';

test('metodo de verificacion', () => {
  // currentVerifyMode es el modo configurado: con varios metodos permitidos no dice cual se uso.
  assert.equal(methodOfEvent({ currentVerifyMode: 'faceOrFpOrCardOrPw' }), 'other');
  assert.equal(methodOfEvent({ currentVerifyMode: 'cardOrFaceOrFp', minor: 38 }), 'fingerprint');
  assert.equal(methodOfEvent({ currentVerifyMode: 'cardOrFaceOrFp', minor: 75 }), 'face');
  assert.equal(methodOfEvent({ currentVerifyMode: 'fp' }), 'fingerprint');
  assert.equal(methodOfEvent({ currentVerifyMode: 'face' }), 'face');
  assert.equal(methodOfEvent({ currentVerifyMode: 'pw' }), 'pin');
  assert.equal(methodOfEvent({ subEventType: 38, currentVerifyMode: 'faceOrFpOrCardOrPw' }), 'fingerprint'); // push
  assert.equal(methodOfEvent({ subEventType: 75 }), 'face');
  assert.equal(methodOfEvent({ minor: 75 }), 'face');
  assert.equal(methodOfEvent({ minor: 38 }), 'fingerprint');
  assert.equal(methodOfEvent({}), 'other');
});

test('normaliza la hora del reloj', () => {
  assert.equal(normalizeDeviceTime('2026-10-12T08:00:00-06:00'), '2026-10-12T08:00:00-06:00');
  assert.match(normalizeDeviceTime('2026-10-12T08:00:00'), /^2026-10-12T08:00:00[+-]\d{2}:\d{2}$/);
  assert.equal(normalizeDeviceTime('basura'), null);
  assert.equal(normalizeDeviceTime(''), null);
});

test('evento ISAPI a evento de cola', () => {
  const e = toQueueEvent('SER1', { serialNo: 55, time: '2026-10-12T08:00:00-06:00', employeeNoString: 'T001', attendanceStatus: 'checkIn', minor: 75 });
  assert.deepEqual(e, {
    terminalSerial: 'SER1', serial: '55', employeeNo: 'T001', deviceTime: '2026-10-12T08:00:00-06:00',
    attendanceStatus: 'checkIn', method: 'face', photoBase64: null,
  });
  assert.equal(toQueueEvent('SER1', { serialNo: 56, time: '2026-10-12T08:00:00-06:00' }), null, 'sin numero de empleado');
  assert.equal(toQueueEvent('SER1', { employeeNoString: 'T001', time: '2026-10-12T08:00:00-06:00' }), null, 'sin serial');
});

test('forma de red omite campos vacios', () => {
  const wire = toWireEvent({ serial: '1', employeeNo: 'T1', deviceTime: 'x', method: 'face', attendanceStatus: null, photoBase64: null, id: 9 });
  assert.deepEqual(wire, { serial: '1', employeeNo: 'T1', deviceTime: 'x', method: 'face' });
});

test('corta lotes por tamano y cantidad', () => {
  const photo = 'a'.repeat(1_000_000);
  const events = Array.from({ length: 10 }, (_, i) => ({ serial: String(i), photoBase64: photo }));
  assert.equal(takeWithinSize(events, 3_500_000).length, 3);
  assert.equal(takeWithinSize([{ serial: '1', photoBase64: photo.repeat(5) }], 100).length, 1, 'siempre al menos uno');
  const small = Array.from({ length: 250 }, (_, i) => ({ serial: String(i) }));
  assert.equal(takeWithinSize(small).length, 100);
});
