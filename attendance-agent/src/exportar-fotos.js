/**
 * Descarga las fotos de rostro registradas en un reloj HikVision a una carpeta,
 * un JPEG por persona con el nombre del colaborador, mas un indice.csv.
 *
 *   node src/exportar-fotos.js --dir ~/Desktop/fotos [--terminal "Recepcion"]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig } from './config.js';
import { IsapiClient, listPeople, downloadFace } from './isapi.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Nombre de archivo seguro: sin caracteres prohibidos en Windows/macOS. */
export function safeFileName(name, fallback) {
  const clean = String(name).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return clean || fallback;
}

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  const dir = resolve(arg('dir') ?? './fotos-reloj');
  const cfg = readConfig();
  const wanted = arg('terminal');
  const terminal = wanted ? cfg.terminals.find((t) => t.name === wanted) : cfg.terminals[0];
  if (!terminal) throw new Error(`No existe la terminal "${wanted}". Disponibles: ${cfg.terminals.map((t) => t.name).join(', ')}`);

  mkdirSync(dir, { recursive: true });
  const client = new IsapiClient(terminal);
  const people = await listPeople(client);
  console.log(`${terminal.name}: ${people.length} personas registradas. Descargando a ${dir}`);

  const used = new Set();
  const rows = ['employeeNo,nombre,archivo,resultado'];
  let ok = 0;
  for (const p of people) {
    let result = 'sin rostro';
    let file = '';
    if (p.faceURL) {
      try {
        const jpeg = await downloadFace(client, p.faceURL);
        if (!jpeg) throw new Error('el reloj no devolvio un JPEG');
        let base = safeFileName(p.name, `empleado-${p.employeeNo}`);
        if (used.has(base.toLowerCase())) base = `${base} (${p.employeeNo})`;
        used.add(base.toLowerCase());
        file = `${base}.jpg`;
        writeFileSync(resolve(dir, file), jpeg);
        result = 'ok';
        ok++;
      } catch (e) {
        result = `error: ${e.message}`;
      }
    }
    console.log(`  ${p.employeeNo} ${p.name}: ${result}`);
    rows.push([p.employeeNo, p.name, file, result].map(csv).join(','));
  }
  writeFileSync(resolve(dir, 'indice.csv'), `﻿${rows.join('\n')}\n`);
  console.log(`Listo: ${ok} fotos de ${people.length} personas. Indice en ${resolve(dir, 'indice.csv')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
