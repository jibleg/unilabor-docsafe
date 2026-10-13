import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../config/db';
import { AUTO_SYNC_MAX_RETRIES, reconcileRows } from './device-reconcile.service';

/**
 * Pruebas contra la BD LOCAL, cada caso en una transaccion que se revierte. Usan el primer agente activo y una
 * segunda sucursal existente; si no hay datos suficientes se omiten.
 */

let agent: { id: number; branch: number } | null = null;
let otherBranch: number | null = null;

beforeAll(async () => {
  try {
    const a = await pool.query<{ id: string; branch_id: string }>(
      `SELECT id, branch_id FROM attendance.agents WHERE is_active ORDER BY id LIMIT 1`,
    );
    if (a.rows[0]) agent = { id: Number(a.rows[0].id), branch: Number(a.rows[0].branch_id) };
    if (agent) {
      const b = await pool.query<{ id: string }>(
        `SELECT id FROM public.helpdesk_asset_units WHERE is_active AND id <> $1 ORDER BY id LIMIT 1`,
        [agent.branch],
      );
      otherBranch = b.rows[0] ? Number(b.rows[0].id) : null;
    }
  } catch {
    agent = null;
  }
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

let client: PoolClient;
let seq = 0;

beforeEach(async (ctx) => {
  if (!agent || !otherBranch) return ctx.skip();
  client = await pool.connect();
  await client.query('BEGIN');
});

afterEach(async () => {
  if (client) {
    await client.query('ROLLBACK');
    client.release();
  }
});

interface Seed {
  enabled?: boolean;
  active?: boolean;
  /** Sucursal base del colaborador. */
  branch?: number;
  number?: string | null;
  photo?: boolean;
  /** Registro de sincronizacion en el reloj de prueba (agent.branch); omitido = no hay fila. */
  row?: {
    status?: string;
    syncedNumber?: string | null;
    attempts?: number;
    faceStatus?: string;
    faceAttempts?: number;
    extra?: boolean;
  };
}

const seed = async (o: Seed = {}): Promise<number> => {
  seq += 1;
  const code = `T-${Date.now()}-${seq}`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO public.employees (employee_code, full_name, email, branch_id, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [code, `Prueba ${code}`, `${code.toLowerCase()}@test.local`, o.branch ?? agent!.branch, o.active ?? true],
  );
  const id = Number(rows[0]?.id);
  await client.query(
    `INSERT INTO attendance.employee_profiles (employee_id, is_enabled, device_employee_number, face_photo_path)
     VALUES ($1, $2, $3, $4)`,
    [
      id, o.enabled ?? true,
      o.number === undefined ? `7${String(seq).padStart(3, '0')}${String(Date.now()).slice(-6)}` : o.number,
      o.photo ? `${id}/x.jpg` : null,
    ],
  );
  if (o.row) {
    await client.query(
      `INSERT INTO attendance.employee_device_branches
         (employee_id, branch_id, is_extra, sync_status, synced_number, sync_attempts, face_sync_status, face_sync_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id, agent!.branch, o.row.extra ?? false, o.row.status ?? 'pending', o.row.syncedNumber ?? null,
        o.row.attempts ?? 0, o.row.faceStatus ?? (o.photo ? 'pending' : 'not_applicable'), o.row.faceAttempts ?? 0,
      ],
    );
  }
  return id;
};

const run = (employeeId: number, auto = false, all = false) =>
  reconcileRows(client, agent!.id, agent!.branch, { all, auto, userId: null, employeeIds: [employeeId] });

const orders = async (employeeId: number) =>
  (await client.query<{ order_type: string; payload: Record<string, unknown> }>(
    `SELECT order_type, payload FROM attendance.agent_orders WHERE employee_id = $1 ORDER BY id`,
    [employeeId],
  )).rows;

const rowOf = async (employeeId: number) =>
  (await client.query(
    `SELECT * FROM attendance.employee_device_branches WHERE employee_id = $1 AND branch_id = $2`,
    [employeeId, agent!.branch],
  )).rows[0] as Record<string, unknown> | undefined;

const profileStatus = async (employeeId: number) =>
  (await client.query('SELECT device_sync_status, face_sync_status FROM attendance.employee_profiles WHERE employee_id = $1', [employeeId])).rows[0];

describe('sincronizacion automatica con el reloj', () => {
  it('habilitado y sin registro: lo crea y encola el alta', async () => {
    const id = await seed();
    const result = await run(id);
    expect(result.queued_sync).toBe(1);
    expect((await orders(id)).map((o) => o.order_type)).toEqual(['sync_person']);
    expect(await rowOf(id)).toMatchObject({ sync_status: 'pending', is_extra: false });
    expect((await profileStatus(id)).device_sync_status).toBe('pending');
  });

  it('no duplica ordenes abiertas', async () => {
    const id = await seed();
    await run(id);
    expect((await run(id)).queued).toBe(0);
    expect(await orders(id)).toHaveLength(1);
  });

  it('al deshabilitar a quien esta en el reloj: encola la baja y queda pendiente', async () => {
    const id = await seed({ enabled: false, row: { status: 'synced', syncedNumber: '555001' } });
    expect((await run(id)).queued_remove).toBe(1);
    expect((await orders(id))[0]).toMatchObject({ order_type: 'remove_person', payload: { employeeNo: '555001' } });
    expect((await orders(id))[0]?.payload.replaced).toBeUndefined();
    expect(await rowOf(id)).toMatchObject({ sync_status: 'pending' });
    expect((await profileStatus(id)).device_sync_status).toBe('pending');
  });

  it('un colaborador inactivo en RH tambien se da de baja', async () => {
    const id = await seed({ active: false, row: { status: 'synced', syncedNumber: '555001' } });
    expect((await run(id)).queued_remove).toBe(1);
  });

  it('cambio de numero: baja del anterior y alta del nuevo, en ese orden', async () => {
    const id = await seed({ number: '555002', row: { status: 'synced', syncedNumber: '555001' } });
    await run(id);
    const list = await orders(id);
    expect(list.map((o) => o.order_type)).toEqual(['remove_person', 'sync_person']);
    expect(list[0]?.payload).toMatchObject({ employeeNo: '555001', replaced: true });
    expect(list[1]?.payload).toMatchObject({ employeeNo: '555002' });
  });

  it('cambio de sucursal base: se da de baja de este reloj', async () => {
    const id = await seed({ branch: otherBranch!, row: { status: 'synced', syncedNumber: '555001' } });
    expect((await run(id)).queued_remove).toBe(1);
    expect((await orders(id))[0]).toMatchObject({ order_type: 'remove_person' });
  });

  it('sucursal adicional elegida (chofer): se da de alta tambien en este reloj', async () => {
    const id = await seed({ branch: otherBranch!, row: { extra: true } });
    const result = await run(id);
    expect(result.queued_sync).toBe(1);
    expect(await rowOf(id)).toMatchObject({ is_extra: true, sync_status: 'pending' });
  });

  it('adicional retirada: se da de baja de ese reloj', async () => {
    const id = await seed({ branch: otherBranch!, row: { extra: false, status: 'synced', syncedNumber: '555001' } });
    expect((await run(id)).queued_remove).toBe(1);
  });

  it('deshabilitado con adicional elegida y sin estar en el reloj: no hace nada y conserva la seleccion', async () => {
    const id = await seed({ enabled: false, branch: otherBranch!, row: { extra: true } });
    expect((await run(id)).queued).toBe(0);
    expect(await rowOf(id)).toBeDefined();
  });

  it('registro sobrante (no debe estar ni esta): se limpia', async () => {
    const id = await seed({ branch: otherBranch!, row: { extra: false } });
    await run(id);
    expect(await rowOf(id)).toBeUndefined();
  });

  it('ya sincronizado y sin cambios: no hace nada, salvo reenvio total', async () => {
    const id = await seed({ number: '555001', row: { status: 'synced', syncedNumber: '555001' } });
    expect((await run(id)).queued).toBe(0);
    expect((await run(id, false, true)).queued_sync).toBe(1);
  });

  it('numero con letras o vacio no se sincroniza', async () => {
    const letters = await seed({ number: `AB-${Date.now()}`.slice(0, 20) });
    const empty = await seed({ number: null });
    expect((await run(letters)).skipped_invalid_number).toBe(1);
    expect((await run(empty)).skipped_without_number).toBe(1);
  });

  it('tope de reintentos: la red de seguridad se detiene; la accion manual lo reinicia', async () => {
    const id = await seed({ row: { status: 'error', attempts: AUTO_SYNC_MAX_RETRIES } });
    expect((await run(id, true)).skipped_max_retries).toBe(1);
    expect(await orders(id)).toHaveLength(0);
    expect((await run(id, false)).queued_sync).toBe(1);
    expect(await rowOf(id)).toMatchObject({ sync_attempts: 0 });
  });

  it('reintento automatico bajo el tope: cuenta el intento', async () => {
    const id = await seed({ row: { status: 'error', attempts: 1 } });
    expect((await run(id, true)).queued_sync).toBe(1);
    expect(await rowOf(id)).toMatchObject({ sync_attempts: 2 });
  });

  it('con foto: viaja despues del alta; si ya esta en el reloj, sola', async () => {
    const fresh = await seed({ photo: true });
    await run(fresh);
    expect((await orders(fresh)).map((o) => o.order_type)).toEqual(['sync_person', 'upload_face']);
    const synced = await seed({ number: '555001', photo: true, row: { status: 'synced', syncedNumber: '555001', faceStatus: 'pending' } });
    await run(synced);
    expect((await orders(synced)).map((o) => o.order_type)).toEqual(['upload_face']);
  });

  it('foto con error: respeta su propio tope', async () => {
    const id = await seed({
      number: '555001', photo: true,
      row: { status: 'synced', syncedNumber: '555001', faceStatus: 'error', faceAttempts: AUTO_SYNC_MAX_RETRIES },
    });
    expect((await run(id, true)).skipped_max_retries).toBe(1);
    expect(await orders(id)).toHaveLength(0);
  });

  it('el resumen del perfil refleja todos los relojes', async () => {
    const id = await seed({ number: '555001', row: { status: 'synced', syncedNumber: '555001' } });
    await run(id);
    expect((await profileStatus(id)).device_sync_status).toBe('synced');
    await client.query('UPDATE attendance.employee_device_branches SET sync_status = $2 WHERE employee_id = $1', [id, 'error']);
    await run(id, true);
    expect((await profileStatus(id)).device_sync_status).toBe('pending');
  });
});
