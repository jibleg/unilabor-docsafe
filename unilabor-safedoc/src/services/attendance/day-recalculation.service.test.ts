import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import pool from '../../config/db';
import { recalculateRange } from './day-recalculation.service';
import { DEFAULT_ATTENDANCE_SETTINGS } from './engine/settings';
import { dateToLocalMs } from './engine/time';
import { localMsToInstant } from './timezone';

/**
 * Pruebas contra la BD LOCAL: cada caso corre en una transaccion que se revierte
 * (attendance.punches no admite DELETE). Si no hay BD con el schema, se omiten.
 */

const settings = { ...DEFAULT_ATTENDANCE_SETTINGS };
const TZ = settings.timezone;
const USER_ID = 'fb650480-5e25-428e-bfc0-ee4759fca86e';

let available = false;
let userExists = false;

beforeAll(async () => {
  try {
    const result = await pool.query(
      `SELECT to_regclass('attendance.daily_results') IS NOT NULL AS ok,
              EXISTS (SELECT 1 FROM public.users WHERE id = $1) AS user_ok`,
      [USER_ID],
    );
    available = Boolean(result.rows[0]?.ok);
    userExists = Boolean(result.rows[0]?.user_ok);
  } catch {
    available = false;
  }
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

let client: PoolClient;
let seq = 0;

beforeEach(async (ctx) => {
  if (!available || !userExists) return ctx.skip();
  client = await pool.connect();
  await client.query('BEGIN');
});

afterEach(async () => {
  if (client) {
    await client.query('ROLLBACK');
    client.release();
  }
});

const newEmployee = async (hireDate: string | null = null): Promise<number> => {
  seq += 1;
  const code = `TEST-${Date.now()}-${seq}`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO public.employees (employee_code, full_name, email, hire_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [code, `Prueba ${code}`, `${code.toLowerCase()}@test.local`, hireDate],
  );
  const id = Number(rows[0]?.id);
  await client.query('INSERT INTO attendance.employee_profiles (employee_id, is_enabled) VALUES ($1, TRUE)', [id]);
  return id;
};

const newShift = async (name: string, start: string, end: string, breakMinutes = 0): Promise<number> => {
  seq += 1;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO attendance.shifts (name, start_time, end_time, break_minutes) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`TEST ${name} ${Date.now()}-${seq}`, start, end, breakMinutes],
  );
  return Number(rows[0]?.id);
};

const assign = async (employeeId: number, shiftId: number | null, weekdays = [1, 2, 3, 4, 5]) =>
  client.query(
    `INSERT INTO attendance.shift_assignments (employee_id, shift_id, start_date, repeats_weekly, weekdays)
     VALUES ($1, $2, '2026-01-01', TRUE, $3::smallint[])`,
    [employeeId, shiftId, weekdays],
  );

/** Checada manual en hora local 'YYYY-MM-DD HH:MM[:SS]'. */
const punch = async (
  employeeId: number,
  local: string,
  type: 'in' | 'out' | null,
  review: 'none' | 'pending' | 'rejected' = 'none',
) => {
  const [date, time] = local.split(' ') as [string, string];
  const [h, m, s] = time.split(':').map(Number) as [number, number, number?];
  const ms = dateToLocalMs(date) + ((h * 60 + m) * 60 + (s ?? 0)) * 1000;
  await client.query(
    `INSERT INTO attendance.punches
       (employee_id, source, punch_type, punched_at, verification_method, manual_justification,
        registered_by_user_id, review_status)
     VALUES ($1, 'manual', $2, $3, 'manual', 'prueba automatizada', $4, $5)`,
    [employeeId, type, localMsToInstant(ms, TZ), USER_ID, review],
  );
};

const run = (employeeId: number, from: string, to: string) =>
  recalculateRange({ from, to, employeeIds: [employeeId] }, { client, settings });

const results = async (employeeId: number) => {
  const { rows } = await client.query(
    `SELECT to_char(work_date, 'YYYY-MM-DD') AS work_date, day_result, late_minutes, early_departure_minutes,
            worked_hours::float8 AS worked_hours, overtime_hours::float8 AS overtime_hours, incident_id,
            is_late_accumulation_absence AS late_abs, has_pending_review AS pending,
            calculation_detail->>'reason' AS reason, segments,
            to_char(expected_start_time, 'HH24:MI') AS exp_start, to_char(expected_end_time, 'HH24:MI') AS exp_end
       FROM attendance.daily_results WHERE employee_id = $1 ORDER BY work_date`,
    [employeeId],
  );
  return new Map(rows.map((row) => [row.work_date as string, row]));
};

const incidentType = async (code: string): Promise<number> => {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM attendance.incident_types WHERE code = $1', [code]);
  return Number(rows[0]?.id);
};

const newIncident = async (
  employeeId: number,
  code: string,
  date: string,
  status: string,
  hours: number | null = null,
): Promise<number> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO attendance.incidents (employee_id, incident_type_id, start_date, end_date, hours, incident_status)
     VALUES ($1, $2, $3, $3, $4, $5) RETURNING id`,
    [employeeId, await incidentType(code), date, hours, status],
  );
  return Number(rows[0]?.id);
};

describe('recalculateRange (BD local, con rollback)', () => {
  it('asistencia, retardo, falta, retardo excesivo, rechazada ignorada, rebote y pendiente', async () => {
    const emp = await newEmployee();
    const shift = await newShift('Oficina', '09:00', '18:00', 60);
    await assign(emp, shift);

    await punch(emp, '2026-03-02 08:55', 'in'); // lunes: asistencia
    await punch(emp, '2026-03-02 18:05', 'out');
    await punch(emp, '2026-03-03 09:25', 'in'); // martes: retardo 25
    await punch(emp, '2026-03-03 18:00', 'out');
    // miercoles: sin checadas -> falta
    await punch(emp, '2026-03-05 09:45', 'in'); // jueves: 45 min tarde -> falta
    await punch(emp, '2026-03-05 18:00', 'out');
    await punch(emp, '2026-03-06 08:00', 'in', 'rejected'); // viernes: rechazada no cuenta
    await punch(emp, '2026-03-06 09:00', 'in');
    await punch(emp, '2026-03-06 18:00', 'out');
    await punch(emp, '2026-03-12 09:00:00', 'in'); // jueves siguiente: rebote 30 s
    await punch(emp, '2026-03-12 09:00:30', 'in');
    await punch(emp, '2026-03-12 18:00', 'out');
    await punch(emp, '2026-03-13 09:00', 'in', 'pending'); // pendiente de revision
    await punch(emp, '2026-03-13 18:00', 'out');

    const summary = await run(emp, '2026-03-02', '2026-03-13');
    expect(summary).toEqual({ employees: 1, days: 12 });

    const r = await results(emp);
    expect(r.get('2026-03-02')).toMatchObject({ day_result: 'present', worked_hours: 8.17, reason: 'on_time', exp_start: '09:00', exp_end: '18:00' });
    expect(r.get('2026-03-03')).toMatchObject({ day_result: 'late', late_minutes: 25 });
    expect(r.get('2026-03-04')).toMatchObject({ day_result: 'absent', reason: 'no_punches' });
    expect(r.get('2026-03-05')).toMatchObject({ day_result: 'absent', reason: 'excessive_late' });
    expect(r.get('2026-03-06')).toMatchObject({ day_result: 'present', pending: false });
    expect(r.get('2026-03-07')).toMatchObject({ day_result: 'no_schedule' });
    expect(r.get('2026-03-12')).toMatchObject({ day_result: 'present' });
    expect(r.get('2026-03-13')).toMatchObject({ day_result: 'present', pending: true });

    // Idempotencia: recalcular de nuevo no duplica ni cambia.
    const again = await run(emp, '2026-03-02', '2026-03-13');
    expect(again).toEqual(summary);
    const count = await client.query('SELECT COUNT(*)::int AS n FROM attendance.daily_results WHERE employee_id = $1', [emp]);
    expect(count.rows[0].n).toBe(12);
    expect([...(await results(emp)).values()].map((x) => x.day_result)).toEqual([...r.values()].map((x) => x.day_result));
  });

  it('festivo, incidencia autorizada, incidencia no autorizada y horas extra', async () => {
    const emp = await newEmployee();
    const shift = await newShift('Oficina', '09:00', '18:00', 60);
    await assign(emp, shift);
    await client.query(`INSERT INTO attendance.holidays (holiday_date, name) VALUES ('2026-03-16', 'TEST festivo') ON CONFLICT DO NOTHING`);
    const holidayExisted = (await client.query(`SELECT is_active FROM attendance.holidays WHERE holiday_date = '2026-03-16'`)).rows[0];
    expect(holidayExisted.is_active).toBe(true);

    const vacationId = await newIncident(emp, 'vacation', '2026-03-17', 'authorized');
    await newIncident(emp, 'vacation', '2026-03-18', 'captured'); // no autorizada: se ignora
    await newIncident(emp, 'overtime', '2026-03-19', 'authorized', 2);
    await punch(emp, '2026-03-19 09:00', 'in');
    await punch(emp, '2026-03-19 20:00', 'out');

    await run(emp, '2026-03-16', '2026-03-19');
    const r = await results(emp);
    expect(r.get('2026-03-16')).toMatchObject({ day_result: 'holiday' });
    expect(r.get('2026-03-17')).toMatchObject({ day_result: 'incident', incident_id: String(vacationId) });
    expect(r.get('2026-03-18')).toMatchObject({ day_result: 'absent' });
    expect(r.get('2026-03-19')).toMatchObject({ day_result: 'present', worked_hours: 10, overtime_hours: 2 });
  });

  it('turno nocturno que cruza medianoche', async () => {
    const emp = await newEmployee();
    const shift = await newShift('Noche', '22:00', '06:00');
    await assign(emp, shift);
    await punch(emp, '2026-03-16 21:55', 'in'); // lunes
    await punch(emp, '2026-03-17 06:05', 'out');
    await run(emp, '2026-03-16', '2026-03-16');
    const r = await results(emp);
    expect(r.get('2026-03-16')).toMatchObject({ day_result: 'present', worked_hours: 8.17, exp_start: '22:00', exp_end: '06:00' });
    const segs = r.get('2026-03-16')?.segments as Array<{ clock_out_at: string }>;
    expect(segs[0]?.clock_out_at).toBe(localMsToInstant(dateToLocalMs('2026-03-17') + (6 * 60 + 5) * 60000, TZ).toISOString());
  });

  it('jornada partida y tramo sin checar', async () => {
    const emp = await newEmployee();
    await assign(emp, await newShift('Manana', '08:00', '12:00'));
    await assign(emp, await newShift('Tarde', '16:00', '20:00'));
    await punch(emp, '2026-03-02 07:58', 'in'); // completo
    await punch(emp, '2026-03-02 12:00', 'out');
    await punch(emp, '2026-03-02 16:00', 'in');
    await punch(emp, '2026-03-02 20:00', 'out');
    await punch(emp, '2026-03-03 08:00', 'in'); // solo la manana
    await punch(emp, '2026-03-03 12:00', 'out');
    await run(emp, '2026-03-02', '2026-03-03');
    const r = await results(emp);
    expect(r.get('2026-03-02')).toMatchObject({ day_result: 'present', worked_hours: 8.03 });
    expect((r.get('2026-03-02')?.segments as unknown[]).length).toBe(2);
    expect(r.get('2026-03-03')).toMatchObject({ day_result: 'partial_absence', reason: 'missing_segment' });
  });

  it('falta por retardos acumulados se reinicia al recalcular un subrango', async () => {
    const emp = await newEmployee();
    await assign(emp, await newShift('Oficina', '09:00', '18:00', 60));
    for (const day of ['02', '03', '04', '05']) {
      await punch(emp, `2026-03-${day} 09:20`, 'in');
      await punch(emp, `2026-03-${day} 18:00`, 'out');
    }
    await run(emp, '2026-03-02', '2026-03-05');
    let r = await results(emp);
    expect(['02', '03', '04', '05'].map((d) => r.get(`2026-03-${d}`)?.late_abs)).toEqual([false, false, true, false]);

    // Recalcular solo el 02 no debe perder la marca del 04 (lee el periodo completo).
    await run(emp, '2026-03-02', '2026-03-02');
    r = await results(emp);
    expect(r.get('2026-03-04')?.late_abs).toBe(true);

    // Si el 03 deja de ser retardo, quedan 3 retardos (02, 04, 05) y la marca pasa al 05:
    await punch(emp, '2026-03-03 08:59', 'in'); // el rebote no aplica (otra hora); la primera 'in' ahora es 08:59
    await run(emp, '2026-03-03', '2026-03-03');
    r = await results(emp);
    expect(r.get('2026-03-03')?.day_result).toBe('present');
    expect(['02', '03', '04', '05'].map((d) => r.get(`2026-03-${d}`)?.late_abs)).toEqual([false, false, false, true]);
  });

  it('omite fechas anteriores al ingreso y colaboradores no habilitados', async () => {
    const emp = await newEmployee('2026-03-04');
    await assign(emp, await newShift('Oficina', '09:00', '18:00'));
    const summary = await run(emp, '2026-03-02', '2026-03-05');
    expect(summary.days).toBe(2);
    expect([...(await results(emp)).keys()]).toEqual(['2026-03-04', '2026-03-05']);

    const off = await newEmployee();
    await client.query('UPDATE attendance.employee_profiles SET is_enabled = FALSE WHERE employee_id = $1', [off]);
    expect(await run(off, '2026-03-02', '2026-03-05')).toEqual({ employees: 0, days: 0 });
  });

  it('colaborador sin ningun horario queda sin_horario', async () => {
    const emp = await newEmployee();
    await run(emp, '2026-03-02', '2026-03-02');
    expect((await results(emp)).get('2026-03-02')).toMatchObject({ day_result: 'no_schedule' });
  });
});
