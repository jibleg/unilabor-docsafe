/**
 * Agente de asistencias DocSafe: pasarela entre el reloj HikVision y DocSafe.
 * Ciclos: latido, push (escucha en la LAN), ordenes (alta de personas, huella,
 * rostro, estado, consulta) y recuperacion de eventos. Cola local en SQLite
 * para operar sin internet.
 */
import { hostname, networkInterfaces, platform, release } from 'node:os';
import { readConfig } from './config.js';
import { DocsafeClient } from './docsafe.js';
import { takeWithinSize, toQueueEvent } from './events.js';
import {
  IsapiClient, captureFace, captureFingerprint, configurePush, removePerson, searchEvents, syncPerson, terminalInfo,
} from './isapi.js';
import { startListener } from './listener.js';
import { Queue } from './queue.js';

const VERSION = '1.0.0';
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

const cfg = readConfig();
const queue = new Queue(cfg.queuePath);
const docsafe = new DocsafeClient(cfg, VERSION);
const terminals = cfg.terminals.map((t) => ({ cfg: t, client: new IsapiClient(t), info: null, online: false, driftSeconds: null, pushConfigured: false }));

function localIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return '127.0.0.1';
}

async function refreshTerminal(t) {
  try {
    t.info = await terminalInfo(t.client);
    t.online = true;
    t.driftSeconds = t.info.deviceTime ? Math.round((new Date(t.info.deviceTime).getTime() - Date.now()) / 1000) : null;
    if (!t.pushConfigured) {
      t.pushConfigured = await configurePush(t.client, cfg.pushHost ?? localIp(), cfg.listenPort).catch(() => false);
      log(`${t.cfg.name}: push ${t.pushConfigured ? 'configurado hacia el agente' : 'no configurable (solo recuperacion periodica)'}`);
    }
  } catch (err) {
    t.online = false;
    t.pushConfigured = false;
    log(`${t.cfg.name} (${t.cfg.ip}) fuera de linea: ${err.message}`);
  }
}

const serialOfIp = (ip) =>
  terminals.find((t) => t.cfg.ip === ip)?.info?.serial
  ?? (terminals.length === 1 ? terminals[0].info?.serial ?? null : null);

async function heartbeatCycle() {
  await Promise.all(terminals.map(refreshTerminal));
  const list = terminals.filter((t) => t.info?.serial).map((t) => ({
    serial: t.info.serial, model: t.info.model, firmware: t.info.firmware, ip: t.cfg.ip,
    online: t.online, clockDriftSeconds: t.driftSeconds, people: t.info.people,
  }));
  try {
    const r = await docsafe.heartbeat({ pc: hostname(), os: `${platform()} ${release()}`, ip: localIp(), terminals: list });
    for (const e of r.terminalErrors ?? []) log(`DocSafe rechazo la terminal ${e.serial}: ${e.message}`);
    if (r.pendingOrders > 0) void ordersCycle();
  } catch (err) {
    log(`DocSafe sin respuesta al latido: ${err.message}`);
  }
}

let delivering = false;
async function deliverQueue() {
  if (delivering) return;
  delivering = true;
  try {
    for (const serial of queue.pendingSerials()) {
      let batch;
      // Vacia la terminal por lotes hasta que no queden pendientes o falle.
      while ((batch = takeWithinSize(queue.pending(serial, 100))).length > 0) {
        try {
          const r = await docsafe.punches(serial, batch);
          const invalid = new Set((r.invalidSerials ?? []).map(String));
          queue.markSent(batch.filter((e) => !invalid.has(e.serial)).map((e) => e.id), 1);
          queue.markSent(batch.filter((e) => invalid.has(e.serial)).map((e) => e.id), 2);
          log(`entregadas ${batch.length} checadas de ${serial} (nuevas ${r.inserted}, repetidas ${r.duplicated}${invalid.size ? `, invalidas ${invalid.size}` : ''})`);
        } catch (err) {
          log(`sin internet o DocSafe rechazo el lote (${batch.length} en espera): ${err.message}`);
          if (err.status === 404) log('DocSafe aun no conoce la terminal: se reintenta tras el siguiente latido');
          break;
        }
      }
    }
  } finally {
    delivering = false;
  }
}

function enqueueEvents(serial, events) {
  let added = 0;
  for (const e of events) {
    const queued = toQueueEvent(serial, e);
    if (queued && queue.add(queued)) added += 1;
  }
  return added;
}

async function recoveryCycle() {
  for (const t of terminals) {
    if (!t.online || !t.info?.serial) continue;
    try {
      const to = new Date();
      const from = new Date(Date.now() - cfg.recoveryHours * 3_600_000);
      const added = enqueueEvents(t.info.serial, await searchEvents(t.client, from, to));
      if (added) log(`recuperacion ${t.cfg.name}: ${added} evento(s) que no se tenian`);
    } catch (err) {
      log(`recuperacion ${t.cfg.name} fallo: ${err.message}`);
    }
  }
  await deliverQueue();
}

async function executeOrder(o) {
  const targets = o.terminalSerial ? terminals.filter((t) => t.info?.serial === o.terminalSerial) : terminals;
  if (targets.length === 0) return { ok: false, error: 'La terminal de la orden no esta configurada en este agente' };
  const p = o.payload ?? {};
  try {
    switch (o.type) {
      case 'check_status':
        await Promise.all(targets.map(refreshTerminal));
        return {
          ok: true,
          result: Object.fromEntries(targets.map((t) => [t.cfg.name, {
            online: t.online, serial: t.info?.serial, model: t.info?.model, firmware: t.info?.firmware,
            driftSeconds: t.driftSeconds, people: t.info?.people ?? null, pendingInQueue: queue.totalPending(),
          }])),
        };
      case 'sync_person':
        for (const t of targets) await syncPerson(t.client, String(p.employeeNo), String(p.name ?? ''));
        return { ok: true, result: { terminals: targets.length } };
      case 'remove_person':
        for (const t of targets) await removePerson(t.client, String(p.employeeNo));
        return { ok: true, result: { terminals: targets.length } };
      case 'enroll_fingerprint':
        await captureFingerprint(targets[0].client, String(p.employeeNo), Number(p.finger ?? 1));
        return { ok: true, result: { terminal: targets[0].cfg.name } };
      case 'enroll_face':
        await captureFace(targets[0].client, String(p.employeeNo));
        return { ok: true, result: { terminal: targets[0].cfg.name } };
      case 'fetch_events': {
        const from = new Date(String(p.from ?? Date.now() - cfg.recoveryHours * 3_600_000));
        const to = new Date(String(p.to ?? new Date().toISOString()));
        let total = 0;
        for (const t of targets) {
          if (t.info?.serial) total += enqueueEvents(t.info.serial, await searchEvents(t.client, from, to));
        }
        await deliverQueue();
        return { ok: true, result: { recovered: total } };
      }
      default:
        return { ok: false, error: `Orden desconocida: ${o.type}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

let runningOrders = false;
async function ordersCycle() {
  if (runningOrders) return;
  runningOrders = true;
  try {
    const { orders } = await docsafe.orders();
    for (const o of orders) {
      const r = await executeOrder(o);
      log(`orden ${o.type} ${o.payload?.employeeNo ? `#${o.payload.employeeNo}` : ''} -> ${r.ok ? 'ok' : `error: ${r.error}`}`);
      await docsafe.orderResult(o.id, r).catch((err) => log(`no se pudo reportar la orden ${o.id}: ${err.message}`));
    }
  } catch (err) {
    log(`ordenes: ${err.message}`);
  } finally {
    runningOrders = false;
  }
}

async function main() {
  log(`agente DocSafe v${VERSION} - ${hostname()} - ${cfg.docsafeUrl} - ${terminals.length} terminal(es)`);
  startListener(cfg.listenPort, queue, serialOfIp, log);
  await heartbeatCycle();
  await recoveryCycle();
  setInterval(() => void heartbeatCycle(), cfg.intervals.heartbeat * 1000);
  setInterval(() => void ordersCycle(), cfg.intervals.orders * 1000);
  setInterval(() => void recoveryCycle(), cfg.intervals.recovery * 1000);
  setInterval(() => void deliverQueue(), 5_000);
  setInterval(() => queue.purge(30), 6 * 3_600_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
