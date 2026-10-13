import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger, localTimestamp, rotateIfNeeded } from '../src/logger.js';

test('la hora es local con desfase respecto a UTC', () => {
  const date = new Date(2026, 9, 13, 12, 29, 33); // hora local
  const text = localTimestamp(date);
  assert.match(text, /^2026-10-13T12:29:33[+-]\d{2}:\d{2}$/);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  assert.ok(text.endsWith(`${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`));
});

test('escribe en pantalla y en el archivo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agente-log-'));
  try {
    const path = join(dir, 'sub', 'agente.log');
    const shown = [];
    const log = createLogger({ logPath: path, out: (l) => shown.push(l), now: () => new Date(2026, 9, 13, 8, 0, 0) });
    log('hola');
    log('adios');
    assert.equal(shown.length, 2);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^2026-10-13T08:00:00[+-]\d{2}:\d{2} hola$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rota por tamano y conserva solo maxFiles archivos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agente-log-'));
  try {
    const path = join(dir, 'agente.log');
    const log = createLogger({ logPath: path, maxBytes: 60, maxFiles: 2, out: () => {} });
    for (let i = 0; i < 12; i += 1) log(`linea numero ${i} con relleno`);
    assert.ok(existsSync(`${path}.1`));
    assert.ok(existsSync(`${path}.2`));
    assert.ok(!existsSync(`${path}.3`));
    assert.equal(rotateIfNeeded(join(dir, 'no-existe.log'), 10, 2), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un fallo al escribir el archivo no detiene al agente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agente-log-'));
  try {
    const blocker = join(dir, 'archivo');
    writeFileSync(blocker, 'x');
    const shown = [];
    const log = createLogger({ logPath: join(blocker, 'no-se-puede', 'agente.log'), out: (l) => shown.push(l) });
    assert.doesNotThrow(() => log('sigue funcionando'));
    assert.equal(shown.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
