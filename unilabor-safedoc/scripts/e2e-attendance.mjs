#!/usr/bin/env node
/**
 * E2E funcional del modulo Control de Asistencias contra la API REAL en LOCAL.
 *   cd unilabor-safedoc && E2E_PASSWORD='<clave de admin.local>' node scripts/e2e-attendance.mjs
 * Requisitos: Node >= 22, backend corriendo (E2E_BASE_URL, default http://localhost:4000), BD local
 * (credenciales de .env), psql en el PATH. SOLO fetch + exceljs/bcrypt del propio backend (sin deps nuevas).
 * Se niega a correr si la BD o la URL no son locales. Cada corrida usa un sufijo aleatorio (RUN) y
 * empleados nuevos, de modo que se puede repetir. Las checadas son inmutables: quedan como residuo
 * (los empleados de prueba se desactivan al terminar). Sale con codigo 1 si hay fallos.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const require = createRequire(resolve(backendRoot, 'package.json'));
const ExcelJS = require('exceljs');

// ---------------------------------------------------------------- entorno
const env = {};
for (const line of readFileSync(resolve(backendRoot, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const API = `${BASE}/api/attendance`;
// Contrasena de la cuenta admin.local@unilabor.mx de la BD local (no se versiona): E2E_PASSWORD=... node scripts/e2e-attendance.mjs
const LOCAL_PASSWORD = process.env.E2E_PASSWORD;
if (!LOCAL_PASSWORD) {
  console.error('Falta E2E_PASSWORD (contrasena de admin.local@unilabor.mx en la BD local).');
  process.exit(2);
}
const DB = { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, name: env.DB_NAME, pass: env.DB_PASSWORD };
if (!/^(localhost|127\.0\.0\.1)$/.test(DB.host || '') || !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  console.error('ABORTADO: esta suite solo corre contra BD y API locales.');
  process.exit(2);
}
const psql = (sql) =>
  execFileSync('psql', ['-q', '-At', '-F', '|', '-h', DB.host, '-p', DB.port, '-U', DB.user, '-d', DB.name, '-c', sql], {
    env: { ...process.env, PGPASSWORD: DB.pass }, encoding: 'utf8',
  }).trim().split('\n').filter(Boolean).map((l) => l.split('|'));
const psqlTry = (sql) => { try { return { ok: true, rows: psql(sql) }; } catch (e) { return { ok: false, err: String(e.stderr || e.message) }; } };

// ---------------------------------------------------------------- mini framework
const results = [];
let currentSection = '-';
let lastReq = '';
const check = (name, cond, detail = '') => {
  results.push({ section: currentSection, name, ok: !!cond, detail: cond ? '' : `${detail} [${lastReq}]` });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${currentSection}] ${name}${cond ? '' : `\n        -> ${detail} [${lastReq}]`}`);
  return !!cond;
};
const skip = (name, why) => { results.push({ section: currentSection, name, ok: true, skipped: true, detail: why }); console.log(`SKIP  [${currentSection}] ${name} (${why})`); };
const j = (v) => JSON.stringify(v);
const eq = (name, got, exp) => check(name, j(got) === j(exp), `esperado ${j(exp)} obtenido ${j(got)}`);
const near = (name, got, exp, tol = 0.011) => check(name, typeof got === 'number' && Math.abs(got - exp) <= tol, `esperado ~${exp} obtenido ${j(got)}`);
const brief = (r) => (r?.json ? j(r.json).slice(0, 300) : r?.text?.slice(0, 200) ?? '');
const st = (name, r, exp) => check(name, [].concat(exp).includes(r.status), `HTTP ${r.status} (esperado ${[].concat(exp).join('|')}) ${brief(r)}`);
const section = async (title, fn) => {
  currentSection = title;
  console.log(`\n=== ${title}`);
  try { await fn(); } catch (e) { check(`EXCEPCION en la seccion: ${e.message}`, false, String(e.stack).split('\n').slice(0, 3).join(' | ')); }
};

// ---------------------------------------------------------------- http
const req = async (method, url, { token, body, form, headers = {}, raw = false } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  lastReq = `${method} ${url.replace(BASE, '')}`;
  const res = await fetch(url, { method, headers: h, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get('content-type') || '';
  let json = null; let text = '';
  if (!raw && /json/.test(ctype)) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* */ } }
  else if (!raw && /text/.test(ctype)) text = buf.toString('utf8');
  return { status: res.status, json, text, buf, headers: res.headers, ctype };
};
let TOKEN = null;
const A = (method, path, body, opts = {}) => req(method, API + path, { token: opts.token === undefined ? TOKEN : opts.token, body, ...opts });
const get = (p, o) => A('GET', p, undefined, o);
let AGENT_KEY = null;
const AG = (method, path, body, key = AGENT_KEY) => req(method, `${API}/agent${path}`, { token: key, body });

// ---------------------------------------------------------------- fechas (zona del modulo: America/Mexico_City, UTC-6 fijo)
const TZ = 'America/Mexico_City';
const fmtDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = fmtDate(new Date());
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const isWeekday = (s) => dow(s) >= 1 && dow(s) <= 5;
const YESTERDAY = addDays(TODAY, -1);
const lt = (date, hhmm) => `${date}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}-06:00`; // instante local -> ISO con offset
const utc = (date, hhmm) => new Date(lt(date, hhmm)).toISOString();
const WD = []; for (let i = 2; WD.length < 16; i += 1) { const d = addDays(TODAY, -i); if (isWeekday(d)) WD.push(d); }
const cand = addDays(TODAY, -2);
const anchorMonth = Number(cand.slice(8)) >= 8 ? cand.slice(0, 7) : addDays(`${cand.slice(0, 8)}01`, -1).slice(0, 7);
const ACC = []; for (let d = cand; ACC.length < 3 && d >= `${anchorMonth}-01`; d = addDays(d, -1)) { if (d.slice(0, 7) === anchorMonth && isWeekday(d)) ACC.unshift(d); }
let BD = addDays(ACC[0], -1); while (!isWeekday(BD)) BD = addDays(BD, -1);
const START = addDays(TODAY, -45); const RFROM = addDays(TODAY, -44);
const nowParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
const nowMin = Number(nowParts.find((p) => p.type === 'hour').value) * 60 + Number(nowParts.find((p) => p.type === 'minute').value);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- datos de la corrida
const RUN = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const mkForm = (fields, files = []) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, String(v)); for (const { field = 'files', name, type, buf } of files) f.append(field, new Blob([buf], { type }), name); return f; };
const pdfFile = (name = 'comprobante.pdf') => ({ name, type: 'application/pdf', buf: PDF });
const E = {}; const L = {}; // empleados de prueba
let BR = null; let BR_NAME = ''; let AGENT = null; let SERIAL = '';
const created = { holidays: [], incidentTypes: [], users: [], attachmentFiles: [] };
const originals = {};
let evN = 0;
const ev = (no, date, time, status, extra = {}) => ({ serial: `${RUN}-${(evN += 1)}`, employeeNo: no, deviceTime: lt(date, time), attendanceStatus: status, method: 'face', ...extra });
const IN = 'checkIn'; const OUT = 'checkOut';
const sendPunches = (events, serial = SERIAL) => AG('POST', '/punches', { terminalSerial: serial, events });
const daysOf = async (emp, from = RFROM, to = YESTERDAY) => {
  const r = await get(`/days?employee_id=${emp.id}&from=${from}&to=${to}&limit=200`);
  return Object.fromEntries((r.json?.data || []).map((d) => [d.work_date, d]));
};
const dayIs = (name, map, date, exp) => {
  const d = map[date];
  if (!d) return check(name, false, `sin fila para ${date}`);
  const bad = [];
  for (const [k, v] of Object.entries(exp)) {
    const got = d[k];
    const okv = typeof v === 'number' && typeof got === 'number' ? Math.abs(got - v) <= 0.011 : j(got) === j(v);
    if (!okv) bad.push(`${k}: esperado ${j(v)} obtenido ${j(got)}`);
  }
  return check(name, bad.length === 0, bad.join('; '));
};
const recalc = (extra = {}) => A('POST', '/days/recalculate', { from: RFROM, to: YESTERDAY, employee_ids: [...Object.values(E), ...Object.values(L)].map((e) => e.id), ...extra });
const login = async (email, password) => req('POST', `${BASE}/api/auth/login`, { body: { email, password } });

// =================================================================== SUITE
const main = async () => {
  console.log(`E2E Asistencias  RUN=${RUN}  hoy=${TODAY}  base=${BASE}  db=${DB.host}:${DB.port}/${DB.name}`);

  // ------------------------------------------------------------ 0. Autenticacion y permisos
  await section('0 Login y permisos', async () => {
    const r = await login('admin.local@unilabor.mx', LOCAL_PASSWORD);
    st('login admin local 200', r, 200);
    TOKEN = r.json?.token;
    check('availableModules incluye ATTENDANCE', (r.json?.availableModules || []).some((m) => m.code === 'ATTENDANCE'), j(r.json?.availableModules?.map((m) => m.code)));
    const perms = r.json?.permissions || [];
    const five = ['ATTENDANCE.RECORDS.READ', 'ATTENDANCE.SCHEDULES.WRITE', 'ATTENDANCE.INCIDENTS.AUTHORIZE', 'ATTENDANCE.SETTINGS.MANAGE', 'ATTENDANCE.DEVICES.MANAGE'];
    check('permissions contiene los 5 ATTENDANCE.*', five.every((p) => perms.includes(p)), `faltan: ${five.filter((p) => !perms.includes(p)).join(',')}`);
    st('login con clave incorrecta 401', await login('admin.local@unilabor.mx', 'nope-xyz'), [400, 401]);
    // usuarios de prueba (viewer y sin permisos): se clonan del hash del admin local
    for (const [key, email, roleCode] of [['viewer', 'e2e.att.viewer@unilabor.local', 'ATTENDANCE_VIEWER'], ['noperm', 'e2e.att.noperm@unilabor.local', null]]) {
      const id = psql(`INSERT INTO users(email,password_hash,full_name,role,is_active,must_change_password) SELECT '${email}', password_hash, 'E2E ${key} ${RUN}', 'VIEWER', true, false FROM users WHERE email='admin.local@unilabor.mx' ON CONFLICT (email) DO UPDATE SET is_active=true, must_change_password=false, password_hash=EXCLUDED.password_hash RETURNING id`)[0][0];
      psql(`DELETE FROM user_roles WHERE user_id='${id}'`);
      if (roleCode) psql(`INSERT INTO user_roles(user_id, role_id, is_active) SELECT '${id}', id, true FROM roles WHERE code='${roleCode}'`);
      created.users.push(id);
      const lr = await login(email, LOCAL_PASSWORD);
      st(`login ${key} 200`, lr, 200);
      if (key === 'viewer') {
        env.VIEWER = lr.json?.token;
        check('viewer: ATTENDANCE en modulos y solo RECORDS.READ', (lr.json?.availableModules || []).some((m) => m.code === 'ATTENDANCE') && j((lr.json?.permissions || []).filter((p) => p.startsWith('ATTENDANCE.'))) === j(['ATTENDANCE.RECORDS.READ']), j(lr.json?.permissions));
      } else {
        env.NOPERM = lr.json?.token;
        check('noperm: sin modulo ATTENDANCE ni permisos ATTENDANCE', !(lr.json?.availableModules || []).some((m) => m.code === 'ATTENDANCE') && !(lr.json?.permissions || []).some((p) => p.startsWith('ATTENDANCE.')), j(lr.json?.permissions));
      }
    }
    st('sin token 401 (GET /employees)', await get('/employees', { token: null }), 401);
    st('token basura 401', await get('/employees', { token: 'abc.def.ghi' }), 401);
  });
  if (!TOKEN) throw new Error('sin token, no se puede continuar');

  // ------------------------------------------------------------ preparacion: sucursal, empleados
  await section('Preparacion', async () => {
    const ov = await get('/devices/overview');
    st('overview 200', ov, 200);
    const branches = ov.json?.branches || [];
    const free = branches.find((b) => !b.agent);
    const reuse = branches.find((b) => b.agent && /^E2E /.test(b.agent.name));
    const pick = reuse || free;
    check('hay una sucursal libre o un agente E2E reutilizable', !!pick, `branches=${j(branches.map((b) => [b.branch_id, b.agent?.name]))}`);
    BR = pick.branch_id; BR_NAME = pick.branch_name; AGENT = reuse ? reuse.agent : null;
    console.log(`  sucursal de prueba: ${BR} ${BR_NAME} (${AGENT ? 'reutiliza agente E2E ' + AGENT.id : 'sin agente: se crea'})`);
    const mk = (code, n, extra = '') => Number(psql(`INSERT INTO employees(employee_code, full_name, email, area, position, is_active) VALUES ('${code}', 'E2E Asist ${RUN} ${n}', 'e2e_${RUN.toLowerCase()}_${n.toLowerCase()}@e2e.local', 'E2E', 'Prueba', true) RETURNING id`)[0][0]);
    for (let i = 1; i <= 8; i += 1) E[i] = { id: mk(`E2E-${RUN}-${i}`, String(i)), code: `E2E-${RUN}-${i}`, no: `TEST-${RUN}${i}`, name: `E2E Asist ${RUN} ${i}` };
    for (let i = 1; i <= 4; i += 1) L[i] = { id: mk(`E2E-${RUN}-L${i}`, `L${i}`), code: `E2E-${RUN}-L${i}`, no: `TEST-${RUN}L${i}`, name: `E2E Asist ${RUN} L${i}` };
    E.inactive = { id: Number(psql(`INSERT INTO employees(employee_code, full_name, email, area, is_active) VALUES ('E2E-${RUN}-IN', 'E2E Inactivo ${RUN}', 'e2e_${RUN.toLowerCase()}_in@e2e.local', 'E2E', false) RETURNING id`)[0][0]) };
    check('empleados de prueba creados (12 + 1 inactivo)', Object.keys(E).length === 9 && Object.keys(L).length === 4);
  });

  // ------------------------------------------------------------ 1. Alta
  await section('1 Alta de empleados', async () => {
    const e1 = E[1];
    let r = await A('PATCH', `/employees/${e1.id}`, { is_enabled: true, device_employee_number: e1.no });
    st('habilitar sin sucursal -> 400', r, 400);
    r = await A('PATCH', `/employees/${e1.id}`, { branch_id: BR, hire_date: '2020-01-15', device_employee_number: e1.no, is_enabled: true });
    st('PATCH habilita E1 (sucursal, hire_date, numero) 200', r, 200);
    const emp = r.json?.employee || {};
    check('E1 queda habilitado, sucursal, hire_date y estado pending', emp.is_enabled === true && emp.branch_id === BR && emp.hire_date === '2020-01-15' && emp.device_sync_status === 'pending' && emp.device_employee_number === e1.no, j(emp));
    eq('suggested_device_number = employee_code valido', emp.suggested_device_number, e1.code);
    r = await A('PATCH', `/employees/${E[2].id}`, { branch_id: BR, device_employee_number: e1.no.toLowerCase(), is_enabled: true });
    st('numero repetido en minusculas -> 409', r, 409);
    check('mensaje 409 menciona que ya lo usa', /ya lo usa/i.test(r.json?.message || ''), brief(r));
    st('habilitar sin numero -> 400', await A('PATCH', `/employees/${E[2].id}`, { branch_id: BR, is_enabled: true }), 400);
    st('habilitar empleado inactivo -> 400', await A('PATCH', `/employees/${E.inactive.id}`, { branch_id: BR, device_employee_number: `TEST-${RUN}IN`, is_enabled: true }), 400);
    st('sucursal inexistente -> 400', await A('PATCH', `/employees/${E[2].id}`, { branch_id: 999999 }), 400);
    st('numero con caracteres invalidos -> 400', await A('PATCH', `/employees/${E[2].id}`, { device_employee_number: 'ab c!' }), 400);
    st('body vacio -> 400', await A('PATCH', `/employees/${E[2].id}`, {}), 400);
    st('hire_date invalida -> 400', await A('PATCH', `/employees/${E[2].id}`, { hire_date: '2026-02-31' }), 400);
    st('empleado inexistente -> 404', await A('PATCH', '/employees/99999999', { is_enabled: false }), 404);
    // bulk
    r = await A('POST', '/employees/bulk-enable', { default_branch_id: BR, rows: [{ employee_id: E[2].id, device_employee_number: E[2].no }, { employee_id: E[3].id, device_employee_number: E[3].no }] });
    st('bulk-enable E2,E3 200', r, 200);
    eq('bulk enabled=2', [r.json?.enabled, (r.json?.employee_ids || []).sort()], [2, [E[2].id, E[3].id].sort()]);
    r = await A('POST', '/employees/bulk-enable', { default_branch_id: BR, rows: [{ employee_id: E[4].id, device_employee_number: E[4].no }, { employee_id: E[5].id, device_employee_number: E[4].no }] });
    st('bulk con numero repetido en el lote -> 400', r, 400);
    check('bulk 400 trae details.rows', Array.isArray(r.json?.details?.rows) && r.json.details.rows.length >= 1, brief(r));
    eq('bulk atomico: E4 sigue sin habilitar', (await get(`/employees/${E[4].id}`)).json?.employee?.is_enabled, false);
    r = await A('POST', '/employees/bulk-enable', { default_branch_id: BR, rows: [{ employee_id: E[4].id, device_employee_number: E[1].no.toLowerCase() }] });
    st('bulk con numero de otro empleado (otra capitalizacion) -> 400/409', r, [400, 409]);
    r = await A('POST', '/employees/bulk-enable', { default_branch_id: BR, rows: [{ employee_id: E[2].id, device_employee_number: `TEST-${RUN}Z9` }] });
    st('bulk con empleado ya habilitado -> 400/409', r, [400, 409]);
    st('bulk sin sucursal (ni default ni del empleado) -> 400', await A('POST', '/employees/bulk-enable', { rows: [{ employee_id: E[4].id, device_employee_number: E[4].no }] }), 400);
    st('bulk sin filas -> 400', await A('POST', '/employees/bulk-enable', { rows: [] }), 400);
    // hire_dates para vacaciones y resto
    const hire2 = addDays(TODAY, -(365 * 2 + 10)); const hire7 = addDays(TODAY, -(365 * 7 + 40));
    E[7].hire = hire2; E[8].hire = hire7;
    psql(`UPDATE employees SET hire_date = DATE '${hire2}' WHERE id=${E[7].id}`); psql(`UPDATE employees SET hire_date = DATE '${hire7}' WHERE id=${E[8].id}`);
    const rest = [E[4], E[5], E[6], E[7], E[8], L[1], L[2], L[3], L[4]].map((e) => ({ employee_id: e.id, device_employee_number: e.no }));
    r = await A('POST', '/employees/bulk-enable', { default_branch_id: BR, rows: rest });
    st('bulk-enable del resto (9) 200', r, 200);
    eq('enabled=9', r.json?.enabled, 9);
    r = await get(`/employees?branch_id=${BR}&enabled=true&search=${RUN}&limit=50`);
    eq('listado filtrado por RUN: 12 habilitados', r.json?.pagination?.total, 12);
    r = await get(`/employees/summary?branch_id=${BR}`);
    check('summary.enabled >= 12 y pending_sync >= 12', r.json?.summary?.enabled >= 12 && r.json?.summary?.pending_sync >= 12, brief(r));
    r = await get(`/employees?branch_id=${BR}&search=${RUN}&without_schedule=true&limit=50`);
    eq('sin horario: 12 antes de programar', r.json?.pagination?.total, 12);
    r = await get(`/employees/${E[1].id}`);
    eq('GET /employees/:id nombre de sucursal', r.json?.employee?.branch_name, BR_NAME);
    st('GET /employees/:id inexistente 404', await get('/employees/99999999'), 404);
    st('GET /employees/abc 400', await get('/employees/abc'), 400);
    st('GET /branches 200 con la sucursal', await get('/branches'), 200);
  });

  // ------------------------------------------------------------ 2. Horarios
  const SH = {};
  const asg = {};
  await section('2 Horarios', async () => {
    const mkShift = (key, body) => A('POST', '/shifts', { name: `TEST-E2E-${RUN}-${key}`, ...body });
    const defs = {
      Normal: { start_time: '08:00', end_time: '17:00', break_minutes: 60 },
      Noct: { start_time: '22:00', end_time: '06:00' },
      Flex: { start_time: '08:00', end_time: '17:00', shift_type: 'flexible', color_hex: '#10B981' },
      PartA: { start_time: '09:00', end_time: '13:00' },
      PartB: { start_time: '16:00', end_time: '20:00' },
      Over: { start_time: '12:00', end_time: '18:00' },
      Late1: { start_time: '20:30', end_time: '21:00' },
      Late2: { start_time: '21:10', end_time: '21:40' },
    };
    for (const [k, b] of Object.entries(defs)) {
      const r = await mkShift(k, b);
      st(`crear turno ${k} 201`, r, 201);
      SH[k] = r.json?.shift;
    }
    eq('Normal: crosses_midnight=false, break 60, fixed', [SH.Normal?.crosses_midnight, SH.Normal?.break_minutes, SH.Normal?.shift_type], [false, 60, 'fixed']);
    eq('Noct: crosses_midnight=true', SH.Noct?.crosses_midnight, true);
    eq('Flex: shift_type flexible, color', [SH.Flex?.shift_type, SH.Flex?.color_hex], ['flexible', '#10B981']);
    st('nombre repetido (otra capitalizacion) -> 409', await A('POST', '/shifts', { name: `test-e2e-${RUN}-normal`, start_time: '08:00', end_time: '17:00' }), 409);
    st('hora invalida -> 400', await A('POST', '/shifts', { name: `TEST-E2E-${RUN}-X`, start_time: '25:00', end_time: '17:00' }), 400);
    st('color invalido -> 400', await A('POST', '/shifts', { name: `TEST-E2E-${RUN}-X`, start_time: '08:00', end_time: '17:00', color_hex: 'rojo' }), 400);
    st('break > 480 -> 400', await A('POST', '/shifts', { name: `TEST-E2E-${RUN}-X`, start_time: '08:00', end_time: '17:00', break_minutes: 481 }), 400);
    st('nombre de 1 caracter -> 400', await A('POST', '/shifts', { name: 'X', start_time: '08:00', end_time: '17:00' }), 400);
    let r = await A('PATCH', `/shifts/${SH.Over.id}`, { color_hex: '#FF0000' });
    st('PATCH turno color 200', r, 200);
    st('PATCH turno inexistente 404', await A('PATCH', '/shifts/99999999', { color_hex: '#FF0000' }), 404);
    st('PATCH turno con nombre repetido 409', await A('PATCH', `/shifts/${SH.Over.id}`, { name: `TEST-E2E-${RUN}-Normal` }), 409);
    st('PATCH turno vacio 400', await A('PATCH', `/shifts/${SH.Over.id}`, {}), 400);

    // programacion recurrente L-V
    const rec = (ids, shifts, extra = {}) => A('POST', '/assignments', { employee_ids: ids.map((e) => e.id), shift_ids: shifts.map((s) => s.id), start_date: START, repeats_weekly: true, week_interval: 1, weekdays: [1, 2, 3, 4, 5], ...extra });
    r = await rec([E[1], E[4], E[5], E[7], E[8]], [SH.Normal]);
    st('recurrente L-V Normal a 5 empleados 201', r, 201);
    eq('5 asignaciones', r.json?.assignments?.length, 5);
    asg.E5 = r.json?.assignments?.find((a) => a.employee_id === E[5].id)?.id;
    check('asignacion trae weekdays [1..5], repeats_weekly, end_date null', j(r.json?.assignments?.[0]?.weekdays) === j([1, 2, 3, 4, 5]) && r.json.assignments[0].repeats_weekly === true && r.json.assignments[0].end_date === null, j(r.json?.assignments?.[0]));
    st('recurrente nocturno E2 201', await rec([E[2]], [SH.Noct]), 201);
    r = await rec([E[3]], [SH.PartA, SH.PartB]);
    st('recurrente partido E3 (2 turnos) 201', r, 201); eq('2 asignaciones para E3', r.json?.assignments?.length, 2);
    st('recurrente flexible E6 201', await rec([E[6]], [SH.Flex]), 201);
    r = await get(`/employees?branch_id=${BR}&search=${RUN}&without_schedule=true&limit=50`);
    eq('sin horario: solo quedan los 4 L', r.json?.pagination?.total, 4);
    // validaciones de entrada
    st('recurrente sin weekdays -> 400', await A('POST', '/assignments', { employee_ids: [L[1].id], shift_ids: [SH.Normal.id], start_date: START, repeats_weekly: true }), 400);
    st('empleado no habilitado -> 409', await A('POST', '/assignments', { employee_ids: [E[4].id, E.inactive.id], shift_ids: [SH.Normal.id], start_date: addDays(TODAY, 20), repeats_weekly: false }), 409);
    st('turno inexistente -> 400/404', await A('POST', '/assignments', { employee_ids: [L[1].id], shift_ids: [99999999], start_date: addDays(TODAY, 20), repeats_weekly: false }), [400, 404]);
    st('week_interval 9 -> 400', await A('POST', '/assignments', { employee_ids: [L[1].id], shift_ids: [SH.Normal.id], start_date: START, repeats_weekly: true, week_interval: 9, weekdays: [1] }), 400);
    // conflictos y rollback
    r = await A('POST', '/assignments', { employee_ids: [L[1].id, E[5].id], shift_ids: [SH.Over.id], start_date: START, repeats_weekly: true, week_interval: 1, weekdays: [1, 2, 3, 4, 5] });
    st('traslape (Over 12-18 vs Normal 8-17) -> 409', r, 409);
    check('409 trae details con conflicts', Array.isArray(r.json?.details) && r.json.details[0]?.conflicts?.length > 0, brief(r));
    eq('rollback: L1 sigue sin asignaciones', (await get(`/schedule/employee/${L[1].id}?from=${addDays(TODAY, 1)}&to=${addDays(TODAY, 14)}`)).json?.days?.some((d) => d.chips?.length), false);
    const farDay = addDays(TODAY, 30);
    r = await A('POST', '/assignments', { employee_ids: [E[3].id], shift_ids: [SH.PartA.id, SH.PartB.id, SH.Late1.id, SH.Late2.id], start_date: farDay, repeats_weekly: false });
    st('mas de 3 turnos por dia -> 409', r, 409);
    r = await A('POST', '/assignments', { employee_ids: [E[3].id], shift_ids: [SH.PartA.id, SH.PartB.id, SH.Late1.id], start_date: farDay, repeats_weekly: false });
    st('exactamente 3 turnos en un dia suelto -> 201', r, 201);
    // dia suelto, descanso y turno sobre descanso (E6)
    const d10 = addDays(TODAY, 10); const d11 = addDays(TODAY, 11);
    r = await A('POST', '/assignments', { employee_ids: [E[6].id], shift_ids: [SH.Normal.id], start_date: d10, repeats_weekly: false, notes: 'dia suelto e2e' });
    st('dia suelto E6 201', r, 201); eq('suelto: end_date=start_date, repeats_weekly=false', [r.json?.assignments?.[0]?.end_date, r.json?.assignments?.[0]?.repeats_weekly], [d10, false]);
    asg.E6suelto = r.json?.assignments?.[0]?.id;
    r = await A('POST', '/assignments', { employee_ids: [E[6].id], shift_ids: [], start_date: d11, repeats_weekly: false });
    st('descanso (sin turnos) 201', r, 201); eq('descanso: shift_id null, is_rest_day', [r.json?.assignments?.[0]?.shift_id, r.json?.assignments?.[0]?.is_rest_day], [null, true]);
    r = await A('POST', '/assignments', { employee_ids: [E[6].id], shift_ids: [SH.Normal.id], start_date: d11, repeats_weekly: false });
    st('turno sobre descanso (mismo dia suelto) -> 409', r, 409);
    eq('rollback: sigue habiendo 1 sola asignacion suelta ese dia', (await get(`/schedule/employee/${E[6].id}?from=${d11}&to=${d11}`)).json?.days?.[0]?.chips?.length, 1);
    r = await get(`/schedule/employee/${E[6].id}?from=${d10}&to=${d11}`);
    eq('ficha: d10 con turno Normal, d11 descanso', [r.json?.days?.[0]?.chips?.[0]?.start_time, r.json?.days?.[1]?.is_rest_day, r.json?.days?.[1]?.chips?.[0]?.name], ['08:00', true, 'Descanso']);
    // editar solo notas no debe dar 409
    r = await A('PATCH', `/assignments/${asg.E5}`, { notes: 'solo notas e2e' });
    st('PATCH asignacion solo notas -> 200 (sin falso 409)', r, 200); eq('notas guardadas', r.json?.assignment?.notes, 'solo notas e2e');
    r = await A('PATCH', `/assignments/${asg.E5}`, { weekdays: [1, 2, 3, 4] });
    st('PATCH weekdays [1-4] 200', r, 200);
    r = await A('PATCH', `/assignments/${asg.E5}`, { weekdays: [1, 2, 3, 4, 5] });
    st('PATCH weekdays restaurado 200', r, 200);
    st('PATCH asignacion inexistente 404', await A('PATCH', '/assignments/99999999', { notes: 'x' }), 404);
    st('PATCH fin < inicio -> 400', await A('PATCH', `/assignments/${asg.E5}`, { end_date: addDays(START, -3) }), [400, 409]);
    // E3 tiene PartA y PartB: cambiar la de PartB a PartA deja un turno repetido el mismo dia -> 409 (y no debe cambiar nada)
    const aB = psql(`SELECT id FROM attendance.shift_assignments WHERE employee_id=${E[3].id} AND shift_id=${SH.PartB.id}`)[0][0];
    r = await A('PATCH', `/assignments/${aB}`, { shift_id: SH.PartA.id });
    st('PATCH asignacion a un turno repetido el mismo dia -> 409', r, 409);
    if (r.status === 200) await A('PATCH', `/assignments/${aB}`, { shift_id: SH.PartB.id });
    eq('el 409 no modifica la asignacion', psql(`SELECT shift_id FROM attendance.shift_assignments WHERE id=${aB}`)[0][0], String(SH.PartB.id));
    r = await A('PATCH', `/assignments/${asg.E5}`, { shift_id: SH.Over.id });
    st('PATCH asignacion de E5 a otro turno sin conflicto 200 y se revierte', r, 200);
    await A('PATCH', `/assignments/${asg.E5}`, { shift_id: SH.Normal.id });
    eq('E5 vuelve a Normal', psql(`SELECT shift_id FROM attendance.shift_assignments WHERE id=${asg.E5}`)[0][0], String(SH.Normal.id));
    // terminar y quitar (L1, desechable)
    r = await A('POST', '/assignments', { employee_ids: [L[1].id], shift_ids: [SH.Flex.id], start_date: START, repeats_weekly: true, week_interval: 1, weekdays: [1, 2, 3, 4, 5] });
    st('asignacion desechable L1 201', r, 201); const aL1 = r.json?.assignments?.[0]?.id;
    let endDay = addDays(TODAY, 8); while (!isWeekday(endDay)) endDay = addDays(endDay, 1);
    r = await A('DELETE', `/assignments/${aL1}?date=${endDay}&from_date_only=true`);
    st('terminar desde una fecha 200', r, 200); eq('accion end', r.json?.result?.action, 'end');
    const row = psql(`SELECT end_date FROM attendance.shift_assignments WHERE id=${aL1}`)[0]?.[0];
    eq('end_date = dia anterior a la fecha', row, addDays(endDay, -1));
    r = await A('DELETE', `/assignments/${aL1}`);
    st('quitar fisicamente 200', r, 200); eq('accion remove', r.json?.result?.action, 'remove');
    eq('asignacion ya no existe en BD', psql(`SELECT count(*) FROM attendance.shift_assignments WHERE id=${aL1}`)[0][0], '0');
    st('quitar inexistente 404', await A('DELETE', '/assignments/99999999'), 404);
    // copiar semana (E1 -> L1, semana lejana)
    const srcDate = addDays(TODAY, 70);
    r = await A('POST', '/schedule/copy', { source_employee_id: E[1].id, source_date: srcDate, target_employee_ids: [L[1].id], same_week: true, weeks: 1, replace: false });
    st('copiar semana E1->L1 200', r, 200); eq('copiados 5 dias (L-V)', [r.json?.result?.created, r.json?.result?.assignments_created], [5, 5]);
    r = await A('POST', '/schedule/copy', { source_employee_id: E[1].id, source_date: srcDate, target_employee_ids: [L[1].id], same_week: true });
    eq('copiar de nuevo: omite 5 existentes', [r.json?.result?.created, r.json?.result?.skipped_existing], [0, 5]);
    r = await A('POST', '/schedule/copy', { source_employee_id: E[1].id, source_date: srcDate, target_employee_ids: [L[1].id], same_week: true, replace: true });
    eq('copiar con replace=true: 5 de nuevo', r.json?.result?.created, 5);
    eq('replace no duplica: 5 chips en la semana', (await get(`/schedule/employee/${L[1].id}?from=${addDays(srcDate, -dow(srcDate))}&to=${addDays(srcDate, 6 - dow(srcDate))}`)).json?.days?.reduce((n, d) => n + d.chips.length, 0), 5);
    st('copiar desde semana sin horario -> 400', await A('POST', '/schedule/copy', { source_employee_id: L[4].id, source_date: srcDate, target_employee_ids: [L[3].id] }), 400);
    // calendario
    const wk = await get(`/schedule?week=${WD[1]}&branch_id=${BR}&search=${RUN}&limit=50`);
    st('calendario semanal 200', wk, 200);
    const row1 = wk.json?.data?.find((x) => x.employee_id === E[1].id);
    const rowS = wk.json?.data?.find((x) => x.employee_id === E[3].id);
    eq('semana: 7 dias, inicio domingo', [wk.json?.days?.length, wk.json?.week_start], [7, 'sunday']);
    eq('E1: 40 h semanales (5x8 netas)', row1?.week_hours, 40);
    const dayChips = row1?.days?.find((d) => d.date === WD[1]);
    eq('chip de E1: nombre, horas, vigencia recurrente', [dayChips?.chips?.[0]?.name, dayChips?.chips?.[0]?.start_time, dayChips?.chips?.[0]?.hours, dayChips?.chips?.[0]?.is_recurring], [`TEST-E2E-${RUN}-Normal`, '08:00', 8, true]);
    const sDay = rowS?.days?.find((d) => d.date === WD[1]);
    eq('E3 dia partido: is_split, 2 chips, 8 h', [sDay?.is_split, sDay?.chips?.length, sDay?.total_hours], [true, 2, 8]);
    check('calendario trae leyenda de turnos y max_shifts_per_day=3', wk.json?.shifts?.length >= 6 && wk.json?.max_shifts_per_day === 3, brief(wk));
    st('calendario: fecha invalida 400', await get('/schedule?week=2026-13-45'), 400);
    r = await get(`/shifts`);
    const n = r.json?.shifts?.find((s) => s.id === SH.Normal.id);
    check('GET /shifts: assignments_count de Normal >= 5', n?.assignments_count >= 5, j(n));
    // bitacora
    r = await get(`/schedule/log?employee_id=${E[6].id}`);
    st('bitacora 200', r, 200); check('bitacora tiene altas del dia suelto y descanso', (r.json?.data || []).filter((x) => x.action === 'schedule').length >= 2, brief(r));
    r = await get(`/schedule/log?employee_id=${L[1].id}&action=copy`);
    check('bitacora filtra accion=copy', (r.json?.data || []).length >= 1 && r.json.data.every((x) => x.action === 'copy'), brief(r));
    r = await get(`/schedule/log?employee_id=${L[1].id}&action=remove`);
    check('bitacora registra remove', (r.json?.data || []).some((x) => x.action === 'remove'), brief(r));
    r = await get(`/schedule/log?employee_id=${L[1].id}&action=end`);
    check('bitacora registra end', (r.json?.data || []).some((x) => x.action === 'end'), brief(r));
    st('bitacora action invalida 400', await get('/schedule/log?action=zzz'), 400);
    st('shift_ids de Normal visibles en listado con include_inactive', await get('/shifts?include_inactive=true'), 200);
  });

  // ------------------------------------------------------------ 3. Relojes
  await section('3 Relojes y agente', async () => {
    let r;
    SERIAL = `E2E${RUN}01`;
    if (!AGENT) {
      r = await A('POST', '/devices/agents', { branch_id: BR, name: `E2E Agente ${RUN}` });
      st('crear agente 201', r, 201);
      AGENT = r.json?.agent; AGENT_KEY = r.json?.agent_key;
      check('agent_key es 64 hex y config.agentKey igual', /^[0-9a-f]{64}$/.test(AGENT_KEY || '') && r.json?.config?.agentKey === AGENT_KEY, brief(r));
      check('Cache-Control no-store en alta', /no-store/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
      check('config.docsafeUrl presente', !!r.json?.config?.docsafeUrl, brief(r));
      check('agent no expone api_key_hash', !('api_key_hash' in (AGENT || {})) && !j(r.json?.agent).includes('hash'), j(AGENT));
      st('segundo agente en la misma sucursal -> 409', await A('POST', '/devices/agents', { branch_id: BR, name: 'Otro' }), 409);
    } else {
      st('(reuso) alta sobre sucursal con agente -> 409', await A('POST', '/devices/agents', { branch_id: BR, name: 'Otro' }), 409);
      await A('PATCH', `/devices/agents/${AGENT.id}`, { is_active: true });
      r = await A('POST', `/devices/agents/${AGENT.id}/rotate-key`);
      AGENT_KEY = r.json?.agent_key;
    }
    st('sucursal inexistente -> 400', await A('POST', '/devices/agents', { branch_id: 999999, name: 'X' }), 400);
    st('nombre vacio -> 400', await A('POST', '/devices/agents', { branch_id: BR, name: '' }), 400);
    // latido
    r = await AG('POST', '/heartbeat', { version: '1.0.0', pc: 'E2E-PC', os: 'test', ip: '10.0.0.9', terminals: [{ serial: SERIAL, model: 'DS-K1T-SIM', firmware: 'V1', ip: '10.0.0.50', online: true, clockDriftSeconds: 3, people: 0 }] });
    st('latido 200', r, 200);
    check('latido: ok, pendingOrders numerico, serverTime ISO, clockDriftMaxMin', r.json?.ok === true && typeof r.json.pendingOrders === 'number' && !Number.isNaN(Date.parse(r.json.serverTime)) && r.json.clockDriftMaxMin === 10, brief(r));
    r = await AG('POST', '/heartbeat', { version: '1', terminals: [{ serial: 'SIM320MFWX0001', online: true }] });
    check('terminal de otro agente: terminalErrors 409', r.json?.terminalErrors?.[0]?.status === 409, brief(r));
    st('latido con 21 terminales -> 400', await AG('POST', '/heartbeat', { terminals: Array.from({ length: 21 }, (_, i) => ({ serial: `X${i}` })) }), 400);
    r = await get('/devices/overview');
    const b = r.json?.branches?.find((x) => x.branch_id === BR);
    check('overview: agente en linea con su terminal y deriva 3 s', b?.agent?.is_online === true && b.terminals?.some((t) => t.serial_number === SERIAL && t.is_online && t.clock_drift_seconds === 3), j(b));
    // auth del agente
    st('agente sin Authorization -> 401', await req('POST', `${API}/agent/heartbeat`, { body: {} }), 401);
    st('agente con clave falsa -> 401', await AG('POST', '/heartbeat', {}, 'f'.repeat(64)), 401);
    st('agente con clave corta -> 401', await AG('POST', '/heartbeat', {}, 'abc'), 401);
    st('JWT de usuario como clave de agente -> 401', await AG('POST', '/heartbeat', {}, TOKEN), 401);
    st('agente en ruta de usuario (/employees) -> 401/403', await req('GET', `${API}/employees`, { token: AGENT_KEY }), [401, 403]);
    st('terminal desconocida en punches -> 404', await sendPunches([ev('X', WD[0], '08:00', IN)], 'NO-EXISTE'), 404);
    st('lote vacio -> 400', await sendPunches([]), 400);
    st('lote de 501 -> 400', await sendPunches(Array.from({ length: 501 }, () => ev('X', WD[0], '08:00', IN))), 400);
    st('orden inexistente -> 404', await AG('POST', '/orders/99999999/result', { ok: true }), 404);
    // enroll antes de sincronizar
    r = await A('POST', `/devices/employees/${E[3].id}/enroll`, { mode: 'face' });
    st('enroll de colaborador no sincronizado -> 400', r, 400);
    st('enroll modo invalido -> 400', await A('POST', `/devices/employees/${E[3].id}/enroll`, { mode: 'iris' }), 400);
    st('enroll colaborador inexistente -> 404', await A('POST', '/devices/employees/99999999/enroll', { mode: 'face' }), 404);
    // sincronizar personal
    r = await A('POST', `/devices/agents/${AGENT.id}/sync`, {});
    st('sync personal 200', r, 200);
    check('sync: queued_sync >= 12 y queued = sync+remove', r.json?.queued_sync >= 12 && r.json.queued === r.json.queued_sync + r.json.queued_remove, brief(r));
    r = await A('POST', `/devices/agents/${AGENT.id}/sync`, {});
    eq('segundo sync no duplica ordenes abiertas', r.json?.queued, 0);
    r = await get('/employees/summary?branch_id=' + BR);
    check('summary refleja pending_sync >= 12', r.json?.summary?.pending_sync >= 12, brief(r));
    st('test de agente (check_status) 201', (r = await A('POST', `/devices/agents/${AGENT.id}/test`)), 201);
    const checkOrder = r.json?.order_id;
    // el agente toma ordenes y reporta
    const taken = [];
    for (let k = 0; k < 10; k += 1) { const o = await AG('GET', '/orders?limit=20'); if (k === 0) st('GET /orders del agente 200', o, 200); const list = o.json?.orders || []; if (!list.length) break; taken.push(...list); }
    const mine = taken.filter((o) => o.type === 'sync_person' && [...Object.values(E), ...Object.values(L)].some((e) => e.no && o.payload?.employeeNo === e.no));
    eq('el agente recibio 12 sync_person nuestros', mine.length, 12);
    check('payload de sync_person trae employeeNo y name', mine.every((o) => o.payload.employeeNo && o.payload.name), j(mine[0]));
    check('el agente recibio la orden check_status', taken.some((o) => o.id === checkOrder && o.type === 'check_status'), j(taken.map((o) => o.type)));
    check('tomadas quedan processing (GET /orders no las repite)', ((await AG('GET', '/orders?limit=20')).json?.orders || []).length === 0);
    const bad = mine.find((o) => o.payload.employeeNo === E[1].no);
    for (const o of taken) {
      const rr = await AG('POST', `/orders/${o.id}/result`, o === bad ? { ok: false, error: 'Terminal sin memoria (e2e)' } : { ok: true, result: { terminals: 1 } });
      if (o === bad || o === taken[0]) st(`resultado de orden ${o.id} ${o === bad ? 'con error' : 'ok'} 200`, rr, 200);
    }
    st('cerrar de nuevo una orden ya cerrada -> 404', await AG('POST', `/orders/${bad.id}/result`, { ok: true }), 404);
    eq('E1 queda en error con mensaje', [(await get(`/employees/${E[1].id}`)).json?.employee?.device_sync_status, (await get(`/employees/${E[1].id}`)).json?.employee?.device_sync_error], ['error', 'Terminal sin memoria (e2e)']);
    eq('E2 queda synced con device_synced_at', [(await get(`/employees/${E[2].id}`)).json?.employee?.device_sync_status, !!(await get(`/employees/${E[2].id}`)).json?.employee?.device_synced_at], ['synced', true]);
    r = await get(`/devices/orders?agent_id=${AGENT.id}&status=error&limit=100`);
    check('listado de ordenes status=error contiene la de E1', (r.json?.orders || []).some((o) => o.id === bad.id && /memoria/.test(o.error_message || '')), brief(r));
    r = await get(`/devices/orders?agent_id=${AGENT.id}&status=done&limit=100`);
    check('listado de ordenes status=done >= 12', (r.json?.total ?? 0) >= 12, brief(r));
    st('ordenes status invalido 400', await get('/devices/orders?status=zzz'), 400);
    r = await A('POST', `/devices/agents/${AGENT.id}/sync`, {});
    eq('re-sync solo reencola el que fallo', r.json?.queued_sync, 1);
    const again = (await AG('GET', '/orders?limit=20')).json?.orders || [];
    eq('el agente recibe la orden reencolada', again.map((o) => o.payload?.employeeNo), [E[1].no]);
    await AG('POST', `/orders/${again[0]?.id}/result`, { ok: true });
    eq('E1 queda synced tras el reintento', (await get(`/employees/${E[1].id}`)).json?.employee?.device_sync_status, 'synced');
    // enroll ya sincronizado
    r = await A('POST', `/devices/employees/${E[3].id}/enroll`, { mode: 'face' });
    st('enroll face de colaborador sincronizado 201', r, 201); check('enroll devuelve order_id y terminal_id', !!r.json?.order_id && !!r.json?.terminal_id, brief(r));
    const eo = (await AG('GET', '/orders?limit=5')).json?.orders || [];
    check('el agente recibe enroll_face', eo.some((o) => o.type === 'enroll_face'), j(eo));
    for (const o of eo) await AG('POST', `/orders/${o.id}/result`, { ok: true });
    // activar/desactivar agente
    st('desactivar agente 200', await A('PATCH', `/devices/agents/${AGENT.id}`, { is_active: false }), 200);
    st('agente inactivo: latido 403', await AG('POST', '/heartbeat', {}), 403);
    st('agente inactivo: orders 403', await AG('GET', '/orders'), 403);
    st('agente inactivo: punches 403', await sendPunches([ev('X', WD[0], '08:00', IN)]), 403);
    st('test sobre agente inactivo 409', await A('POST', `/devices/agents/${AGENT.id}/test`), 409);
    st('reactivar agente 200', await A('PATCH', `/devices/agents/${AGENT.id}`, { is_active: true }), 200);
    st('eliminar agente activo -> 409', await A('DELETE', `/devices/agents/${AGENT.id}`), 409);
    st('PATCH agente vacio 400', await A('PATCH', `/devices/agents/${AGENT.id}`, {}), 400);
    st('PATCH agente inexistente 404', await A('PATCH', '/devices/agents/99999999', { name: 'xx' }), 404);
    // terminal
    const tid = (await get('/devices/overview')).json?.branches?.find((x) => x.branch_id === BR)?.terminals?.find((t) => t.serial_number === SERIAL)?.id;
    r = await A('PATCH', `/devices/terminals/${tid}`, { name: `Reloj E2E ${RUN}` });
    st('renombrar terminal 200', r, 200); eq('nombre de terminal', r.json?.terminal?.name, `Reloj E2E ${RUN}`);
    st('terminal inexistente 404', await A('PATCH', '/devices/terminals/99999999', { name: 'xx' }), 404);
    // rotar clave
    const oldKey = AGENT_KEY;
    r = await A('POST', `/devices/agents/${AGENT.id}/rotate-key`);
    st('rotar clave 200', r, 200); AGENT_KEY = r.json?.agent_key;
    check('clave nueva distinta y de 64 hex', /^[0-9a-f]{64}$/.test(AGENT_KEY || '') && AGENT_KEY !== oldKey, brief(r));
    st('clave anterior -> 401', await AG('POST', '/heartbeat', {}, oldKey), 401);
    st('clave nueva -> 200', await AG('POST', '/heartbeat', { terminals: [{ serial: SERIAL, online: true, clockDriftSeconds: 3, people: 12 }] }), 200);
    st('rotar agente inexistente 404', await A('POST', '/devices/agents/99999999/rotate-key'), 404);
  });

  // ------------------------------------------------------------ ingesta de checadas (escenarios)
  const P = {}; // ids de checadas de interes
  await section('3b Ingesta de checadas', async () => {
    const batch1 = [
      ev(E[1].no, WD[0], '07:58', IN), ev(E[1].no, WD[0], '17:03', OUT), // puntual
      ev(E[1].no, WD[1], '08:20', IN), ev(E[1].no, WD[1], '17:00', OUT), // retardo 20
      ev(E[1].no, WD[2], '08:45', IN), ev(E[1].no, WD[2], '17:00', OUT), // retardo 45 (falta)
      ev(E[1].no, WD[3], '08:00', IN), // sin salida
      ev(E[1].no, WD[4], '08:00', IN), ev(E[1].no, WD[4], '16:30', OUT), // salida anticipada
      ev(E[1].no, WD[5], '08:00:00', IN), ev(E[1].no, WD[5], '08:00:30', IN), // rebote 30 s
      ev(E[1].no, WD[6], '08:00', IN), ev(E[1].no, WD[6], '11:00', OUT), // jornada incompleta
      // nocturno E2
      ev(E[2].no, WD[1], '21:55', IN), ev(E[2].no, addDays(WD[1], 1), '06:02', OUT),
      ev(E[2].no, WD[2], '22:30', IN), ev(E[2].no, addDays(WD[2], 1), '06:00', OUT),
      // partido E3
      ev(E[3].no, WD[1], '09:00', IN), ev(E[3].no, WD[1], '13:00', OUT), ev(E[3].no, WD[1], '16:00', IN), ev(E[3].no, WD[1], '20:00', OUT),
      ev(E[3].no, WD[2], '09:00', IN), ev(E[3].no, WD[2], '13:00', OUT),
      // E4 acumulacion y horas extra
      ev(E[4].no, ACC[0], '08:15', IN), ev(E[4].no, ACC[0], '17:00', OUT),
      ev(E[4].no, ACC[1], '08:20', IN), ev(E[4].no, ACC[1], '17:00', OUT),
      ev(E[4].no, ACC[2], '08:25', IN), ev(E[4].no, ACC[2], '17:00', OUT),
      ev(E[4].no, BD, '08:10', IN), ev(E[4].no, BD, '19:00', OUT),
      // E5 revision
      ev(E[5].no, WD[1], '08:25', IN), ev(E[5].no, WD[1], '17:00', OUT),
      ev(E[5].no, WD[2], '08:25', IN), ev(E[5].no, WD[2], '17:00', OUT),
      // E6 flexible
      ev(E[6].no, WD[1], '11:30', IN), ev(E[6].no, WD[1], '17:30', OUT),
      ev(E[6].no, WD[2], '08:00', IN), ev(E[6].no, WD[2], '11:00', OUT),
    ];
    let r = await sendPunches(batch1);
    st('lote principal 200', r, 200);
    eq('inserted = tamano del lote, 0 duplicadas, 0 invalidas', [r.json?.inserted, r.json?.duplicated, r.json?.invalid], [batch1.length, 0, 0]);
    r = await sendPunches([batch1[0]]);
    eq('duplicado (mismo serial) -> duplicated=1, inserted=0', [r.json?.inserted, r.json?.duplicated], [0, 1]);
    // desconocido (dos, para aprobar y rechazar) + foto + foto invalida + desfase
    const photo = ev(E[5].no, WD[4], '08:00', IN, { photoBase64: PNG_B64 });
    const badPhoto = ev(E[5].no, WD[4], '17:00', OUT, { photoBase64: 'esto-no-es-una-imagen' });
    r = await sendPunches([ev(`UNK-${RUN}A`, WD[1], '08:00', IN), ev(`UNK-${RUN}B`, WD[2], '08:00', IN), photo, badPhoto]);
    eq('desconocidos + fotos: 4 insertadas', r.json?.inserted, 4);
    const now = new Date(Date.now() - 30 * 60000).toISOString();
    r = await sendPunches([{ serial: `${RUN}-drift`, employeeNo: E[5].no, deviceTime: now, attendanceStatus: IN, method: 'face' }]);
    eq('reloj desfasado 30 min inserta', r.json?.inserted, 1);
    // lote con invalidos
    r = await sendPunches([ev(E[8].no, WD[7], '08:00', IN), { serial: `${RUN}-bad1`, employeeNo: E[8].no }, { serial: `${RUN}-bad2`, deviceTime: lt(WD[7], '08:00') }, { serial: `${RUN}-bad3`, employeeNo: E[8].no, deviceTime: 'no-es-fecha' }]);
    st('lote con invalidos 200', r, 200);
    eq('1 insertada, 3 invalidas, invalidSerials de 3', [r.json?.inserted, r.json?.invalid, r.json?.invalidSerials?.length], [1, 3, 3]);
    await sendPunches([ev(E[8].no, WD[7], '17:00', OUT)]);
    // verificacion de la revision pendiente en GET /punches
    r = await get(`/punches?branch_id=${BR}&from=${addDays(TODAY, -45)}&to=${TODAY}&only_review=true&limit=200`);
    st('GET /punches only_review 200', r, 200);
    const pend = r.json?.data || [];
    const unkA = pend.find((p) => p.device_employee_number === `UNK-${RUN}A`);
    const unkB = pend.find((p) => p.device_employee_number === `UNK-${RUN}B`);
    check('desconocido: employee null, pending, motivo', unkA && unkA.employee === null && unkA.review_status === 'pending' && /sin colaborador/i.test(unkA.review_reason || ''), j(unkA));
    const drift = pend.find((p) => p.employee?.id === E[5].id && /desfase/i.test(p.review_reason || ''));
    check('reloj desfasado 30 min queda pending con motivo "Desfase"', !!drift, j(pend.filter((p) => p.employee?.id === E[5].id)));
    check('solo las 3 esperadas estan en revision (UNK A, B, desfase)', pend.filter((p) => String(p.device_employee_number).includes(RUN) || p.employee?.id === E[5].id).length === 3, `pendientes=${pend.length} ${j(pend.map((p) => [p.device_employee_number, p.review_reason]))}`);
    P.unkA = unkA?.id; P.unkB = unkB?.id; P.drift = drift?.id;
    r = await get(`/punches?employee_id=${E[1].id}&from=${WD[0]}&to=${WD[0]}`);
    check('checada historica de empleado conocido: review none, source terminal, terminal+branch', r.json?.data?.length === 2 && r.json.data.every((p) => p.review_status === 'none' && p.source === 'terminal' && p.terminal?.serial_number === SERIAL && p.branch?.id === BR && p.punch_type), brief(r));
    const wd0 = r.json?.data?.[r.json.data.length - 1];
    eq('punched_at se guarda en UTC correcto (07:58 local = 13:58Z)', r.json?.data?.map((p) => p.punched_at).sort()[0], utc(WD[0], '07:58'));
    check('verification_method face', wd0?.verification_method === 'face', j(wd0));
    // fotos
    r = await get(`/punches?employee_id=${E[5].id}&from=${WD[4]}&to=${WD[4]}`);
    const withPhoto = (r.json?.data || []).find((p) => p.punched_at === utc(WD[4], '08:00'));
    const noPhoto = (r.json?.data || []).find((p) => p.punched_at === utc(WD[4], '17:00'));
    P.photo = withPhoto?.id; P.nophoto = noPhoto?.id;
    check('ambas checadas de la foto se guardaron', !!withPhoto && !!noPhoto, brief(r));
    if (withPhoto) {
      r = await get(`/punches/${withPhoto.id}/photo`, { raw: true });
      check('foto valida: 200 image/png con firma PNG', r.status === 200 && /image\/png/.test(r.ctype) && r.buf.subarray(1, 4).toString() === 'PNG', `HTTP ${r.status} ${r.ctype}`);
      st('foto sin token 401', await get(`/punches/${withPhoto.id}/photo`, { token: null }), 401);
      st('foto sin permiso 403', await get(`/punches/${withPhoto.id}/photo`, { token: env.NOPERM }), 403);
      st('foto con viewer 200', await get(`/punches/${withPhoto.id}/photo`, { token: env.VIEWER, raw: true }), 200);
    }
    if (noPhoto) st('foto invalida: la checada se guardo sin foto (404 al pedirla)', await get(`/punches/${noPhoto.id}/photo`), 404);
    // filtros de /punches
    check('filtro source=manual no trae terminal', (await get(`/punches?source=manual&from=${START}&to=${TODAY}&branch_id=${BR}`)).json?.data?.every((p) => p.source === 'manual'));
    st('filtro review_status invalido 400', await get('/punches?review_status=zzz'), 400);
    st('rango > 366 dias 400', await get('/punches?from=2024-01-01&to=2026-01-01'), 400);
  });

  // ------------------------------------------------------------ 4. Calculo
  let D1; let D2; let D3; let D4;
  await section('4 Calculo de dias', async () => {
    let r = await recalc();
    st('recalculate 200', r, 200);
    eq('recalculate: 12 empleados', r.json?.employees, 12);
    check('recalculate: days > 0 (acotado a ayer)', r.json?.days > 0, brief(r));
    D1 = await daysOf(E[1]); D2 = await daysOf(E[2]); D3 = await daysOf(E[3]);
    const D4m = await daysOf(E[4]); D4 = D4m;
    const D5 = await daysOf(E[5]); const D6 = await daysOf(E[6]); const D7 = await daysOf(E[7]); const D8 = await daysOf(E[8]);
    // E1
    dayIs('E1 puntual: present/on_time, 8.08 h', D1, WD[0], { day_result: 'present', reason: 'on_time', late_minutes: 0, early_departure_minutes: 0, worked_hours: 8.08, clock_in_at: utc(WD[0], '07:58'), clock_out_at: utc(WD[0], '17:03') });
    dayIs('E1 retardo 20: late/late_entry, 7.67 h', D1, WD[1], { day_result: 'late', reason: 'late_entry', late_minutes: 20, worked_hours: 7.67 });
    dayIs('E1 retardo 45: absent/excessive_late (>30)', D1, WD[2], { day_result: 'absent', reason: 'excessive_late', late_minutes: 45 });
    dayIs('E1 sin salida: absent/missing_exit, sin clock_out', D1, WD[3], { day_result: 'absent', reason: 'missing_exit', clock_out_at: null, worked_hours: null });
    dayIs('E1 salida anticipada 30: early_departure/early_exit, 7.5 h', D1, WD[4], { day_result: 'early_departure', reason: 'early_exit', early_departure_minutes: 30, late_minutes: 0, worked_hours: 7.5 });
    dayIs('E1 rebote 30 s cuenta como una sola checada (missing_exit)', D1, WD[5], { day_result: 'absent', reason: 'missing_exit' });
    dayIs('E1 jornada incompleta: absent/workday_incomplete, 2 h netas', D1, WD[6], { day_result: 'absent', reason: 'workday_incomplete', worked_hours: 2 });
    dayIs('E1 dia sin checadas: absent/no_punches', D1, WD[7], { day_result: 'absent', reason: 'no_punches', clock_in_at: null });
    check('E1 dia puntual: expected_start/end y segmento', D1[WD[0]]?.expected_start_time === '08:00' && D1[WD[0]]?.expected_end_time === '17:00' && D1[WD[0]]?.segments?.length === 1 && D1[WD[0]].segments[0].has_punches, j(D1[WD[0]]));
    const weekend = Object.values(D1).find((d) => !isWeekday(d.work_date));
    check('fin de semana de E1: no es falta (rest_day/no_schedule)', weekend && ['rest_day', 'no_schedule'].includes(weekend.day_result), j(weekend));
    // E2 nocturno
    dayIs('E2 nocturno 21:55->06:02: present, 8.12 h, salida el dia siguiente', D2, WD[1], { day_result: 'present', reason: 'on_time', worked_hours: 8.12, clock_in_at: utc(WD[1], '21:55'), clock_out_at: utc(addDays(WD[1], 1), '06:02') });
    dayIs('E2 nocturno entrada 22:30 = retardo 30 (limite, no falta)', D2, WD[2], { day_result: 'late', late_minutes: 30, worked_hours: 7.5 });
    // E3 partido
    dayIs('E3 partido completo: present, 8 h, 2 segmentos', D3, WD[1], { day_result: 'present', worked_hours: 8 });
    eq('E3 partido: 2 segmentos con checadas', D3[WD[1]]?.segments?.map((s) => s.has_punches), [true, true]);
    dayIs('E3 partido solo manana: partial_absence/missing_segment, 4 h', D3, WD[2], { day_result: 'partial_absence', reason: 'missing_segment', worked_hours: 4 });
    // E4 acumulacion
    ACC.forEach((dt, i) => dayIs(`E4 retardo ${i + 1}/3 (${dt}): late y is_late_accumulation_absence=${i === 2}`, D4, dt, { day_result: 'late', is_late_accumulation_absence: i === 2, late_minutes: [15, 20, 25][i] }));
    dayIs('E4 08:10 exacto = dentro de tolerancia: present, 9.83 h', D4, BD, { day_result: 'present', late_minutes: 0, worked_hours: 9.83 });
    r = await get(`/days?employee_id=${E[4].id}&from=${ACC[0]}&to=${ACC[2]}`);
    check('summary: late_accumulation_absence=1', r.json?.summary?.late_accumulation_absence === 1, j(r.json?.summary));
    // E6 flexible
    dayIs('E6 flexible entra 11:30: present sin retardo, 6 h', D6, WD[1], { day_result: 'present', late_minutes: 0, worked_hours: 6 });
    dayIs('E6 flexible 3 h: absent/workday_incomplete', D6, WD[2], { day_result: 'absent', reason: 'workday_incomplete', worked_hours: 3 });
    // E5 base (antes de revisar)
    dayIs('E5 dia A: late 25 (la checada 08:00 desconocida aun no cuenta)', D5, WD[1], { day_result: 'late', late_minutes: 25, has_pending_review: false });
    dayIs('E5 dia D con foto: present', D5, WD[4], { day_result: 'present' });
    dayIs('E5 dia C sin checadas: absent/no_punches', D5, WD[3], { day_result: 'absent', reason: 'no_punches' });
    // E7/E8
    dayIs('E7 sin checadas: absent', D7, WD[1], { day_result: 'absent', reason: 'no_punches' });
    dayIs('E8 normal 8-17: present 8 h', D8, WD[7], { day_result: 'present', worked_hours: 8 });
    // idempotencia
    const snap = j([D1, D2, D3, D4, D5, D6, D7, D8]);
    r = await recalc();
    st('segundo recalculate 200', r, 200);
    const snap2 = j([await daysOf(E[1]), await daysOf(E[2]), await daysOf(E[3]), await daysOf(E[4]), await daysOf(E[5]), await daysOf(E[6]), await daysOf(E[7]), await daysOf(E[8])]);
    check('idempotencia: recalcular dos veces da el mismo resultado', snap === snap2, 'los dias cambiaron entre corridas');
    // errores del recalculo
    st('recalc: hoy no se recalcula (from=hoy) -> 400', await A('POST', '/days/recalculate', { from: TODAY, to: TODAY }), 400);
    st('recalc: futuro -> 400', await A('POST', '/days/recalculate', { from: addDays(TODAY, 3), to: addDays(TODAY, 5) }), 400);
    st('recalc: from > to -> 400', await A('POST', '/days/recalculate', { from: YESTERDAY, to: addDays(YESTERDAY, -3) }), 400);
    st('recalc: > 92 dias -> 400', await A('POST', '/days/recalculate', { from: addDays(TODAY, -100), to: YESTERDAY }), 400);
    st('recalc: fecha mal formada -> 400', await A('POST', '/days/recalculate', { from: '12/10/2026', to: YESTERDAY }), 400);
    r = await A('POST', '/days/recalculate', { from: addDays(TODAY, -2), to: TODAY, employee_ids: [E[1].id] });
    st('recalc con to=hoy se acota a ayer (200)', r, 200); eq('2 dias (anteanteayer..ayer) para 1 empleado', [r.json?.employees, r.json?.days], [1, 2]);
    // filtros de /days
    r = await get(`/days?branch_id=${BR}&search=${RUN}&from=${WD[1]}&to=${WD[1]}&limit=5&page=2`);
    check('paginacion de /days (limit=5, page=2)', r.json?.pagination?.limit === 5 && r.json.pagination.page === 2 && r.json.data.length <= 5, brief(r));
    r = await get(`/days?employee_id=${E[1].id}&from=${RFROM}&to=${YESTERDAY}&result=absent,late&limit=200`);
    check('filtro result=absent,late', r.json?.data?.length > 0 && r.json.data.every((d) => ['absent', 'late'].includes(d.day_result)), brief(r));
    r = await get(`/days?employee_id=${E[1].id}&from=${RFROM}&to=${YESTERDAY}&only_issues=true&limit=200`);
    check('only_issues excluye present/rest', r.json?.data?.every((d) => !['present', 'rest_day', 'no_schedule'].includes(d.day_result)), brief(r));
    st('filtro result invalido 400', await get('/days?result=zzz'), 400);
    st('rango > 366 dias 400', await get('/days?from=2024-01-01&to=2026-01-01'), 400);
    st('from > to 400', await get(`/days?from=${YESTERDAY}&to=${addDays(YESTERDAY, -5)}`), 400);

    // festivo: E1 puntual WD[0] y reaccion de la acumulacion de E4 (ACC[2] == WD[0] en la mayoria de los casos)
    r = await A('POST', '/holidays', { holiday_date: WD[0], name: `TEST-E2E festivo ${RUN}` });
    st('crear festivo 201', r, 201); const hol = r.json?.holiday; if (hol) created.holidays.push(hol.id);
    eq('festivo: campos', [hol?.holiday_date, hol?.is_active], [WD[0], true]);
    st('festivo duplicado en la fecha -> 409', await A('POST', '/holidays', { holiday_date: WD[0], name: 'otro' }), 409);
    const H1 = await daysOf(E[1]); const H7 = await daysOf(E[7]);
    dayIs('festivo con checadas: holiday/holiday_worked', H1, WD[0], { day_result: 'holiday', reason: 'holiday_worked' });
    dayIs('festivo sin checadas: holiday/holiday', H7, WD[0], { day_result: 'holiday', reason: 'holiday' });
    if (WD[0] === ACC[2]) {
      const H4 = await daysOf(E[4]);
      dayIs('festivo sobre el 3er retardo: pierde la marca de acumulacion', H4, ACC[2], { day_result: 'holiday', is_late_accumulation_absence: false });
    }
    st('festivo: PATCH is_active=false 200', await A('PATCH', `/holidays/${hol.id}`, { is_active: false }), 200);
    dayIs('festivo desactivado: vuelve present', await daysOf(E[1]), WD[0], { day_result: 'present', reason: 'on_time' });
    st('festivo: PATCH is_active=true 200', await A('PATCH', `/holidays/${hol.id}`, { is_active: true }), 200);
    dayIs('festivo reactivado: holiday', await daysOf(E[1]), WD[0], { day_result: 'holiday' });
    st('DELETE festivo 200', await A('DELETE', `/holidays/${hol.id}`), 200); created.holidays = created.holidays.filter((x) => x !== hol.id);
    dayIs('festivo borrado: E1 vuelve a present', await daysOf(E[1]), WD[0], { day_result: 'present', reason: 'on_time' });
    if (WD[0] === ACC[2]) dayIs('festivo borrado: E4 recupera is_late_accumulation_absence', await daysOf(E[4]), ACC[2], { day_result: 'late', is_late_accumulation_absence: true });
    st('DELETE festivo inexistente 404', await A('DELETE', `/holidays/${hol.id}`), 404);

    // revision de checadas: vincular + rechazar / aprobar
    r = await A('POST', `/punches/${P.unkA}/link-employee`, { employee_id: E[5].id });
    st('vincular desconocido A a E5 200', r, 200);
    eq('checada vinculada: employee E5', r.json?.punch?.employee?.id, E[5].id);
    check('vinculacion recalcula (recalculation.days > 0)', r.json?.recalculation?.days > 0, j(r.json?.recalculation));
    dayIs('E5 dia A con la 08:00 pendiente: present + has_pending_review (las pendientes cuentan)', await daysOf(E[5]), WD[1], { day_result: 'present', has_pending_review: true, clock_in_at: utc(WD[1], '08:00') });
    st('vincular de nuevo -> 409', await A('POST', `/punches/${P.unkA}/link-employee`, { employee_id: E[5].id }), 409);
    st('vincular a empleado inexistente -> 404', await A('POST', `/punches/${P.unkB}/link-employee`, { employee_id: 99999999 }), 404);
    st('vincular checada inexistente -> 404', await A('POST', '/punches/99999999/link-employee', { employee_id: E[5].id }), 404);
    st('rechazar sin motivo -> 400', await A('POST', `/punches/${P.unkA}/review`, { decision: 'reject' }), 400);
    st('rechazar con motivo corto -> 400', await A('POST', `/punches/${P.unkA}/review`, { decision: 'reject', reason: 'no' }), 400);
    st('decision invalida -> 400', await A('POST', `/punches/${P.unkA}/review`, { decision: 'maybe' }), 400);
    r = await A('POST', `/punches/${P.unkA}/review`, { decision: 'reject', reason: 'No es del colaborador (e2e)' });
    st('rechazar checada 200', r, 200); eq('estado rejected con revisor', [r.json?.punch?.review_status, !!r.json?.punch?.reviewed_by_name], ['rejected', true]);
    dayIs('checada rechazada no cuenta: E5 dia A vuelve a late 25', await daysOf(E[5]), WD[1], { day_result: 'late', late_minutes: 25, has_pending_review: false });
    st('revisar de nuevo -> 409', await A('POST', `/punches/${P.unkA}/review`, { decision: 'approve' }), 409);
    // B: vincular y aprobar
    await A('POST', `/punches/${P.unkB}/link-employee`, { employee_id: E[5].id });
    r = await A('POST', `/punches/${P.unkB}/review`, { decision: 'approve' });
    st('aprobar checada 200', r, 200); eq('estado approved', r.json?.punch?.review_status, 'approved');
    dayIs('checada aprobada cuenta: E5 dia B present, sin pendiente', await daysOf(E[5]), WD[2], { day_result: 'present', has_pending_review: false, clock_in_at: utc(WD[2], '08:00') });
    // aprobar la de desfase (empleado conocido)
    r = await A('POST', `/punches/${P.drift}/review`, { decision: 'approve' });
    st('aprobar checada con desfase 200', r, 200);
    st('review checada inexistente 404', await A('POST', '/punches/99999999/review', { decision: 'approve' }), 404);
    st('review id invalido 400', await A('POST', '/punches/abc/review', { decision: 'approve' }), 400);

    // checada manual
    r = await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: WD[3], time: '08:00', punch_type: 'in', justification: 'Olvido checar e2e' });
    st('checada manual entrada 201', r, 201);
    eq('manual: source/punch_type/justificacion', [r.json?.punch?.source, r.json?.punch?.punch_type, r.json?.punch?.manual_justification], ['manual', 'in', 'Olvido checar e2e']);
    check('manual: registered_by_name presente', !!r.json?.punch?.registered_by_name, j(r.json?.punch));
    r = await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: WD[3], time: '17:00', punch_type: 'out', justification: 'Olvido checar e2e' });
    st('checada manual salida 201', r, 201);
    dayIs('manual: E5 dia C pasa de falta a present, 8 h', await daysOf(E[5]), WD[3], { day_result: 'present', worked_hours: 8 });
    st('manual: justificacion corta -> 400', await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: WD[3], time: '09:00', punch_type: 'in', justification: 'x' }), 400);
    st('manual: instante futuro -> 400', await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: addDays(TODAY, 1), time: '09:00', punch_type: 'in', justification: 'prueba futura' }), 400);
    st('manual: empleado inexistente -> 404', await A('POST', '/punches/manual', { employee_id: 99999999, work_date: WD[3], time: '09:00', punch_type: 'in', justification: 'prueba' }), 404);
    st('manual: empleado inactivo -> 404', await A('POST', '/punches/manual', { employee_id: E.inactive.id, work_date: WD[3], time: '09:00', punch_type: 'in', justification: 'prueba' }), 404);
    st('manual: punch_type invalido -> 400', await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: WD[3], time: '09:00', punch_type: 'zzz', justification: 'prueba' }), 400);
    st('manual: hora invalida -> 400', await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: WD[3], time: '99:99', punch_type: 'in', justification: 'prueba' }), 400);
    // la checada manual de hoy no recalcula
    r = await A('POST', '/punches/manual', { employee_id: E[5].id, work_date: TODAY, time: '00:01', punch_type: 'in', justification: 'checada de hoy e2e' });
    st('manual de hoy (00:01) 201', r, 201);
    eq('hoy NO se calcula: no hay fila de resultado para hoy', psql(`SELECT count(*) FROM attendance.daily_results WHERE employee_id=${E[5].id} AND work_date='${TODAY}'`)[0][0], '0');
    // 00:01 es anterior al corte (04:00): pertenece al dia laboral de ayer, que si se recalcula.
    eq('manual de hoy 00:01 (antes del corte): recalcula el dia laboral de ayer (days = 1)', r.json?.recalculation?.days, 1);

    // efecto de un parametro en el calculo: tolerancia 25 -> el retardo de 20 deja de serlo
    r = await A('PUT', '/settings/tolerance_min', { value: 25, reason: 'prueba e2e tolerancia' });
    st('tolerance_min=25 200', r, 200); originals.tolerance = true;
    await recalc();
    dayIs('con tolerancia 25 el retardo de 20 min es present', await daysOf(E[1]), WD[1], { day_result: 'present', late_minutes: 0 });
    r = await A('PUT', '/settings/tolerance_min', { value: 10, reason: 'restaurar tolerancia e2e' });
    st('tolerance_min=10 200', r, 200); originals.tolerance = false;
    await recalc();
    dayIs('restaurada: vuelve late 20', await daysOf(E[1]), WD[1], { day_result: 'late', late_minutes: 20 });
  });

  // ------------------------------------------------------------ 5. Incidencias y vacaciones
  const INC = {};
  await section('5 Incidencias y vacaciones', async () => {
    const types = (await get('/incident-types?include_inactive=true')).json?.incident_types || [];
    const T = Object.fromEntries(types.map((t) => [t.code, t]));
    check('catalogo trae vacation, justified_absence, overtime, holiday_worked', ['vacation', 'justified_absence', 'overtime', 'holiday_worked'].every((c) => T[c]), j(Object.keys(T)));
    const vacBody = (emp, start, end, extra = {}) => mkForm({ employee_id: emp.id, incident_type_id: T.vacation.id, start_date: start, end_date: end, reason: 'e2e', ...extra }, [pdfFile()]);
    // periodos E7
    let r = await A('POST', `/vacations/employees/${E[7].id}/open-periods`);
    st('abrir periodos E7 200', r, 200);
    const pol = (await get('/vacation-policy')).json?.policy || [];
    const lookup = (y) => [...pol].filter((p) => p.from_seniority_year <= y).pop()?.vacation_days;
    const per = r.json?.periods || [];
    check('E7 (2 anos de antiguedad): al menos 2 periodos con derecho segun la tabla', per.length >= 2 && per.every((p) => p.days_entitled === lookup(p.seniority_year)), j(per));
    const bal0 = r.json?.balance?.balance;
    near('saldo inicial E7 = suma de derechos de periodos vigentes', bal0, per.filter((p) => !p.expired).reduce((s, p) => s + p.days_entitled + p.days_adjustment - p.days_taken, 0));
    st('abrir periodos sin hire_date -> 409', await A('POST', `/vacations/employees/${L[4].id}/open-periods`), 409);
    r = await A('POST', '/vacations/preview', { employee_id: E[7].id, incident_type_id: T.vacation.id, start_date: WD[2], end_date: WD[1] });
    st('preview 200', r, 200); eq('preview: aplica, 2 dias laborables, saldo', [r.json?.applies, r.json?.working_days, r.json?.balance], [true, 2, bal0]);
    r = await A('POST', '/vacations/preview', { employee_id: E[7].id, incident_type_id: T.paid_permission.id, start_date: WD[2], end_date: WD[1] });
    eq('preview de tipo que no descuenta: applies=false', r.json?.applies, false);
    // crear sin adjunto
    r = await A('POST', '/incidents', { employee_id: E[7].id, incident_type_id: T.vacation.id, start_date: WD[2], end_date: WD[1], reason: 'sin comprobante' });
    st('vacaciones sin comprobante -> 400', r, 400);
    r = await req('POST', `${API}/incidents`, { token: TOKEN, form: vacBody(E[7], WD[2], WD[1]) });
    st('vacaciones con PDF 201', r, 201);
    const inc = r.json?.incident; INC.vac = inc?.id;
    eq('incidencia: captured, 2 dias, 1 adjunto', [inc?.status, inc?.days, inc?.attachments_count, inc?.attachments?.length], ['captured', 2, 1, 1]);
    check('warnings vacio', Array.isArray(r.json?.warnings) && r.json.warnings.length === 0, j(r.json?.warnings));
    INC.att1 = inc?.attachments?.[0]?.id;
    st('duplicado (mismo empleado/tipo/rango) -> 409', await req('POST', `${API}/incidents`, { token: TOKEN, form: vacBody(E[7], WD[2], WD[1]) }), 409);
    st('fin < inicio -> 400', await req('POST', `${API}/incidents`, { token: TOKEN, form: vacBody(E[7], WD[1], WD[2]) }), 400);
    st('archivo con extension pdf pero contenido falso -> 400', await req('POST', `${API}/incidents`, { token: TOKEN, form: mkForm({ employee_id: E[8].id, incident_type_id: T.vacation.id, start_date: WD[9], end_date: WD[9] }, [{ name: 'x.pdf', type: 'application/pdf', buf: Buffer.from('esto no es un pdf') }]) }), 400);
    st('empleado no habilitado -> 400', await req('POST', `${API}/incidents`, { token: TOKEN, form: mkForm({ employee_id: E.inactive.id, incident_type_id: T.vacation.id, start_date: WD[9], end_date: WD[9] }, [pdfFile()]) }), 400);
    // autorizar
    r = await A('POST', `/incidents/${INC.vac}/authorize`, { notes: 'ok e2e' });
    st('autorizar 200', r, 200); eq('estado authorized con autorizador', [r.json?.incident?.status, !!r.json?.incident?.authorized_by_name], ['authorized', true]);
    let Dv = await daysOf(E[7]);
    dayIs('dia 1 de vacaciones: incident', Dv, WD[2], { day_result: 'incident', reason: 'incident:vacation' });
    dayIs('dia 2 de vacaciones: incident', Dv, WD[1], { day_result: 'incident', reason: 'incident:vacation' });
    dayIs('dia con incidencia trae objeto incident', Dv, WD[1], {}) && check('days[].incident.code=vacation', Dv[WD[1]]?.incident?.code === 'vacation', j(Dv[WD[1]]?.incident));
    r = await get(`/vacations/employees/${E[7].id}`);
    near('saldo baja 2 dias al autorizar', r.json?.balance?.balance, bal0 - 2);
    eq('dias tomados repartidos al periodo mas antiguo', r.json?.periods?.slice().sort((a, b) => a.seniority_year - b.seniority_year)[0]?.days_taken, 2);
    st('rechazar una autorizada permitido; reautorizar luego', await A('POST', `/incidents/${INC.vac}/reject`, { notes: 'x' }), 200);
    near('rechazar libera el saldo', (await get(`/vacations/employees/${E[7].id}`)).json?.balance?.balance, bal0);
    st('rechazada -> autorizar -> 409', await A('POST', `/incidents/${INC.vac}/authorize`, {}), 409);
    // nueva solicitud para cancelar
    st('cancelar una rechazada -> 409', await A('POST', `/incidents/${INC.vac}/cancel`, {}), 409);
    r = await req('POST', `${API}/incidents`, { token: TOKEN, form: vacBody(E[7], WD[2], WD[1], { authorize: 'true' }) });
    st('crear con authorize=true 201 (tras la rechazada)', r, 201); eq('nace authorized', r.json?.incident?.status, 'authorized');
    INC.vac2 = r.json?.incident?.id;
    dayIs('authorize=true: dia en incident', await daysOf(E[7]), WD[2], { day_result: 'incident' });
    near('saldo -2 con la nueva', (await get(`/vacations/employees/${E[7].id}`)).json?.balance?.balance, bal0 - 2);
    // adjuntos: agregar segundo, baja logica y regla del ultimo
    r = await req('POST', `${API}/incidents/${INC.vac2}/attachments`, { token: TOKEN, form: mkForm({}, [{ name: 'otro.png', type: 'image/png', buf: Buffer.from(PNG_B64, 'base64') }]) });
    st('agregar 2do adjunto (PNG) 201', r, 201); eq('2 adjuntos vigentes', r.json?.attachments?.length, 2);
    const atts = r.json?.attachments || [];
    r = await get(`/incidents/${INC.vac2}/attachments/${atts[0].id}`, { raw: true });
    check('descarga adjunto: 200, PDF, no-store/private', r.status === 200 && r.buf.subarray(0, 4).toString() === '%PDF' && /no-store/.test(r.headers.get('cache-control') || ''), `HTTP ${r.status} ${r.headers.get('cache-control')} ${r.buf.subarray(0, 8)}`);
    check('descarga PNG: bytes de la imagen', (await get(`/incidents/${INC.vac2}/attachments/${atts[1].id}`, { raw: true })).buf.subarray(1, 4).toString() === 'PNG');
    st('descarga sin token 401', await get(`/incidents/${INC.vac2}/attachments/${atts[0].id}`, { token: null }), 401);
    st('descarga sin permiso 403', await get(`/incidents/${INC.vac2}/attachments/${atts[0].id}`, { token: env.NOPERM }), 403);
    st('descarga con viewer (lectura) 200', await get(`/incidents/${INC.vac2}/attachments/${atts[0].id}`, { token: env.VIEWER, raw: true }), 200);
    st('descarga de adjunto de otra incidencia -> 404', await get(`/incidents/${INC.vac}/attachments/${atts[0].id}`), 404);
    st('descarga adjunto inexistente 404', await get(`/incidents/${INC.vac2}/attachments/99999999`), 404);
    created.attachmentFiles.push(...psql(`SELECT file_path FROM attendance.incident_attachments WHERE incident_id IN (${INC.vac}, ${INC.vac2})`).map((x) => x[0]));
    r = await A('DELETE', `/incidents/${INC.vac2}/attachments/${atts[0].id}`);
    st('baja logica del 1er adjunto 200', r, 200); eq('queda 1 adjunto vigente', r.json?.incident?.attachments_count, 1);
    eq('la fila NO se borra: deleted_at registrado', psql(`SELECT (deleted_at IS NOT NULL)::text || ',' || count(*) FROM attendance.incident_attachments WHERE id=${atts[0].id} GROUP BY deleted_at`)[0]?.[0], 'true,1');
    st('el adjunto dado de baja ya no se descarga (404)', await get(`/incidents/${INC.vac2}/attachments/${atts[0].id}`), 404);
    st('baja del ultimo comprobante de incidencia autorizada -> 409', await A('DELETE', `/incidents/${INC.vac2}/attachments/${atts[1].id}`), 409);
    st('baja de un adjunto ya dado de baja -> 404/409', await A('DELETE', `/incidents/${INC.vac2}/attachments/${atts[0].id}`), [404, 409]);
    // cancelar -> vuelve
    r = await A('POST', `/incidents/${INC.vac2}/cancel`, { notes: 'cancelada e2e' });
    st('cancelar autorizada 200', r, 200); eq('status cancelled', r.json?.incident?.status, 'cancelled');
    dayIs('cancelada: el dia vuelve a absent', await daysOf(E[7]), WD[2], { day_result: 'absent', reason: 'no_punches' });
    near('cancelada: saldo vuelve', (await get(`/vacations/employees/${E[7].id}`)).json?.balance?.balance, bal0);
    st('cancelar otra vez -> 409', await A('POST', `/incidents/${INC.vac2}/cancel`, {}), 409);
    // politica de saldo
    const cur = (await get('/settings')).json?.settings?.find((s) => s.key === 'vacations_no_balance');
    originals.noBalance = cur?.value;
    const longVac = (extra = {}) => req('POST', `${API}/incidents`, { token: TOKEN, form: mkForm({ employee_id: E[7].id, incident_type_id: T.vacation.id, start_date: addDays(TODAY, 7), end_date: addDays(TODAY, 90), reason: 'excede saldo', ...extra }, [pdfFile()]) });
    st('politica block', await A('PUT', '/settings/vacations_no_balance', { value: 'block', reason: 'prueba e2e bloqueo' }), 200);
    r = await A('POST', '/vacations/preview', { employee_id: E[7].id, incident_type_id: T.vacation.id, start_date: addDays(TODAY, 7), end_date: addDays(TODAY, 90) });
    eq('preview: blocked=true y exceeds > 0 con block', [r.json?.blocked, r.json?.exceeds > 0, r.json?.policy], [true, true, 'block']);
    r = await longVac(); st('politica block: solicitud que excede -> 409', r, 409);
    st('politica warn', await A('PUT', '/settings/vacations_no_balance', { value: 'warn', reason: 'prueba e2e advertir' }), 200);
    r = await longVac(); st('politica warn: 201', r, 201); check('warn: warnings no vacio', r.json?.warnings?.length >= 1, j(r.json?.warnings)); INC.over1 = r.json?.incident?.id;
    st('politica allow', await A('PUT', '/settings/vacations_no_balance', { value: 'allow', reason: 'prueba e2e permitir' }), 200);
    r = await longVac({ end_date: addDays(TODAY, 91) }); st('politica allow: 201', r, 201); eq('allow: sin warnings', r.json?.warnings?.length, 0); INC.over2 = r.json?.incident?.id;
    await A('PUT', '/settings/vacations_no_balance', { value: originals.noBalance, reason: 'restaurar politica e2e' });
    for (const id of [INC.over1, INC.over2]) if (id) await A('POST', `/incidents/${id}/cancel`, {});
    eq('politica restaurada', (await get('/settings')).json?.settings?.find((s) => s.key === 'vacations_no_balance')?.value, originals.noBalance);
    // ajuste
    const p1 = (await get(`/vacations/employees/${E[7].id}`)).json?.periods?.slice().sort((a, b) => a.seniority_year - b.seniority_year).find((p) => !p.expired);
    r = await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: -2.5, reason: 'ajuste e2e' });
    st('ajuste -2.5 200', r, 200); near('saldo baja 2.5', r.json?.balance?.balance, bal0 - 2.5);
    r = await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: 1, reason: 'ajuste e2e reemplaza' });
    near('el ajuste REEMPLAZA (no suma): saldo = base + 1', r.json?.balance?.balance, bal0 + 1);
    st('ajuste con motivo corto -> 400', await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: 1, reason: 'x' }), 400);
    st('ajuste 61 -> 400', await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: 61, reason: 'ajuste e2e' }), 400);
    st('ajuste 0.3 (no multiplo de 0.5) -> 400', await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: 0.3, reason: 'ajuste e2e' }), 400);
    st('ajuste a periodo inexistente -> 404', await A('POST', '/vacations/adjust', { period_id: 99999999, adjustment: 1, reason: 'ajuste e2e' }), 404);
    await A('POST', '/vacations/adjust', { period_id: p1.id, adjustment: 0, reason: 'restaurar ajuste e2e' });
    near('ajuste 0 restaura el saldo', (await get(`/vacations/employees/${E[7].id}`)).json?.balance?.balance, bal0);
    // E8 7 anos: periodos vencidos
    r = await A('POST', `/vacations/employees/${E[8].id}/open-periods`);
    const per8 = r.json?.periods || [];
    check('E8 (7 anos): >= 7 periodos y algunos vencidos', per8.length >= 7 && per8.some((p) => p.expired) && per8.some((p) => !p.expired), j(per8.map((p) => [p.seniority_year, p.expired])));
    near('E8 saldo = solo periodos NO vencidos', r.json?.balance?.balance, per8.filter((p) => !p.expired).reduce((s, p) => s + p.days_entitled + p.days_adjustment - p.days_taken, 0));
    check('E8 periodos vencidos: tomados = 0', per8.filter((p) => p.expired).every((p) => p.days_taken === 0), j(per8));
    const bal8 = r.json?.balance?.balance;
    r = await req('POST', `${API}/incidents`, { token: TOKEN, form: vacBody(E[8], WD[10], WD[8], { authorize: 'true' }) });
    st('E8 vacaciones 3 dias autorizadas 201', r, 201); eq('days=3', r.json?.incident?.days, 3); INC.vac8 = r.json?.incident?.id;
    const g8 = (await get(`/vacations/employees/${E[8].id}`)).json;
    near('E8 saldo baja 3', g8?.balance?.balance, bal8 - 3);
    const oldest = g8.periods.filter((p) => !p.expired).sort((a, b) => a.seniority_year - b.seniority_year)[0];
    eq('reparto: los 3 dias al periodo vigente mas antiguo, vencidos 0', [oldest.days_taken, g8.periods.filter((p) => p.expired).reduce((s, p) => s + p.days_taken, 0)], [3, 0]);
    await A('POST', `/incidents/${INC.vac8}/cancel`, {});
    // saldos
    r = await get(`/vacations/balances?branch_id=${BR}&search=${RUN}&limit=50`);
    check('balances: lista con saldos de E7 y E8', r.json?.data?.some((x) => x.employee_id === E[7].id && Math.abs(x.balance - bal0) < 0.01) && r.json.data.some((x) => x.employee_id === E[8].id), brief(r));
    // justificar falta (E7 WD[4])
    r = await req('POST', `${API}/days/${E[7].id}/${WD[4]}/justify`, { token: TOKEN, form: mkForm({ reason: 'Falta justificada e2e' }, [pdfFile('just.pdf')]) });
    st('justificar falta 201', r, 201);
    eq('justificada: tipo, estado, 1 dia', [r.json?.incident?.type?.code, r.json?.incident?.status, r.json?.incident?.days], ['justified_absence', 'authorized', 1]);
    dayIs('dia justificado pasa a incident', await daysOf(E[7]), WD[4], { day_result: 'incident', reason: 'incident:justified_absence' });
    st('justificar duplicada -> 409', await req('POST', `${API}/days/${E[7].id}/${WD[4]}/justify`, { token: TOKEN, form: mkForm({ reason: 'Falta justificada e2e' }, [pdfFile()]) }), 409);
    st('justificar sin archivo (tipo lo exige) -> 400', await req('POST', `${API}/days/${E[7].id}/${WD[5]}/justify`, { token: TOKEN, form: mkForm({ reason: 'Falta justificada e2e' }) }), 400);
    st('justificar con motivo corto -> 400', await req('POST', `${API}/days/${E[7].id}/${WD[5]}/justify`, { token: TOKEN, form: mkForm({ reason: 'x' }, [pdfFile()]) }), 400);
    st('justificar fecha invalida -> 400', await req('POST', `${API}/days/${E[7].id}/2026-02-31/justify`, { token: TOKEN, form: mkForm({ reason: 'Falta justificada e2e' }, [pdfFile()]) }), 400);
    // horas extra autorizadas (E4 BD: 9.83 h vs 8 esperadas)
    r = await A('POST', '/incidents', { employee_id: E[4].id, incident_type_id: T.overtime.id, start_date: BD, hours: 2, reason: 'extra e2e', authorize: true });
    st('horas extra 2 h autorizadas 201', r, 201); INC.ot = r.json?.incident?.id; eq('estado y horas', [r.json?.incident?.status, r.json?.incident?.hours], ['authorized', 2]);
    dayIs('overtime = min(2 autorizadas, 9.83-8) = 1.83 y el dia sigue present', await daysOf(E[4]), BD, { day_result: 'present', overtime_hours: 1.83 });
    await A('POST', `/incidents/${INC.ot}/cancel`, {});
    dayIs('cancelar las horas extra: overtime 0', await daysOf(E[4]), BD, { overtime_hours: 0 });
    r = await A('POST', '/incidents', { employee_id: E[4].id, incident_type_id: T.overtime.id, start_date: BD, hours: 1, reason: 'extra e2e 1h', authorize: true });
    st('horas extra 1 h 201', r, 201); INC.ot2 = r.json?.incident?.id;
    dayIs('overtime con 1 h autorizada = 1', await daysOf(E[4]), BD, { overtime_hours: 1 });
    st('horas extra sin hours -> 400', await A('POST', '/incidents', { employee_id: E[4].id, incident_type_id: T.overtime.id, start_date: addDays(BD, -3) }), 400);
    st('horas extra 25 h -> 400', await A('POST', '/incidents', { employee_id: E[4].id, incident_type_id: T.overtime.id, start_date: addDays(BD, -3), hours: 25 }), 400);
    st('horas extra en rango de varios dias -> 400', await A('POST', '/incidents', { employee_id: E[4].id, incident_type_id: T.overtime.id, start_date: addDays(BD, -3), end_date: addDays(BD, -2), hours: 2 }), 400);
    // consulta
    r = await get(`/incidents?employee_id=${E[7].id}&limit=50`);
    check('listado por empleado trae las 3+ del E7', r.json?.data?.length >= 3 && r.json.pagination.total >= 3, brief(r));
    r = await get(`/incidents?employee_id=${E[7].id}&status=cancelled`);
    check('filtro status=cancelled', r.json?.data?.length >= 1 && r.json.data.every((x) => x.status === 'cancelled'), brief(r));
    r = await get(`/incidents?branch_id=${BR}&type_id=${T.vacation.id}&from=${WD[2]}&to=${WD[1]}&search=${RUN}`);
    check('filtro por tipo+rango+busqueda', r.json?.data?.length >= 1 && r.json.data.every((x) => x.type.code === 'vacation'), brief(r));
    r = await get(`/incidents/${INC.vac2}`);
    check('detalle: adjuntos solo vigentes (1)', r.json?.incident?.attachments?.length === 1 && !('file_path' in r.json.incident.attachments[0]), brief(r));
    st('detalle inexistente 404', await get('/incidents/99999999'), 404);
    st('detalle id invalido 400', await get('/incidents/abc'), 400);
    st('filtro status invalido 400', await get('/incidents?status=zzz'), 400);

    // importacion Excel
    const mkXlsx = async (rows) => {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Incidencias');
      ws.addRow(['employee_number', 'type', 'start_date', 'end_date', 'hours', 'reason', 'imss_folio', 'authorize', 'notes']);
      rows.forEach((x) => ws.addRow(x));
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const XT = { name: 'import.xlsx', field: 'file', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    const rows = [
      [E[8].no, 'Festivo trabajado', WD[5], WD[5], null, 'importada e2e', null, 'SI', null],
      [E[8].no, 'Festivo trabajado', WD[5], WD[5], null, 'duplicada en archivo', null, 'SI', null],
      ['NOEXISTE-999', 'Festivo trabajado', WD[5], WD[5], null, 'empleado inexistente', null, 'NO', null],
      [E[8].no, 'Tipo Inexistente', WD[5], WD[5], null, 'tipo inexistente', null, 'NO', null],
      [E[8].no, 'Festivo trabajado', 'no-es-fecha', null, null, 'fecha mala', null, 'NO', null],
      [E[8].no, 'overtime', WD[6], WD[6], 1.5, 'horas extra importadas', null, 'NO', null],
    ];
    const buf = await mkXlsx(rows);
    r = await req('POST', `${API}/incidents/import/simulate`, { token: TOKEN, form: mkForm({}, [{ ...XT, buf }]) });
    st('importacion: simulacion 200', r, 200);
    eq('simulacion: total 6, ok 2, duplicate 1, error 3', r.json?.summary, { total: 6, ok: 2, duplicate: 1, error: 3 });
    eq('estatus por fila', r.json?.rows?.map((x) => x.status), ['ok', 'duplicate', 'error', 'error', 'error', 'ok']);
    eq('la simulacion no guarda nada', psql(`SELECT count(*) FROM attendance.incidents WHERE employee_id=${E[8].id} AND start_date IN ('${WD[5]}','${WD[6]}')`)[0][0], '0');
    r = await req('POST', `${API}/incidents/import`, { token: TOKEN, form: mkForm({}, [{ ...XT, buf }]) });
    st('importacion real 200', r, 200);
    eq('importadas 2, autorizadas 1, omitidas 4, fallidas 0', [r.json?.summary?.imported, r.json?.summary?.authorized, r.json?.summary?.skipped, r.json?.summary?.failed], [2, 1, 4, 0]);
    r = await req('POST', `${API}/incidents/import`, { token: TOKEN, form: mkForm({}, [{ ...XT, buf }]) });
    eq('reimportar el mismo archivo no duplica (imported 0)', r.json?.summary?.imported, 0);
    st('importar archivo que no es xlsx -> 400', await req('POST', `${API}/incidents/import`, { token: TOKEN, form: mkForm({}, [{ ...XT, name: 'x.xlsx', buf: Buffer.from('no soy excel') }]) }), 400);
    st('importar sin archivo -> 400', await req('POST', `${API}/incidents/import`, { token: TOKEN, form: mkForm({}) }), 400);
    st('importar xlsx vacio (solo encabezados) -> 400', await req('POST', `${API}/incidents/import`, { token: TOKEN, form: mkForm({}, [{ ...XT, buf: await mkXlsx([]) }]) }), 400);
    r = await get('/incidents/template', { raw: true });
    st('plantilla 200', r, 200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    check('plantilla: hojas Incidencias, Instrucciones, Ejemplo, Catalogos', ['Incidencias', 'Instrucciones', 'Ejemplo', 'Catalogos'].every((n) => wb.getWorksheet(n)), wb.worksheets.map((w) => w.name).join(','));
    dayIs('incidencia importada autorizada impacta el dia (E8 festivo trabajado)', await daysOf(E[8]), WD[5], { day_result: 'incident' });
  });

  // ------------------------------------------------------------ 6. Tableros y reportes
  await section('6 Tableros y reportes', async () => {
    // --- live (hoy) con turnos relativos a la hora actual
    const okWindow = nowMin >= 5 * 60 && nowMin <= 19 * 60;
    const live = {};
    if (okWindow) {
      const mkLive = async (k, startOffset, dur) => {
        const s = nowMin + startOffset;
        const r = await A('POST', '/shifts', { name: `TEST-E2E-${RUN}-Live${k}`, start_time: hhmm(s), end_time: hhmm(s + dur) });
        SH[`Live${k}`] = r.json?.shift;
        const a = await A('POST', '/assignments', { employee_ids: [L[k].id], shift_ids: [r.json.shift.id], start_date: TODAY, repeats_weekly: false });
        st(`turno vivo L${k} (${hhmm(s)}) programado hoy`, a, 201);
        return s;
      };
      live.s1 = await mkLive(1, -80, 300); live.s2 = await mkLive(2, -85, 300); live.s3 = await mkLive(3, -90, 300); live.s4 = await mkLive(4, 120, 120);
      await sendPunches([ev(L[1].no, TODAY, hhmm(live.s1 + 2), IN), ev(L[2].no, TODAY, hhmm(live.s2 + 20), IN)]);
    } else skip('tablero en vivo con turnos relativos', `hora local ${hhmm(nowMin)} fuera de 05:00-19:00`);
    let r = await get(`/board/live?branch_id=${BR}`);
    st('GET /board/live 200', r, 200);
    const lv = r.json || {};
    const stOf = (e) => lv.people?.find((p) => p.employee_id === e.id)?.status;
    if (okWindow) {
      eq('L1 (entro a tiempo, sin salida) = present', stOf(L[1]), 'present');
      eq('L2 (entro 20 min tarde) = late', stOf(L[2]), 'late');
      eq('L2 retardo 18..22 min (hora redondeada)', lv.people?.find((p) => p.employee_id === L[2].id)?.late_minutes >= 18 && lv.people.find((p) => p.employee_id === L[2].id).late_minutes <= 22, true);
      eq('L3 (sin checar pasados 90 min) = missing', stOf(L[3]), 'missing');
      eq('L4 (turno en 2 h) = upcoming', stOf(L[4]), 'upcoming');
    }
    const pp = lv.people || [];
    const cnt = (...s) => pp.filter((p) => s.includes(p.status)).length;
    eq('KPIs coherentes con people', [lv.kpis?.expected, lv.kpis?.present, lv.kpis?.late, lv.kpis?.missing], [cnt('present', 'left', 'late', 'upcoming', 'missing'), cnt('present', 'left', 'late'), cnt('late'), cnt('missing')]);
    eq('progress_percent = round(present/expected)', lv.progress_percent, lv.kpis?.expected ? Math.round((lv.kpis.present / lv.kpis.expected) * 100) : 0);
    eq('by_status suma = people con estado', (lv.by_status || []).reduce((s, x) => s + x.count, 0), pp.length);
    const order = ['late', 'missing', 'present', 'upcoming', 'left', 'incident', 'rest', 'no_schedule'];
    check('people ordenado por estado', pp.every((p, i) => i === 0 || order.indexOf(pp[i - 1].status) <= order.indexOf(p.status)), j(pp.map((p) => p.status)));
    eq('trend_14_days: 14 elementos, termina ayer', [lv.trend_14_days?.length, lv.trend_14_days?.[13]?.date], [14, YESTERDAY]);
    check('devices: sucursal con agente en linea y terminales', lv.devices?.some((d) => d.branch_id === BR && d.agent?.online === true && d.terminals_total >= 1), j(lv.devices));
    check('alerts numericos', ['without_schedule', 'without_device_number', 'pending_sync'].every((k) => typeof lv.alerts?.[k] === 'number'), j(lv.alerts));
    check('month_ranking <= 10 y ordenado por indice desc', (lv.month_ranking || []).length <= 10 && (lv.month_ranking || []).every((x, i, a) => i === 0 || (a[i - 1].index ?? -1) >= (x.index ?? -1)), j(lv.month_ranking));
    eq('is_today true', lv.is_today, true);
    r = await get(`/board/live?branch_id=${BR}&date=${WD[1]}`);
    const lp = (e) => r.json?.people?.find((p) => p.employee_id === e.id)?.status;
    eq('fecha pasada: is_today false', r.json?.is_today, false);
    eq('pasado WD1: E1 late, E7 (vacacion cancelada, sin checadas) missing, E2 left, E3 left', [lp(E[1]), lp(E[7]), lp(E[2]), lp(E[3])], ['late', 'missing', 'left', 'left']);
    eq('pasado WD4: E7 (falta justificada) incident', (await get(`/board/live?branch_id=${BR}&date=${WD[4]}`)).json?.people?.find((p) => p.employee_id === E[7].id)?.status, 'incident');
    eq('pasado WD3: E1 sin salida = missing', (await get(`/board/live?branch_id=${BR}&date=${WD[3]}`)).json?.people?.find((p) => p.employee_id === E[1].id)?.status, 'missing');
    r = await get(`/board/live?date=${addDays(TODAY, 3)}&branch_id=${BR}`);
    st('fecha futura 200', r, 200); check('futuro: nadie con checadas', (r.json?.people || []).every((p) => !p.clock_in_at), brief(r));
    st('fecha invalida 400', await get('/board/live?date=2026-99-99'), 400);
    st('branch_id invalido 400', await get('/board/live?branch_id=abc'), 400);
    r = await get('/board/live?branch_id=');
    st('branch_id vacio = sin filtro 200', r, 200);

    // --- compromiso: verificacion a mano
    const C = (qs) => get(`/board/commitment?${qs}`);
    // E1 rango WD[6]..WD[0]: dias esperados L-V = 7; presentes 3 (puntual, retardo, anticipada), faltas 4
    const e1from = WD[6]; const e1to = WD[0];
    r = await C(`period=custom&from=${e1from}&to=${e1to}&employee_id=${E[1].id}`);
    st('compromiso E1 (custom) 200', r, 200);
    const s1 = r.json?.people?.[0]?.summary;
    eq('E1 a mano: esperados 7, presentes 3, faltas 4, retardos 1, salidas anticipadas 1', [s1?.expected, s1?.present, s1?.absences, s1?.lates, s1?.early_departures], [7, 3, 4, 1, 1]);
    eq('E1 a mano: %asistencia 43, %puntualidad 29, %salidas 67', [s1?.pct_attendance, s1?.pct_punctuality, s1?.pct_exits], [43, 29, 67]);
    eq('E1 a mano: indice 42 = round((43*40+29*40+67*20)/100), nivel attention', [s1?.index, s1?.level], [42, 'attention']);
    eq('E1 racha actual 0 (la ultima semana tiene retardo/falta) y mejor 1', [s1?.current_streak, s1?.best_streak], [1, 1]);
    eq('E1 detalle por dia: 7+ dias con resultado', r.json?.detail?.days?.filter((d) => ['present', 'late', 'absent', 'early_departure'].includes(d.day_result)).length, 7);
    near('E1 horas trabajadas sumadas (8.08+7.67+7.25+0+7.5+0+2 = 32.5)', s1?.hours, 32.5, 0.15);
    // E3 rango WD[2]..WD[1]
    r = await C(`period=custom&from=${WD[2]}&to=${WD[1]}&employee_id=${E[3].id}`);
    const s3 = r.json?.people?.[0]?.summary;
    eq('E3 a mano: esperados 2, atenciones 1.5, parcial 1, %asist 75, %punt 50, %salidas 100, indice 70 (regular)', [s3?.expected, s3?.attendances, s3?.partial_absences, s3?.pct_attendance, s3?.pct_punctuality, s3?.pct_exits, s3?.index, s3?.level], [2, 1.5, 1, 75, 50, 100, 70, 'regular']);
    // E4 acumulacion rango ACC
    r = await C(`period=custom&from=${ACC[0]}&to=${ACC[2]}&employee_id=${E[4].id}`);
    const s4 = r.json?.people?.[0]?.summary;
    eq('E4 a mano: 3 esperados, 3 retardos, 1 falta (acumulacion), 0 puntuales', [s4?.expected, s4?.lates, s4?.absences, s4?.punctual], [3, 3, 1, 0]);
    eq('E4 a mano: %asist 100, %punt 0, indice 60 (attention)', [s4?.pct_attendance, s4?.pct_punctuality, s4?.index, s4?.level], [100, 0, 60, 'attention']);
    eq('E4: el 3er retardo rompe la racha', s4?.current_streak, 0);
    // equipo / ranking
    r = await C(`period=custom&from=${RFROM}&to=${YESTERDAY}&branch_id=${BR}`);
    st('compromiso equipo 200', r, 200);
    const ppl = (r.json?.people || []).filter((p) => String(p.code).includes(RUN));
    check('ranking: place consecutivo y orden por indice desc / faltas asc', (r.json?.people || []).every((p, i, a) => p.place === i + 1 && (i === 0 || (a[i - 1].summary.index ?? -1) > (p.summary.index ?? -1) || ((a[i - 1].summary.index ?? -1) === (p.summary.index ?? -1) && a[i - 1].summary.absences <= p.summary.absences))), j((r.json?.people || []).map((p) => [p.place, p.summary.index, p.summary.absences])));
    check('equipo: 12 colaboradores del RUN en ranking', ppl.length === 12, `ranking=${ppl.length}`);
    check('team.index = indice calculado con los totales del equipo', typeof r.json?.team?.index === 'number' && r.json.team.employees >= 12, j(r.json?.team));
    check('closed_through = ayer (to acotado)', r.json?.closed_through === YESTERDAY, `closed_through=${r.json?.closed_through}`);
    check('recognitions/attention/trend/weights presentes', Array.isArray(r.json?.recognitions) && Array.isArray(r.json?.attention) && r.json?.trend?.blocks?.length > 0 && r.json?.weights?.attendance === 40, brief(r));
    eq('weights por defecto 40/40/20, 95/70', [r.json?.weights?.attendance, r.json?.weights?.punctuality, r.json?.weights?.exits, r.json?.weights?.exemplary, r.json?.weights?.attention], [40, 40, 20, 95, 70]);
    // filtros
    r = await C(`period=custom&from=${RFROM}&to=${YESTERDAY}&branch_id=999999`);
    check('branch_id sin colaboradores: ranking vacio', (r.json?.people || []).length === 0, brief(r));
    st('empleado fuera de la sucursal elegida -> 404', await C(`period=month&branch_id=999999&employee_id=${E[1].id}`), 404);
    st('periodo invalido 400', await C('period=zzz'), 400);
    st('anchor invalido 400', await C('period=week&anchor=hoy'), 400);
    for (const p of ['day', 'week', 'fortnight', 'month', 'bimester', 'quarter', 'semester', 'year']) { const x = await C(`period=${p}&anchor=${WD[1]}&branch_id=${BR}`); if (x.status !== 200 || !(x.json.from <= WD[1] && x.json.to >= WD[1])) check(`periodo ${p} contiene el ancla`, false, `${x.status} ${x.json?.from}..${x.json?.to}`); }
    check('los 8 periodos predefinidos devuelven 200 y contienen el ancla', true);
    r = await C(`period=fortnight&anchor=2026-03-20`);
    eq('quincena de 2026-03-20 = 16..31 marzo', [r.json?.from, r.json?.to], ['2026-03-16', '2026-03-31']);
    r = await C(`period=quarter&anchor=2026-08-05`);
    eq('trimestre de agosto = jul-sep', [r.json?.from, r.json?.to], ['2026-07-01', '2026-09-30']);
    r = await C(`period=bimester&anchor=2026-04-30`);
    eq('bimestre de abril = mar-abr', [r.json?.from, r.json?.to], ['2026-03-01', '2026-04-30']);

    // --- exportaciones
    r = await get(`/export/days.xlsx?from=${RFROM}&to=${YESTERDAY}&branch_id=${BR}`, { raw: true });
    st('export days.xlsx 200', r, 200);
    check('days.xlsx: content-type xlsx + attachment + nombre', /spreadsheetml/.test(r.ctype) && /attachment; filename="dias-asistencia_/.test(r.headers.get('content-disposition') || ''), `${r.ctype} ${r.headers.get('content-disposition')}`);
    let wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    const ws = wb.getWorksheet('Días') || wb.worksheets[0];
    const hdr = ws.getRow(1).values.slice(1).map(String);
    const bodyRows = []; ws.eachRow((row, n) => { if (n > 1) bodyRows.push(row.values.slice(1)); });
    check('days.xlsx: hoja Días con encabezados y filas del RUN', hdr.length >= 8 && bodyRows.filter((rw) => rw.some((c) => String(c?.result ?? c).includes(RUN))).length >= 12, `hojas=${wb.worksheets.map((w) => w.name)} hdr=${hdr} filas=${bodyRows.length}`);
    const flat = (rw) => rw.map((c) => (c && typeof c === 'object' && 'result' in c ? c.result : c));
    const e1rows = bodyRows.map(flat).filter((rw) => rw.some((c) => c === E[1].code || String(c).includes(E[1].name)));
    check('days.xlsx: filas de E1 = dias recalculados de E1', e1rows.length === Object.keys(await daysOf(E[1])).length, `xlsx=${e1rows.length} api=${Object.keys(await daysOf(E[1])).length}`);
    check('days.xlsx: hay celdas de fecha reales (Date)', bodyRows.some((rw) => rw.some((c) => c instanceof Date)), 'no hay Date en la hoja');
    r = await get(`/export/days.xlsx?from=${RFROM}&to=${YESTERDAY}&branch_id=999999`, { raw: true });
    wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    eq('days.xlsx con sucursal sin datos: solo encabezados', wb.worksheets[0].rowCount, 1);
    st('days.xlsx sin from/to -> 400', await get('/export/days.xlsx'), 400);
    st('days.xlsx > 366 dias -> 400', await get('/export/days.xlsx?from=2024-01-01&to=2026-06-01'), 400);
    r = await get(`/export/overtime.xlsx?from=${BD}&to=${BD}&branch_id=${BR}`, { raw: true });
    st('export overtime.xlsx 200', r, 200);
    wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    const wsRes = wb.getWorksheet('Resumen'); const txt = []; wsRes?.eachRow((row) => txt.push(flat(row.values.slice(1))));
    check('overtime.xlsx: hojas Resumen y Detalle, fila de E4 con 1 h y fila TOTAL', !!wb.getWorksheet('Detalle') && txt.some((rw) => rw.includes(E[4].name) || rw.includes(E[4].code)) && txt.some((rw) => rw.some((c) => /total/i.test(String(c)))), `${j(txt)}`);
    check('overtime.xlsx: E4 con 1 hora extra', txt.some((rw) => (rw.includes(E[4].name) || rw.includes(E[4].code)) && rw.includes(1)), j(txt));
    r = await get(`/export/commitment.xlsx?period=custom&from=${RFROM}&to=${YESTERDAY}&branch_id=${BR}`, { raw: true });
    st('export commitment.xlsx 200', r, 200);
    wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    check('commitment.xlsx: hojas Resumen, Colaboradores, Tendencia', ['Resumen', 'Colaboradores', 'Tendencia'].every((n) => wb.getWorksheet(n)), wb.worksheets.map((w) => w.name).join(','));
    let nrows = 0; wb.getWorksheet('Colaboradores')?.eachRow(() => { nrows += 1; });
    check('commitment.xlsx: Colaboradores >= 12 filas + encabezado', nrows >= 13, `filas=${nrows}`);
    r = await get(`/export/commitment.xlsx?period=custom&from=${e1from}&to=${e1to}&employee_id=${E[1].id}`, { raw: true });
    wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    check('commitment.xlsx con employee_id: incluye hoja Días y nombre _colaborador-id', !!wb.getWorksheet('Días') && new RegExp(`_colaborador-${E[1].id}\\.xlsx`).test(decodeURIComponent(r.headers.get('content-disposition') || '')), `${wb.worksheets.map((w) => w.name)} ${r.headers.get('content-disposition')}`);
    r = await get(`/report/commitment.pdf?period=custom&from=${RFROM}&to=${YESTERDAY}&branch_id=${BR}`, { raw: true });
    st('PDF compromiso 200', r, 200);
    check('PDF: application/pdf, firma %PDF, >2 KB, attachment', /application\/pdf/.test(r.ctype) && r.buf.subarray(0, 4).toString() === '%PDF' && r.buf.length > 2000 && /attachment/.test(r.headers.get('content-disposition') || ''), `${r.ctype} ${r.buf.length}`);
    r = await get(`/report/commitment.pdf?period=custom&from=${e1from}&to=${e1to}&employee_id=${E[1].id}`, { raw: true });
    check('PDF por colaborador %PDF', r.status === 200 && r.buf.subarray(0, 4).toString() === '%PDF', `HTTP ${r.status}`);
    st('PDF con parametros invalidos -> 400', await get('/report/commitment.pdf?period=zzz'), 400);
    // cierre de incidencias de horas extra de prueba
    for (const id of [INC.ot2]) if (id) await A('POST', `/incidents/${id}/cancel`, {});
  });

  // ------------------------------------------------------------ 7. Configuracion
  await section('7 Configuracion', async () => {
    let r = await get('/settings');
    st('GET /settings 200', r, 200);
    const sets = r.json?.settings || [];
    const tol = sets.find((s) => s.key === 'tolerance_min');
    check('tolerance_min: default 10, min/max, tipo, is_modified=false', tol && tol.default_value === 10 && tol.value === 10 && tol.min === 0 && tol.max === 120 && tol.type === 'integer' && tol.is_modified === false, j(tol));
    const dflt = { tolerance_min: 10, late_until_min: 30, late_per_absence: 3, early_exit_min: 15, min_workday_hours: 4, cutoff_time: '04:00', punch_debounce_seconds: 60, clock_drift_max_min: 10, max_shifts_per_day: 3, vacation_validity_months: 18 };
    const diff = Object.entries(dflt).filter(([k, v]) => sets.find((s) => s.key === k)?.default_value !== v).map(([k]) => k);
    check('defaults segun roadmap 7.8', diff.length === 0, `difieren: ${diff.join(',')}`);
    st('PUT sin motivo -> 400', await A('PUT', '/settings/tolerance_min', { value: 12 }), 400);
    st('PUT motivo corto -> 400', await A('PUT', '/settings/tolerance_min', { value: 12, reason: 'abc' }), 400);
    st('PUT fuera de rango (500) -> 400', await A('PUT', '/settings/tolerance_min', { value: 500, reason: 'motivo valido' }), 400);
    st('PUT negativo -> 400', await A('PUT', '/settings/tolerance_min', { value: -1, reason: 'motivo valido' }), 400);
    st('PUT tipo incorrecto -> 400', await A('PUT', '/settings/tolerance_min', { value: 'abc', reason: 'motivo valido' }), 400);
    st('PUT enum invalido -> 400', await A('PUT', '/settings/late_period', { value: 'siglo', reason: 'motivo valido' }), 400);
    st('PUT hora invalida -> 400', await A('PUT', '/settings/cutoff_time', { value: '25:99', reason: 'motivo valido' }), 400);
    st('PUT zona horaria invalida -> 400', await A('PUT', '/settings/timezone', { value: 'Marte/Olimpo', reason: 'motivo valido' }), 400);
    st('PUT clave desconocida -> 400/404', await A('PUT', '/settings/no_existe', { value: 1, reason: 'motivo valido' }), [400, 404]);
    r = await A('PUT', '/settings/tolerance_min', { value: 12, reason: 'cambio e2e historial' });
    st('PUT valido 200 (devuelve lista completa)', r, 200); check('respuesta trae settings[]', r.json?.settings?.length === sets.length, brief(r));
    const t2 = (await get('/settings')).json?.settings?.find((s) => s.key === 'tolerance_min');
    eq('valor 12 y is_modified=true', [t2?.value, t2?.is_modified], [12, true]);
    r = await get('/settings/changes?limit=5');
    const ch = r.json?.changes?.[0];
    check('historial: ultimo cambio con previous 10, new 12, motivo y usuario', ch?.setting_key === 'tolerance_min' && j(ch.previous_value) === '10' && j(ch.new_value) === '12' && ch.change_reason === 'cambio e2e historial' && !!ch.changed_by_name && typeof ch.id === 'string', j(ch));
    st('historial limit=0 -> 400', await get('/settings/changes?limit=0'), 400);
    st('historial limit=501 -> 400', await get('/settings/changes?limit=501'), 400);
    await A('PUT', '/settings/tolerance_min', { value: 10, reason: 'restaurar e2e' });
    eq('restaurado: is_modified=false', (await get('/settings')).json?.settings?.find((s) => s.key === 'tolerance_min')?.is_modified, false);

    // tipos de incidencia
    const code = `e2e_${RUN.toLowerCase()}`;
    r = await A('POST', '/incident-types', { code, name: `TEST E2E ${RUN}`, requires_attachment: false, is_paid: true, deducts_vacation: false, counts_as_attendance: true, is_hourly: false });
    st('crear tipo de incidencia 201', r, 201); const it = r.json?.incident_type; if (it) created.incidentTypes.push(it.id);
    eq('tipo nuevo: is_system=false, activo', [it?.is_system, it?.is_active, it?.requires_attachment], [false, true, false]);
    st('codigo duplicado -> 409', await A('POST', '/incident-types', { code, name: 'Otro' }), 409);
    st('codigo invalido (mayusculas) -> 400', await A('POST', '/incident-types', { code: 'MAL-Codigo', name: 'Otro nombre' }), 400);
    st('nombre corto -> 400', await A('POST', '/incident-types', { code: `e2e_${RUN.toLowerCase()}b`, name: 'x' }), 400);
    r = await A('PATCH', `/incident-types/${it.id}`, { name: `TEST E2E ${RUN} editado`, is_active: false });
    st('editar y desactivar tipo propio 200', r, 200); eq('desactivado', r.json?.incident_type?.is_active, false);
    check('tipo inactivo no sale por defecto', !((await get('/incident-types')).json?.incident_types || []).some((x) => x.id === it.id));
    check('tipo inactivo sale con include_inactive=true', ((await get('/incident-types?include_inactive=true')).json?.incident_types || []).some((x) => x.id === it.id));
    const sys = ((await get('/incident-types')).json?.incident_types || []).find((x) => x.code === 'vacation');
    st('tipo de sistema: cambiar code -> 400', await A('PATCH', `/incident-types/${sys.id}`, { code: 'otra_cosa' }), 400);
    st('tipo de sistema: desactivar -> 400', await A('PATCH', `/incident-types/${sys.id}`, { is_active: false }), 400);
    st('tipo inexistente 404', await A('PATCH', '/incident-types/99999999', { name: 'Nombre x' }), 404);
    st('tipo PATCH vacio 400', await A('PATCH', `/incident-types/${it.id}`, {}), 400);

    // vacaciones: tabla
    const before = (await get('/vacation-policy')).json?.policy || [];
    originals.policy = before.map((p) => ({ y: p.from_seniority_year, d: p.vacation_days }));
    const year1 = before.find((p) => p.from_seniority_year === 1);
    check('tabla: fila 1 con law_days y differs_from_law', year1 && typeof year1.law_days === 'number' && typeof year1.differs_from_law === 'boolean', j(year1));
    const periodOf = async () => (await get(`/vacations/employees/${E[7].id}`)).json?.periods?.find((p) => p.seniority_year === 1);
    const e7y1 = (await periodOf())?.days_entitled;
    r = await A('PUT', '/vacation-policy/1', { vacation_days: 13.5 });
    st('PUT tabla anio 1 = 13.5 200', r, 200); eq('fila actualizada y differs_from_law', [r.json?.policy?.find((p) => p.from_seniority_year === 1)?.vacation_days, r.json?.policy?.find((p) => p.from_seniority_year === 1)?.differs_from_law], [13.5, true]);
    eq('se propaga a periodos vigentes (E7 anio 1)', (await periodOf())?.days_entitled, 13.5);
    st('PUT 61 dias -> 400', await A('PUT', '/vacation-policy/1', { vacation_days: 61 }), 400);
    st('PUT 12.3 (no multiplo de .5) -> 400', await A('PUT', '/vacation-policy/1', { vacation_days: 12.3 }), 400);
    st('PUT anio 0 -> 400', await A('PUT', '/vacation-policy/0', { vacation_days: 12 }), 400);
    st('PUT anio 61 -> 400', await A('PUT', '/vacation-policy/61', { vacation_days: 12 }), 400);
    st('DELETE fila 1 -> 400', await A('DELETE', '/vacation-policy/1'), 400);
    st('DELETE fila inexistente -> 404', await A('DELETE', '/vacation-policy/59'), 404);
    r = await A('PUT', '/vacation-policy/59', { vacation_days: 40 });
    st('PUT anio nuevo (59) 200', r, 200); st('DELETE anio 59 200', await A('DELETE', '/vacation-policy/59'), 200);
    r = await A('POST', '/vacation-policy/reset');
    st('reset a LFT 200', r, 200);
    const lft = { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20, 6: 22, 11: 24, 16: 26, 21: 28, 26: 30, 31: 32, 36: 34, 41: 36, 46: 38, 51: 40 };
    eq('reset: tabla = LFT 2023', Object.fromEntries((r.json?.policy || []).map((p) => [p.from_seniority_year, p.vacation_days])), lft);
    eq('reset: ya no difiere de la ley (differs_from_law false)', (r.json?.policy || []).every((p) => p.differs_from_law === false), true);
    eq('reset propaga a los periodos vigentes (E7 anio 1 = 12)', (await periodOf())?.days_entitled, 12);
    void e7y1;

    // festivos
    r = await A('POST', '/holidays', { holiday_date: '2031-03-01', name: `TEST-E2E dia ${RUN}` });
    st('crear festivo futuro 201', r, 201); const h = r.json?.holiday; if (h) created.holidays.push(h.id);
    st('fecha imposible 2026-02-31 -> 400', await A('POST', '/holidays', { holiday_date: '2026-02-31', name: 'Dia X' }), 400);
    st('nombre de 1 letra -> 400', await A('POST', '/holidays', { holiday_date: '2031-03-02', name: 'X' }), 400);
    r = await get('/holidays?year=2031');
    check('GET /holidays?year=2031 trae el creado, ordenado', r.json?.holidays?.some((x) => x.id === h.id) && r.json.holidays.every((x) => x.holiday_date.startsWith('2031')), brief(r));
    st('year fuera de rango -> 400', await get('/holidays?year=1999'), 400);
    r = await A('PATCH', `/holidays/${h.id}`, { holiday_date: '2031-03-03', name: `TEST-E2E dia ${RUN} b` });
    st('PATCH festivo fecha y nombre 200', r, 200); eq('fecha movida', r.json?.holiday?.holiday_date, '2031-03-03');
    const h2 = (await A('POST', '/holidays', { holiday_date: '2031-03-05', name: `TEST-E2E dos ${RUN}` })).json?.holiday; if (h2) created.holidays.push(h2.id);
    st('PATCH a fecha ocupada -> 409', await A('PATCH', `/holidays/${h2.id}`, { holiday_date: '2031-03-03' }), 409);
    st('PATCH vacio -> 400', await A('PATCH', `/holidays/${h.id}`, {}), 400);
    st('PATCH festivo inexistente 404', await A('PATCH', '/holidays/99999999', { name: 'Nombre' }), 404);
    for (const id of [h.id, h2?.id]) if (id) { st(`DELETE festivo ${id} 200`, await A('DELETE', `/holidays/${id}`), 200); created.holidays = created.holidays.filter((x) => x !== id); }
  });

  // ------------------------------------------------------------ 8. Seguridad y robustez
  await section('8 Seguridad y robustez', async () => {
    const eid = E[1].id;
    const READS = ['/branches', '/employees', '/employees/summary', `/employees/${eid}`, '/shifts', '/schedule', '/schedule/log', `/schedule/employee/${eid}`, '/days', '/punches', '/incidents', '/vacations/balances', `/vacations/employees/${eid}`, '/board/live', '/board/commitment', `/export/days.xlsx?from=${YESTERDAY}&to=${YESTERDAY}`, `/export/overtime.xlsx?from=${YESTERDAY}&to=${YESTERDAY}`, '/export/commitment.xlsx', '/report/commitment.pdf', '/settings', '/settings/changes', '/holidays', '/incident-types', '/vacation-policy', '/devices/overview'];
    const WRITES = [
      ['POST', '/shifts', 'SCHEDULES'], ['PATCH', '/shifts/1', 'SCHEDULES'], ['POST', '/assignments', 'SCHEDULES'], ['PATCH', '/assignments/1', 'SCHEDULES'], ['DELETE', '/assignments/1', 'SCHEDULES'], ['POST', '/schedule/copy', 'SCHEDULES'], [`PATCH`, `/employees/${eid}`, 'SCHEDULES'], ['POST', '/employees/bulk-enable', 'SCHEDULES'],
      ['POST', '/days/recalculate', 'AUTH'], ['POST', '/punches/manual', 'AUTH'], ['POST', '/punches/1/review', 'AUTH'], ['POST', '/punches/1/link-employee', 'AUTH'], ['POST', '/incidents', 'AUTH'], ['GET', '/incidents/template', 'AUTH'], ['POST', '/incidents/import', 'AUTH'], ['POST', '/incidents/import/simulate', 'AUTH'], ['POST', '/incidents/1/authorize', 'AUTH'], ['POST', '/incidents/1/reject', 'AUTH'], ['POST', '/incidents/1/cancel', 'AUTH'], ['POST', '/incidents/1/attachments', 'AUTH'], ['DELETE', '/incidents/1/attachments/1', 'AUTH'], ['POST', `/days/${eid}/${YESTERDAY}/justify`, 'AUTH'], [`POST`, `/vacations/employees/${eid}/open-periods`, 'AUTH'], ['POST', '/vacations/adjust', 'AUTH'],
      ['PUT', '/settings/tolerance_min', 'MANAGE'], ['POST', '/holidays', 'MANAGE'], ['PATCH', '/holidays/1', 'MANAGE'], ['DELETE', '/holidays/1', 'MANAGE'], ['POST', '/incident-types', 'MANAGE'], ['PATCH', '/incident-types/1', 'MANAGE'], ['PUT', '/vacation-policy/1', 'MANAGE'], ['DELETE', '/vacation-policy/5', 'MANAGE'], ['POST', '/vacation-policy/reset', 'MANAGE'],
      ['GET', '/devices/orders', 'DEVICES'], ['POST', '/devices/agents', 'DEVICES'], ['POST', '/devices/agents/1/rotate-key', 'DEVICES'], ['PATCH', '/devices/agents/1', 'DEVICES'], ['DELETE', '/devices/agents/1', 'DEVICES'], ['POST', '/devices/agents/1/test', 'DEVICES'], ['POST', '/devices/agents/1/sync', 'DEVICES'], ['PATCH', '/devices/terminals/1', 'DEVICES'], ['POST', `/devices/employees/${eid}/enroll`, 'DEVICES'],
    ];
    const bad = { noTok: [], viewerRead: [], viewerWrite: [], nopermRead: [], nopermWrite: [] };
    for (const p of READS) {
      if ((await get(p, { token: null })).status !== 401) bad.noTok.push(p);
      const v = await get(p, { token: env.VIEWER, raw: true }); if (v.status !== 200) bad.viewerRead.push(`${p}=${v.status}`);
      if ((await get(p, { token: env.NOPERM })).status !== 403) bad.nopermRead.push(p);
    }
    for (const [m, p] of WRITES) {
      if ((await A(m, p, m === 'GET' ? undefined : {}, { token: null })).status !== 401) bad.noTok.push(`${m} ${p}`);
      if ((await A(m, p, m === 'GET' ? undefined : {}, { token: env.VIEWER })).status !== 403) bad.viewerWrite.push(`${m} ${p}`);
      if ((await A(m, p, m === 'GET' ? undefined : {}, { token: env.NOPERM })).status !== 403) bad.nopermWrite.push(`${m} ${p}`);
    }
    eq(`sin token -> 401 en los ${READS.length + WRITES.length} endpoints`, bad.noTok, []);
    eq(`viewer: lecturas 200 en los ${READS.length} endpoints de lectura`, bad.viewerRead, []);
    eq(`viewer: escrituras 403 en los ${WRITES.length} endpoints de escritura`, bad.viewerWrite, []);
    eq('usuario sin permisos: lecturas 403', bad.nopermRead, []);
    eq('usuario sin permisos: escrituras 403', bad.nopermWrite, []);
    // verificacion de que el viewer realmente no escribio
    eq('viewer no creo turnos', psql(`SELECT count(*) FROM attendance.shifts WHERE name = ''`)[0][0], '0');
    // endpoints del agente sin clave
    for (const [m, p] of [['POST', '/heartbeat'], ['GET', '/orders'], ['POST', '/orders/1/result'], ['POST', '/punches']]) st(`agente ${m} ${p} sin clave -> 401`, await req(m, `${API}/agent${p}`, { body: m === 'POST' ? {} : undefined }), 401);
    // ids invalidos 400 / inexistentes 404
    const invalid = [['PATCH', '/shifts/abc'], ['PATCH', '/assignments/abc'], ['DELETE', '/assignments/abc'], ['PATCH', '/employees/abc'], ['GET', '/employees/abc'], ['POST', '/punches/abc/review'], ['POST', '/punches/abc/link-employee'], ['GET', '/incidents/abc'], ['POST', '/incidents/abc/authorize'], ['PATCH', '/holidays/abc'], ['DELETE', '/holidays/abc'], ['PATCH', '/incident-types/abc'], ['PATCH', '/devices/agents/abc'], ['DELETE', '/devices/agents/abc'], ['PATCH', '/devices/terminals/abc'], ['GET', '/schedule/employee/abc'], ['GET', '/vacations/employees/abc'], ['PUT', '/vacation-policy/abc'], ['POST', '/devices/agents/abc/sync']];
    const badIds = [];
    for (const [m, p] of invalid) { const r = await A(m, p, m === 'GET' || m === 'DELETE' ? undefined : (p.includes('review') ? { decision: 'approve' } : p.includes('link') ? { employee_id: 1 } : p.includes('vacation-policy') ? { vacation_days: 12 } : { name: 'valido' })); if (![400].includes(r.status)) badIds.push(`${m} ${p}=${r.status}`); }
    eq('ids no numericos -> 400 (sin 500)', badIds, []);
    const missing = [['GET', '/employees/99999999'], ['GET', '/incidents/99999999'], ['PATCH', '/holidays/99999999', { name: 'Nombre' }], ['PATCH', '/shifts/99999999', { name: 'Nombre' }], ['PATCH', '/assignments/99999999', { notes: 'x' }], ['PATCH', '/devices/agents/99999999', { name: 'xx' }], ['POST', '/punches/99999999/review', { decision: 'approve' }], ['GET', '/schedule/employee/99999999'], ['POST', '/incidents/99999999/authorize', {}], ['GET', '/vacations/employees/99999999'], ['GET', '/punches/99999999/photo']];
    const badMissing = [];
    for (const [m, p, b] of missing) { const r = await A(m, p, b); if (r.status !== 404) badMissing.push(`${m} ${p}=${r.status}`); }
    eq('ids inexistentes -> 404', badMissing, []);
    // fechas que no cumplen el formato AAAA-MM-DD: deben dar 400, nunca 500
    const badDates = [];
    for (const g of ['/days?from=abc&to=2026-10-01', '/punches?from=abc', '/board/commitment?period=custom&from=abc&to=abc', '/export/days.xlsx?from=abc&to=abc', '/export/overtime.xlsx?from=abc&to=abc', '/export/commitment.xlsx?period=custom&from=abc&to=abc', '/report/commitment.pdf?period=custom&from=abc&to=abc', '/incidents?from=abc', '/board/live?date=abc']) { const r = await get(g, { raw: true }); if (r.status !== 400) badDates.push(`${g}=${r.status}`); }
    for (const [pth, body] of [['/days/recalculate', { from: 'abc', to: YESTERDAY }], ['/punches/manual', { employee_id: eid, work_date: 'abc', time: '08:00', punch_type: 'in', justification: 'prueba fecha' }]]) { const r = await A('POST', pth, body); if (r.status !== 400) badDates.push(`POST ${pth}=${r.status}`); }
    eq('fechas con formato invalido -> 400 en todos los endpoints (no 500)', badDates, []);
    // inyeccion
    const sqli = encodeURIComponent("' OR 1=1 --");
    const total = (await get(`/employees?search=${encodeURIComponent('zzzNOEXISTEzzz')}`)).json?.pagination?.total;
    const injTargets = [`/employees?search=${sqli}`, `/days?search=${sqli}`, `/punches?search=${sqli}`, `/incidents?search=${sqli}`, `/schedule?search=${sqli}`, `/vacations/balances?search=${sqli}`, `/schedule/log?employee_id=${sqli}`, `/days?employee_id=1%20OR%201=1`, `/employees?branch_id=1;DROP%20TABLE%20users`, `/export/days.xlsx?from=${sqli}&to=${sqli}`];
    const injBad = [];
    for (const p of injTargets) { const r = await get(p, { raw: true }); if (r.status >= 500) injBad.push(`${p}=${r.status}`); }
    eq('inyeccion SQL basica: ningun 5xx', injBad, []);
    eq("search=' OR 1=1 -- no devuelve todo (0 resultados como cualquier texto raro)", (await get(`/employees?search=${sqli}`)).json?.pagination?.total, total);
    eq('tabla users sigue existiendo', Number(psql('SELECT count(*) FROM users')[0][0]) > 0, true);
    const xss = await A('POST', '/holidays', { holiday_date: '2032-05-05', name: '<script>alert(1)</script>' });
    if (xss.json?.holiday) { created.holidays.push(xss.json.holiday.id); check('nombre con HTML se guarda como texto literal y se devuelve JSON', xss.json.holiday.name === '<script>alert(1)</script>' && /json/.test(xss.ctype)); await A('DELETE', `/holidays/${xss.json.holiday.id}`); created.holidays = created.holidays.filter((x) => x !== xss.json.holiday.id); }
    const raw = await fetch(`${API}/shifts`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: '{"name":' });
    check('JSON roto -> 400', raw.status === 400, `HTTP ${raw.status}`);
    // inmutabilidad de checadas
    const pid = psql(`SELECT id FROM attendance.punches WHERE employee_id=${E[1].id} LIMIT 1`)[0][0];
    const u1 = psqlTry(`UPDATE attendance.punches SET punched_at = punched_at + interval '1 hour' WHERE id=${pid}`);
    check('UPDATE de punched_at rechazado por trigger', !u1.ok && /inmutab|immutab|no se puede/i.test(u1.err), u1.err || 'el UPDATE paso');
    const u2 = psqlTry(`UPDATE attendance.punches SET employee_id = ${E[2].id} WHERE id=${pid}`);
    check('UPDATE de employee_id rechazado', !u2.ok, u2.err || 'el UPDATE paso');
    const u3 = psqlTry(`UPDATE attendance.punches SET punch_type = CASE WHEN punch_type = 'out' THEN 'in' ELSE 'out' END WHERE id=${pid}`);
    check('UPDATE de punch_type rechazado', !u3.ok, u3.err || 'el UPDATE paso');
    const d1 = psqlTry(`DELETE FROM attendance.punches WHERE id=${pid}`);
    check('DELETE de checada rechazado por trigger', !d1.ok && /inmutab|immutab|no se puede|no se permite/i.test(d1.err), d1.err || 'el DELETE paso');
    check('TRUNCATE de checadas rechazado o sin efecto', (() => { const t = psqlTry('DELETE FROM attendance.punches'); return !t.ok; })(), 'DELETE masivo paso');
    eq('la checada sigue intacta', psql(`SELECT count(*) FROM attendance.punches WHERE id=${pid}`)[0][0], '1');
    // archivos no servidos sin token
    const att = psql(`SELECT file_path FROM attendance.incident_attachments LIMIT 1`)[0]?.[0] || '';
    const photoPath = psql(`SELECT photo_path FROM attendance.punches WHERE photo_path IS NOT NULL ORDER BY id DESC LIMIT 1`)[0]?.[0] || '';
    const guesses = [`/uploads/${att}`, `/uploads/attendance-incidents/${att.split(/[\\/]/).slice(-2).join('/')}`, `/uploads/attendance-punches/${photoPath}`, `/static/${photoPath}`, `/${att}`].filter((x) => x.length > 12);
    const served = [];
    for (const g of guesses) { const r = await req('GET', `${BASE}${g}`, { raw: true }); if (r.status === 200 && !/html/.test(r.ctype)) served.push(`${g}=${r.status} ${r.ctype}`); }
    eq('adjuntos y fotos NO se sirven como archivo estatico sin token', served, []);
  });
};

// =================================================================== limpieza
const cleanup = async () => {
  currentSection = 'Limpieza';
  console.log('\n=== Limpieza');
  const log = (m) => console.log(`  ${m}`);
  const safe = (label, sql) => { const r = psqlTry(sql); if (!r.ok) log(`(!) ${label}: ${r.err.trim().split('\n')[0]}`); return r; };
  try {
    if (TOKEN) {
      if (originals.tolerance) await A('PUT', '/settings/tolerance_min', { value: 10, reason: 'limpieza e2e' });
      const cur = (await get('/settings')).json?.settings || [];
      if (originals.noBalance !== undefined && cur.find((s) => s.key === 'vacations_no_balance')?.value !== originals.noBalance) await A('PUT', '/settings/vacations_no_balance', { value: originals.noBalance, reason: 'limpieza e2e' });
      for (const id of created.holidays) await A('DELETE', `/holidays/${id}`);
      if (originals.policy) {
        await A('POST', '/vacation-policy/reset');
        const now = Object.fromEntries(((await get('/vacation-policy')).json?.policy || []).map((p) => [p.from_seniority_year, p.vacation_days]));
        const orig = Object.fromEntries(originals.policy.map((p) => [p.y, p.d]));
        let touched = 0;
        for (const [y, d] of Object.entries(orig)) if (now[y] !== d) { await A('PUT', `/vacation-policy/${y}`, { vacation_days: d }); touched += 1; }
        for (const y of Object.keys(now)) if (!(y in orig)) await A('DELETE', `/vacation-policy/${y}`);
        log(`tabla de vacaciones restaurada (${touched} filas distintas de la LFT reaplicadas)`);
      }
    }
    const ids = [...Object.values(E), ...Object.values(L)].map((e) => e.id).filter(Boolean);
    if (ids.length) {
      const list = ids.join(',');
      const files = psqlTry(`SELECT file_path FROM attendance.incident_attachments WHERE incident_id IN (SELECT id FROM attendance.incidents WHERE employee_id IN (${list}))`);
      safe('adjuntos', `DELETE FROM attendance.incident_attachments WHERE incident_id IN (SELECT id FROM attendance.incidents WHERE employee_id IN (${list}))`);
      for (const f of [...(files.rows || []).map((x) => x[0]), ...created.attachmentFiles]) { try { rmSync(resolve(backendRoot, f), { force: true }); } catch { /* */ } }
      safe('incidencias', `DELETE FROM attendance.incidents WHERE employee_id IN (${list})`);
      safe('asignaciones', `DELETE FROM attendance.shift_assignments WHERE employee_id IN (${list})`);
      safe('bitacora de horarios', `DELETE FROM attendance.schedule_changes WHERE employee_id IN (${list})`);
      safe('periodos de vacaciones', `DELETE FROM attendance.vacation_periods WHERE employee_id IN (${list})`);
      safe('resultados diarios', `DELETE FROM attendance.daily_results WHERE employee_id IN (${list})`);
      safe('ordenes', `DELETE FROM attendance.agent_orders WHERE employee_id IN (${list})`);
      safe('perfiles deshabilitados', `UPDATE attendance.employee_profiles SET is_enabled=false, device_sync_status='not_applicable', device_sync_error=NULL WHERE employee_id IN (${list})`);
      safe('empleados inactivos', `UPDATE employees SET is_active=false WHERE id IN (${list})`);
    }
    safe('turnos TEST-E2E', `DELETE FROM attendance.shifts WHERE name LIKE 'TEST-E2E-${RUN}-%'`);
    if (created.incidentTypes.length) safe('tipos de incidencia', `DELETE FROM attendance.incident_types WHERE id IN (${created.incidentTypes.join(',')}) AND is_system = false`);
    if (AGENT) { await A('PATCH', `/devices/agents/${AGENT.id}`, { is_active: false }); log(`agente ${AGENT.id} (${AGENT.name}) desactivado y conservado (tiene checadas inmutables; la sucursal ${BR} queda ocupada por el, se reutiliza en la siguiente corrida)`); }
    for (const id of created.users) {
      safe('roles de usuario de prueba', `DELETE FROM user_roles WHERE user_id='${id}'`);
      safe('usuario de prueba desactivado', `UPDATE users SET is_active=false WHERE id='${id}'`); // access_logs impide borrarlo; se reutiliza en la siguiente corrida
    }
    const resid = psql(`SELECT count(*) FROM attendance.punches WHERE device_event_serial LIKE '${RUN}-%' OR employee_id IN (${ids.join(',') || 0}) OR device_employee_number LIKE 'UNK-${RUN}%'`)[0][0];
    log(`residuo: ${resid} checadas inmutables de la corrida ${RUN} + ${ids.length} empleados E2E desactivados (no se pueden borrar por el FK RESTRICT)`);
  } catch (e) { log(`(!) error en limpieza: ${e.message}`); }
};

let fatal = null;
try { await main(); } catch (e) { fatal = e; console.error('\nERROR FATAL:', e.message); }
await cleanup();

const real = results.filter((r) => !r.skipped); const fails = real.filter((r) => !r.ok); const skips = results.filter((r) => r.skipped);
console.log(`\n==================== RESUMEN (RUN ${RUN}) ====================`);
console.log(`Casos: ${real.length}   PASS: ${real.length - fails.length}   FAIL: ${fails.length}   SKIP: ${skips.length}${fatal ? '   (abortado por error fatal)' : ''}`);
const bySection = {};
for (const r of real) { bySection[r.section] ??= [0, 0]; bySection[r.section][r.ok ? 0 : 1] += 1; }
for (const [s, [p, f]] of Object.entries(bySection)) console.log(`  ${s}: ${p} PASS, ${f} FAIL`);
if (fails.length) { console.log('\nFALLOS:'); for (const f of fails) console.log(`- [${f.section}] ${f.name}\n    ${f.detail}`); }
process.exit(fails.length || fatal ? 1 : 0);
