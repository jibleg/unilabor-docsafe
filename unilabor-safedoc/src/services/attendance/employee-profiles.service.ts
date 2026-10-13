import type { PoolClient } from 'pg';
import pool from '../../config/db';
import type {
  BulkEnableInput,
  EmployeesQuery,
  UpdateEmployeeProfileInput,
} from '../../schemas/attendance/employees.schema';
import { buildPaginatedResult, resolvePagination } from '../../utils/pagination';
import { withTransaction, type Queryable } from '../../utils/transaction';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { triggerEmployeeDeviceSync } from './device-reconcile.service';
import { isDeviceNumber } from './device-number';

/** Colaboradores de RH habilitados (o no) para el control de asistencia. */

export type SyncStatus = 'not_applicable' | 'pending' | 'synced' | 'error';

export interface AttendanceEmployee {
  id: number;
  employee_code: string;
  full_name: string;
  email: string | null;
  area: string | null;
  position: string | null;
  is_active: boolean;
  branch_id: number | null;
  branch_name: string | null;
  hire_date: string | null;
  is_enabled: boolean;
  device_employee_number: string | null;
  suggested_device_number: string | null;
  device_sync_status: SyncStatus;
  device_sync_error: string | null;
  device_synced_at: string | null;
  has_schedule: boolean;
  number_locked: boolean;
  has_face_photo: boolean;
  face_photo_updated_at: string | null;
  face_sync_status: SyncStatus;
  face_sync_error: string | null;
  /** Relojes (sucursales) donde se registra: la base y las adicionales, con su estado de sincronizacion. */
  device_branches: DeviceBranchView[];
  /** Con que metodos biometricos puede checar (por lo registrado en DocSafe y las checadas que ya hizo). */
  biometrics: { fingerprint: boolean; face: boolean };
}

export interface DeviceBranchView {
  branch_id: number;
  branch_name: string | null;
  /** Seleccionada a mano como adicional a la sucursal base. */
  is_extra: boolean;
  sync_status: SyncStatus;
  sync_error: string | null;
  face_sync_status: SyncStatus;
  face_sync_error: string | null;
  on_device: boolean;
}


/** El numero de empleado se SUGIERE desde el codigo de empleado (nunca se asigna solo). */
export const suggestDeviceNumber = (employeeCode: string | null | undefined): string | null => {
  const code = (employeeCode ?? '').trim();
  return isDeviceNumber(code) ? code : null;
};

export interface ProfileState {
  is_enabled: boolean;
  device_employee_number: string | null;
  branch_id: number | null;
}

/** Mensaje si el estado final no permite habilitar; null si es valido. */
export const enableViolation = (state: ProfileState): string | null => {
  if (!state.is_enabled) return null;
  if (state.branch_id === null) return 'Asigna una sucursal antes de habilitar al colaborador.';
  if (!state.device_employee_number) return 'Captura el numero de empleado antes de habilitar al colaborador.';
  return null;
};

/** Estado de sincronizacion con el reloj tras un cambio; null = no cambia. */
export const nextSyncStatus = (before: ProfileState, after: ProfileState, onTerminal = false): SyncStatus | null => {
  const changed =
    before.is_enabled !== after.is_enabled ||
    before.branch_id !== after.branch_id ||
    (before.device_employee_number ?? '').toUpperCase() !== (after.device_employee_number ?? '').toUpperCase();
  if (!changed) return null;
  // Deshabilitado pero todavia dado de alta en el reloj: queda pendiente de baja.
  return after.is_enabled || onTerminal ? 'pending' : 'not_applicable';
};

const SCHEDULE_EXISTS = `EXISTS (
  SELECT 1 FROM attendance.shift_assignments sa
   WHERE sa.employee_id = e.id AND sa.shift_id IS NOT NULL
     AND (sa.end_date IS NULL OR sa.end_date >= CURRENT_DATE))`;

const EMPLOYEE_SELECT = `
  SELECT e.id::int AS id, e.employee_code, e.full_name, e.email, e.area, e.position, e.is_active,
         e.branch_id::int AS branch_id, b.name AS branch_name, e.hire_date::text AS hire_date,
         COALESCE(p.is_enabled, FALSE) AS is_enabled, p.device_employee_number,
         COALESCE(p.device_sync_status, 'not_applicable') AS device_sync_status,
         p.device_sync_error,
         to_char(p.device_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS device_synced_at,
         (p.face_photo_path IS NOT NULL) AS has_face_photo,
         to_char(p.face_photo_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS face_photo_updated_at,
         COALESCE(p.face_sync_status, 'not_applicable') AS face_sync_status,
         p.face_sync_error,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'branch_id', r.branch_id, 'branch_name', rb.name, 'is_extra', r.is_extra,
                    'sync_status', r.sync_status, 'sync_error', r.sync_error,
                    'face_sync_status', r.face_sync_status, 'face_sync_error', r.face_sync_error,
                    'on_device', r.synced_number IS NOT NULL) ORDER BY rb.name)
             FROM attendance.employee_device_branches r
             JOIN public.helpdesk_asset_units rb ON rb.id = r.branch_id
            WHERE r.employee_id = e.id), '[]'::json) AS device_branches,
         (EXISTS (SELECT 1 FROM attendance.agent_orders o
                   WHERE o.employee_id = e.id AND o.order_type = 'enroll_fingerprint' AND o.order_status = 'done')
          OR EXISTS (SELECT 1 FROM attendance.punches pu
                      WHERE pu.employee_id = e.id AND pu.verification_method = 'fingerprint')) AS has_fingerprint,
         (EXISTS (SELECT 1 FROM attendance.employee_device_branches fr
                   WHERE fr.employee_id = e.id AND fr.face_sync_status = 'synced')
          OR EXISTS (SELECT 1 FROM attendance.agent_orders o
                      WHERE o.employee_id = e.id AND o.order_type = 'enroll_face' AND o.order_status = 'done')
          OR EXISTS (SELECT 1 FROM attendance.punches pu
                      WHERE pu.employee_id = e.id AND pu.verification_method = 'face')) AS has_face,
         ${SCHEDULE_EXISTS} AS has_schedule,
         (p.device_employee_number IS NOT NULL AND EXISTS (
           SELECT 1 FROM attendance.punches pu
            WHERE pu.employee_id = e.id OR UPPER(pu.device_employee_number) = UPPER(p.device_employee_number)
         )) AS number_locked
    FROM public.employees e
    LEFT JOIN public.helpdesk_asset_units b ON b.id = e.branch_id
    LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id`;

type EmployeeRow = Omit<AttendanceEmployee, 'suggested_device_number' | 'biometrics'> & {
  has_fingerprint: boolean;
  has_face: boolean;
};

const withSuggestion = ({ has_fingerprint, has_face, ...row }: EmployeeRow): AttendanceEmployee => ({
  ...row,
  suggested_device_number: suggestDeviceNumber(row.employee_code),
  biometrics: { fingerprint: Boolean(has_fingerprint), face: Boolean(has_face) },
});

const buildFilters = (query: EmployeesQuery): { where: string; values: unknown[] } => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    conditions.push(sql(values.length));
  };
  if (!query.include_inactive) conditions.push('e.is_active');
  if (query.branch_id !== undefined) add((n) => `e.branch_id = $${n}`, query.branch_id);
  if (query.enabled !== undefined) {
    conditions.push(query.enabled ? 'COALESCE(p.is_enabled, FALSE)' : 'NOT COALESCE(p.is_enabled, FALSE)');
  }
  if (query.sync_status !== undefined) {
    add((n) => `COALESCE(p.device_sync_status, 'not_applicable') = $${n}`, query.sync_status);
  }
  if (query.without_schedule) conditions.push(`COALESCE(p.is_enabled, FALSE) AND NOT ${SCHEDULE_EXISTS}`);
  if (query.search) {
    add(
      (n) => `(e.full_name ILIKE $${n} OR e.employee_code ILIKE $${n} OR p.device_employee_number ILIKE $${n})`,
      `%${query.search}%`,
    );
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', values };
};

export const listAttendanceEmployees = async (query: EmployeesQuery) => {
  const { page, limit, offset } = resolvePagination(query);
  const { where, values } = buildFilters(query);
  const [data, count] = await Promise.all([
    pool.query(`${EMPLOYEE_SELECT} ${where} ORDER BY e.full_name, e.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [
      ...values,
      limit,
      offset,
    ]),
    pool.query(
      `SELECT COUNT(*) AS total FROM public.employees e
         LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id ${where}`,
      values,
    ),
  ]);
  return buildPaginatedResult(data.rows.map(withSuggestion), count.rows[0]?.total, page, limit);
};

export const getAttendanceEmployee = async (id: number, db: Queryable = pool): Promise<AttendanceEmployee> => {
  const { rows } = await db.query(`${EMPLOYEE_SELECT} WHERE e.id = $1`, [id]);
  const row = rows[0];
  return row ? withSuggestion(row) : notFound('Colaborador no encontrado.');
};

export interface EmployeesSummary {
  enabled: number;
  without_branch: number;
  without_device_number: number;
  pending_sync: number;
  without_schedule: number;
  sync_error: number;
}

export const getEmployeesSummary = async (branchId?: number): Promise<EmployeesSummary> => {
  const values: unknown[] = [];
  let branchFilter = '';
  if (branchId !== undefined) {
    values.push(branchId);
    branchFilter = 'AND e.branch_id = $1';
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS enabled,
            COUNT(*) FILTER (WHERE e.branch_id IS NULL)::int AS without_branch,
            COUNT(*) FILTER (WHERE p.device_employee_number IS NULL)::int AS without_device_number,
            COUNT(*) FILTER (WHERE p.device_sync_status = 'pending')::int AS pending_sync,
            COUNT(*) FILTER (WHERE NOT ${SCHEDULE_EXISTS})::int AS without_schedule,
            COUNT(*) FILTER (WHERE p.device_sync_status = 'error')::int AS sync_error
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE p.is_enabled AND e.is_active ${branchFilter}`,
    values,
  );
  return rows[0] as EmployeesSummary;
};

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string })?.code === '23505';

const assertBranchExists = async (db: Queryable, branchId: number): Promise<void> => {
  const { rows } = await db.query('SELECT 1 FROM public.helpdesk_asset_units WHERE id = $1 AND is_active', [branchId]);
  if (rows.length === 0) invalid('La sucursal indicada no existe o esta inactiva.');
};

const assertDeviceNumberFree = async (db: Queryable, employeeId: number, deviceNumber: string): Promise<void> => {
  const { rows } = await db.query(
    `SELECT e.full_name FROM attendance.employee_profiles p JOIN public.employees e ON e.id = p.employee_id
      WHERE upper(p.device_employee_number) = upper($1) AND p.employee_id <> $2`,
    [deviceNumber, employeeId],
  );
  if (rows.length > 0) conflict(`El numero de empleado ${deviceNumber} ya lo usa ${rows[0].full_name}.`);
};

const sameNumber = (a: string | null, b: string | null): boolean => (a ?? '').toUpperCase() === (b ?? '').toUpperCase();

/** Con checadas registradas el numero de empleado queda fijo: es el vinculo de la evidencia con la persona. */
const assertNumberEditable = async (
  db: Queryable,
  employeeId: number,
  before: string | null,
  after: string | null,
): Promise<void> => {
  if (!before || sameNumber(before, after)) return;
  const { rows } = await db.query(
    `SELECT 1 FROM attendance.punches WHERE employee_id = $1 OR UPPER(device_employee_number) = UPPER($2) LIMIT 1`,
    [employeeId, before],
  );
  if (rows.length > 0) {
    conflict(`El numero de empleado ${before} ya tiene checadas y no se puede cambiar.`);
  }
};

interface StoredEmployee extends ProfileState {
  is_active: boolean;
  hire_date: string | null;
  /** Esta dado de alta en algun reloj (si se deshabilita, queda pendiente de baja). */
  on_terminal: boolean;
}

const loadStoredState = async (db: Queryable, employeeId: number, lock: boolean): Promise<StoredEmployee> => {
  const { rows } = await db.query(
    `SELECT e.is_active, e.branch_id::int AS branch_id, e.hire_date::text AS hire_date,
            COALESCE(p.is_enabled, FALSE) AS is_enabled, p.device_employee_number,
            EXISTS (SELECT 1 FROM attendance.employee_device_branches r
                     WHERE r.employee_id = e.id AND r.synced_number IS NOT NULL) AS on_terminal
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1 ${lock ? 'FOR UPDATE OF e' : ''}`,
    [employeeId],
  );
  return rows[0] ?? notFound('Colaborador no encontrado.');
};

/** Fusiona el cambio parcial sobre el estado guardado (sin asignar undefined). */
export const mergeProfileState = (before: StoredEmployee, input: UpdateEmployeeProfileInput): StoredEmployee => ({
  ...before,
  ...(input.is_enabled !== undefined ? { is_enabled: input.is_enabled } : {}),
  ...(input.device_employee_number !== undefined ? { device_employee_number: input.device_employee_number } : {}),
  ...(input.branch_id !== undefined ? { branch_id: input.branch_id } : {}),
  ...(input.hire_date !== undefined ? { hire_date: input.hire_date } : {}),
});

const writeEmployeeAndProfile = async (
  client: PoolClient,
  employeeId: number,
  before: StoredEmployee,
  after: StoredEmployee,
): Promise<void> => {
  await assertNumberEditable(client, employeeId, before.device_employee_number, after.device_employee_number);
  if (before.branch_id !== after.branch_id || before.hire_date !== after.hire_date) {
    await client.query('UPDATE public.employees SET branch_id = $2, hire_date = $3 WHERE id = $1', [
      employeeId,
      after.branch_id,
      after.hire_date,
    ]);
  }
  const syncStatus = nextSyncStatus(before, after, before.on_terminal);
  await client.query(
    `INSERT INTO attendance.employee_profiles (employee_id, is_enabled, device_employee_number, device_sync_status)
     VALUES ($1, $2, $3, COALESCE($4, 'not_applicable'))
     ON CONFLICT (employee_id) DO UPDATE SET
       is_enabled = EXCLUDED.is_enabled,
       device_employee_number = EXCLUDED.device_employee_number,
       device_sync_status = COALESCE($4, attendance.employee_profiles.device_sync_status),
       device_sync_error = CASE WHEN $4 IS NULL THEN attendance.employee_profiles.device_sync_error ELSE NULL END,
       device_sync_attempts = CASE WHEN $4 IS NULL THEN attendance.employee_profiles.device_sync_attempts ELSE 0 END`,
    [employeeId, after.is_enabled, after.device_employee_number, syncStatus],
  );
  if (syncStatus !== null) {
    // Un cambio relevante da otra oportunidad a los reintentos automaticos de todos sus relojes.
    await client.query(
      'UPDATE attendance.employee_device_branches SET sync_attempts = 0, face_sync_attempts = 0 WHERE employee_id = $1',
      [employeeId],
    );
  }
};

const auditEmployee = (userId: string, action: string, employeeId: number, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_employee_profile',
    entity_id: employeeId,
    employee_id: employeeId,
    metadata,
  }).catch(() => undefined);

/**
 * Define en que relojes MAS (ademas de la sucursal base) se registra el colaborador. Quitar uno deja la fila sin
 * seleccion y la sincronizacion lo da de baja de ese reloj; se conservan las filas para no perder el estado.
 */
const applyExtraBranches = async (
  client: PoolClient,
  employeeId: number,
  branchIds: number[],
  baseBranchId: number | null,
): Promise<void> => {
  const wanted = [...new Set(branchIds)].filter((id) => id !== baseBranchId);
  for (const id of wanted) await assertBranchExists(client, id);
  await client.query(
    `UPDATE attendance.employee_device_branches SET is_extra = FALSE, sync_attempts = 0
      WHERE employee_id = $1 AND is_extra AND NOT (branch_id = ANY($2::bigint[]))`,
    [employeeId, wanted],
  );
  if (wanted.length === 0) return;
  await client.query(
    `INSERT INTO attendance.employee_device_branches (employee_id, branch_id, is_extra, face_sync_status)
     SELECT $1, b, TRUE, CASE WHEN p.face_photo_path IS NULL THEN 'not_applicable' ELSE 'pending' END
       FROM UNNEST($2::bigint[]) AS b
       JOIN attendance.employee_profiles p ON p.employee_id = $1
     ON CONFLICT (employee_id, branch_id) DO UPDATE SET is_extra = TRUE, sync_attempts = 0, face_sync_attempts = 0`,
    [employeeId, wanted],
  );
};

export const updateAttendanceEmployee = async (
  employeeId: number,
  input: UpdateEmployeeProfileInput,
  userId: string,
): Promise<AttendanceEmployee> => {
  try {
    await withTransaction(async (client) => {
      const before = await loadStoredState(client, employeeId, true);
      const after = mergeProfileState(before, input);
      const violation = enableViolation(after);
      if (violation) invalid(violation);
      if (after.is_enabled && !after.is_active) invalid('No se puede habilitar a un colaborador inactivo.');
      if (input.branch_id) await assertBranchExists(client, input.branch_id);
      if (after.device_employee_number) await assertDeviceNumberFree(client, employeeId, after.device_employee_number);
      await writeEmployeeAndProfile(client, employeeId, before, after);
      if (input.extra_branch_ids !== undefined) {
        await applyExtraBranches(client, employeeId, input.extra_branch_ids, after.branch_id);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return conflict('Ese numero de empleado ya lo usa otro colaborador.');
    throw error;
  }
  await auditEmployee(userId, 'attendance_employee_updated', employeeId, { ...input });
  // Lo que afecta al reloj (alta, baja, numero, sucursal) se encola solo; no espera a que alguien pulse Sincronizar.
  await triggerEmployeeDeviceSync([employeeId], userId);
  return getAttendanceEmployee(employeeId);
};

export interface BulkRowError {
  employee_id: number;
  message: string;
}

/** Resuelve las filas del lote a un cambio por colaborador, juntando todos los errores. */
const validateBulkRows = async (db: Queryable, input: BulkEnableInput) => {
  const errors: BulkRowError[] = [];
  const planned: Array<{ id: number; before: StoredEmployee; after: StoredEmployee }> = [];
  const seenNumbers = new Map<string, number>();
  const seenEmployees = new Set<number>();

  for (const row of input.rows) {
    const fail = (message: string) => errors.push({ employee_id: row.employee_id, message });
    if (seenEmployees.has(row.employee_id)) {
      fail('El colaborador aparece repetido en el lote.');
      continue;
    }
    seenEmployees.add(row.employee_id);
    const numberKey = row.device_employee_number.toUpperCase();
    const duplicateOf = seenNumbers.get(numberKey);
    if (duplicateOf !== undefined) {
      fail(`El numero de empleado ${row.device_employee_number} se repite con el colaborador ${duplicateOf}.`);
      continue;
    }
    seenNumbers.set(numberKey, row.employee_id);

    const { rows } = await db.query('SELECT 1 FROM public.employees WHERE id = $1', [row.employee_id]);
    if (rows.length === 0) {
      fail('Colaborador no encontrado.');
      continue;
    }
    const before = await loadStoredState(db, row.employee_id, true);
    const branchId = row.branch_id ?? input.default_branch_id ?? before.branch_id;
    const after: StoredEmployee = {
      ...before,
      is_enabled: true,
      device_employee_number: row.device_employee_number,
      branch_id: branchId,
    };
    const problem =
      (!before.is_active ? 'El colaborador esta inactivo.' : null) ??
      (before.is_enabled ? 'El colaborador ya esta habilitado; editalo desde su ficha.' : null) ??
      enableViolation(after);
    if (problem) {
      fail(problem);
      continue;
    }
    try {
      if (branchId !== null) await assertBranchExists(db, branchId);
      await assertDeviceNumberFree(db, row.employee_id, row.device_employee_number);
    } catch (error) {
      fail((error as { publicMessage?: string }).publicMessage ?? 'Fila invalida.');
      continue;
    }
    planned.push({ id: row.employee_id, before, after });
  }
  return { errors, planned };
};

class BulkValidationAbort extends Error {
  constructor(readonly rowErrors: BulkRowError[]) {
    super('bulk validation failed');
  }
}

export const bulkEnableEmployees = async (input: BulkEnableInput, userId: string) => {
  try {
    const planned = await withTransaction(async (client) => {
      const result = await validateBulkRows(client, input);
      if (result.errors.length > 0) throw new BulkValidationAbort(result.errors);
      for (const item of result.planned) await writeEmployeeAndProfile(client, item.id, item.before, item.after);
      return result.planned;
    });
    for (const item of planned) {
      await auditEmployee(userId, 'attendance_employee_bulk_enabled', item.id, {
        device_employee_number: item.after.device_employee_number,
        branch_id: item.after.branch_id,
      });
    }
    await triggerEmployeeDeviceSync(planned.map((item) => item.id), userId);
    return { enabled: planned.length, employee_ids: planned.map((item) => item.id) };
  } catch (error) {
    if (error instanceof BulkValidationAbort) {
      return invalid('Hay filas con errores; no se habilito a nadie.', { rows: error.rowErrors });
    }
    if (isUniqueViolation(error)) return conflict('Un numero de empleado del lote ya lo usa otro colaborador.');
    throw error;
  }
};

export interface BranchRow {
  id: number;
  code: string;
  name: string;
}

export const listBranches = async (): Promise<BranchRow[]> => {
  const { rows } = await pool.query<BranchRow>(
    `SELECT id::int AS id, code, name FROM public.helpdesk_asset_units
      WHERE is_active ORDER BY sort_order, name`,
  );
  return rows;
};
