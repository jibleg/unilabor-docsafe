import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue } from '../src/queue.js';

const ev = (serial, extra = {}) => ({ terminalSerial: 'T1', serial, employeeNo: 'E1', deviceTime: '2026-10-12T08:00:00-06:00', method: 'face', ...extra });

test('deduplica por terminal y serial', () => {
  const q = new Queue(':memory:');
  assert.equal(q.add(ev('1')), true);
  assert.equal(q.add(ev('1')), false);
  assert.equal(q.add({ ...ev('1'), terminalSerial: 'T2' }), true);
  assert.equal(q.totalPending(), 2);
});

test('pendientes, marcado como enviado y foto liberada', () => {
  const q = new Queue(':memory:');
  q.add(ev('1', { photoBase64: 'AAAA' }));
  q.add(ev('2'));
  const pending = q.pending('T1');
  assert.deepEqual(pending.map((e) => e.serial), ['1', '2']);
  assert.equal(pending[0].photoBase64, 'AAAA');
  q.markSent([pending[0].id], 1);
  q.markSent([pending[1].id], 2);
  assert.equal(q.totalPending(), 0);
  assert.deepEqual(q.pendingSerials(), []);
  assert.equal(q.add(ev('1')), false, 'lo entregado sigue evitando repetidos');
});

test('purga solo lo entregado y viejo', () => {
  const q = new Queue(':memory:');
  q.add(ev('1'));
  q.add(ev('2'));
  const [first] = q.pending('T1');
  q.markSent([first.id]);
  q.db.exec("UPDATE events SET created_at = datetime('now', '-40 days')");
  assert.equal(q.purge(30), 1);
  assert.equal(q.totalPending(), 1);
});
