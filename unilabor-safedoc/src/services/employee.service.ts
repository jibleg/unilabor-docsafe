import crypto from 'crypto';
import type { PoolClient } from 'pg';
import pool from '../config/db';
import { listUserModuleAccess } from './module-access.service';
import type { EmployeeRecord, EmployeeSummary, LinkableUser } from '../types';

export interface EmployeePayload {
  employee_code?: string | null;
  user_id?: string | null;
  full_name: string;
  email: string;
  area?: string | null;
  position?: string | null;
}

const employeesTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.employees') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const mapEmployeeRow = async (row: any): Promise<EmployeeRecord> => {
  const linkedUser =
    row.user_id && row.user_email && row.user_full_name && row.user_role
      ? {
          id: String(row.user_id),
          email: String(row.user_email),
          full_name: String(row.user_full_name),
          role: String(row.user_role).toUpperCase() as LinkableUser['role'],
          modules: await listUserModuleAccess(String(row.user_id), row.user_role),
        }
      : null;

  const employee: EmployeeRecord = {
    id: Number(row.id),
    employee_code: String(row.employee_code),
    user_id: row.user_id ? String(row.user_id) : null,
    full_name: String(row.full_name),
    email: String(row.email),
    area: row.area ? String(row.area) : null,
    position: row.position ? String(row.position) : null,
    is_active: Boolean(row.is_active),
    linked_user: linkedUser,
  };

  if (row.created_at) {
    employee.created_at = String(row.created_at);
  }

  if (row.updated_at) {
    employee.updated_at = String(row.updated_at);
  }

  return employee;
};

const assertEmployeesTable = async () => {
  const exists = await employeesTableExists();
  if (!exists) {
    const error = new Error('EMPLOYEES_TABLE_NOT_AVAILABLE');
    (error as any).code = 'EMPLOYEES_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const ensureUniqueEmployeeEmail = async (
  client: PoolClient,
  email: string,
  employeeId?: number,
) => {
  const result = await client.query(
    `
      SELECT id
      FROM public.employees
      WHERE LOWER(email) = LOWER($1)
        AND ($2::bigint IS NULL OR id <> $2::bigint)
      LIMIT 1;
    `,
    [email, employeeId ?? null],
  );

  if (result.rows.length > 0) {
    const error = new Error('EMPLOYEE_EMAIL_ALREADY_EXISTS');
    (error as any).code = 'EMPLOYEE_EMAIL_ALREADY_EXISTS';
    throw error;
  }
};

const ensureLinkedUserIsAvailable = async (
  client: PoolClient,
  userId: string | null,
  employeeId?: number,
) => {
  if (!userId) {
    return;
  }

  const userResult = await client.query(
    `
      SELECT id, is_active
      FROM public.users
      WHERE id = $1
      LIMIT 1;
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    const error = new Error('LINKED_USER_NOT_FOUND');
    (error as any).code = 'LINKED_USER_NOT_FOUND';
    throw error;
  }

  if (userResult.rows[0]?.is_active === false) {
    const error = new Error('LINKED_USER_INACTIVE');
    (error as any).code = 'LINKED_USER_INACTIVE';
    throw error;
  }

  const employeeResult = await client.query(
    `
      SELECT id
      FROM public.employees
      WHERE user_id = $1
        AND ($2::bigint IS NULL OR id <> $2::bigint)
      LIMIT 1;
    `,
    [userId, employeeId ?? null],
  );

  if (employeeResult.rows.length > 0) {
    const error = new Error('USER_ALREADY_LINKED_TO_EMPLOYEE');
    (error as any).code = 'USER_ALREADY_LINKED_TO_EMPLOYEE';
    throw error;
  }
};

const generateEmployeeIdentity = async (
  client: PoolClient,
): Promise<{ id: number; employeeCode: string }> => {
  const sequenceResult = await client.query(
    `SELECT nextval(pg_get_serial_sequence('public.employees', 'id')) AS next_id;`,
  );

  const nextId = Number(sequenceResult.rows[0]?.next_id ?? 0);
  if (Number.isFinite(nextId) && nextId > 0) {
    return {
      id: nextId,
      employeeCode: `COL-${String(nextId).padStart(5, '0')}`,
    };
  }

  return {
    id: 0,
    employeeCode: `COL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
  };
};

const buildEmployeeBaseQuery = () => `
  SELECT
    e.id,
    e.employee_code,
    e.user_id,
    e.full_name,
    e.email,
    e.area,
    e.position,
    e.is_active,
    e.created_at,
    e.updated_at,
    u.email AS user_email,
    u.full_name AS user_full_name,
    u.role AS user_role
  FROM public.employees e
  LEFT JOIN public.users u ON u.id = e.user_id
`;

export const listEmployees = async (): Promise<EmployeeRecord[]> => {
  await assertEmployeesTable();

  const result = await pool.query(`
    ${buildEmployeeBaseQuery()}
    WHERE e.is_active = TRUE
    ORDER BY e.full_name ASC, e.created_at DESC;
  `);

  return Promise.all(result.rows.map((row) => mapEmployeeRow(row)));
};

export const getEmployeeById = async (employeeId: number): Promise<EmployeeRecord | null> => {
  await assertEmployeesTable();

  const result = await pool.query(
    `
      ${buildEmployeeBaseQuery()}
      WHERE e.id = $1
      LIMIT 1;
    `,
    [employeeId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapEmployeeRow(result.rows[0]);
};

export const createEmployee = async (payload: EmployeePayload): Promise<EmployeeRecord> => {
  await assertEmployeesTable();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const normalizedEmail = normalizeEmail(payload.email);
    const normalizedUserId = normalizeOptionalText(payload.user_id);
    const requestedCode = normalizeOptionalText(payload.employee_code);

    await ensureUniqueEmployeeEmail(client, normalizedEmail);
    await ensureLinkedUserIsAvailable(client, normalizedUserId);

    const generatedIdentity = requestedCode ? null : await generateEmployeeIdentity(client);
    const employeeCode = requestedCode ?? generatedIdentity?.employeeCode ?? `COL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const insertResult = await client.query(
      `
        INSERT INTO public.employees (
          id,
          employee_code,
          user_id,
          full_name,
          email,
          area,
          position
        )
        VALUES (
          COALESCE($1::bigint, nextval(pg_get_serial_sequence('public.employees', 'id'))),
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING id;
      `,
      [
        generatedIdentity?.id || null,
        employeeCode,
        normalizedUserId,
        payload.full_name.trim(),
        normalizedEmail,
        normalizeOptionalText(payload.area),
        normalizeOptionalText(payload.position),
      ],
    );

    await client.query('COMMIT');

    const createdEmployee = await getEmployeeById(Number(insertResult.rows[0]?.id));
    if (!createdEmployee) {
      const error = new Error('EMPLOYEE_CREATION_FAILED');
      (error as any).code = 'EMPLOYEE_CREATION_FAILED';
      throw error;
    }

    return createdEmployee;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateEmployee = async (
  employeeId: number,
  payload: Partial<EmployeePayload>,
): Promise<EmployeeRecord | null> => {
  await assertEmployeesTable();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT * FROM public.employees WHERE id = $1 LIMIT 1;`,
      [employeeId],
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentEmployee = currentResult.rows[0];

    const resolvedEmail =
      payload.email !== undefined ? normalizeEmail(payload.email) : String(currentEmployee.email);
    const resolvedUserId =
      payload.user_id !== undefined
        ? normalizeOptionalText(payload.user_id)
        : currentEmployee.user_id
          ? String(currentEmployee.user_id)
          : null;
    const resolvedEmployeeCode =
      payload.employee_code !== undefined
        ? normalizeOptionalText(payload.employee_code)
        : String(currentEmployee.employee_code);

    await ensureUniqueEmployeeEmail(client, resolvedEmail, employeeId);
    await ensureLinkedUserIsAvailable(client, resolvedUserId, employeeId);

    await client.query(
      `
        UPDATE public.employees
        SET
          employee_code = $1,
          user_id = $2,
          full_name = $3,
          email = $4,
          area = $5,
          position = $6,
          updated_at = NOW()
        WHERE id = $7;
      `,
      [
        resolvedEmployeeCode,
        resolvedUserId,
        payload.full_name !== undefined ? payload.full_name.trim() : String(currentEmployee.full_name),
        resolvedEmail,
        payload.area !== undefined ? normalizeOptionalText(payload.area) : currentEmployee.area,
        payload.position !== undefined ? normalizeOptionalText(payload.position) : currentEmployee.position,
        employeeId,
      ],
    );

    await client.query('COMMIT');
    return getEmployeeById(employeeId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateEmployee = async (employeeId: number): Promise<EmployeeRecord | null> => {
  await assertEmployeesTable();

  const result = await pool.query(
    `
      UPDATE public.employees
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING id;
    `,
    [employeeId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getEmployeeById(employeeId);
};

export const getEmployeeSummary = async (): Promise<EmployeeSummary> => {
  await assertEmployeesTable();

  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
      COUNT(*) FILTER (WHERE user_id IS NOT NULL AND is_active = TRUE)::int AS linked_users,
      COUNT(*) FILTER (WHERE user_id IS NULL AND is_active = TRUE)::int AS unlinked_users
    FROM public.employees;
  `);

  return {
    total: Number(result.rows[0]?.total ?? 0),
    active: Number(result.rows[0]?.active ?? 0),
    linked_users: Number(result.rows[0]?.linked_users ?? 0),
    unlinked_users: Number(result.rows[0]?.unlinked_users ?? 0),
  };
};

export const listLinkableUsers = async (): Promise<LinkableUser[]> => {
  const result = await pool.query(`
    SELECT id, email, full_name, role
    FROM public.users
    WHERE is_active = TRUE
    ORDER BY full_name ASC, email ASC;
  `);

  return Promise.all(
    result.rows.map(async (row) => ({
      id: String(row.id),
      email: String(row.email),
      full_name: String(row.full_name),
      role: String(row.role).toUpperCase() as LinkableUser['role'],
      modules: await listUserModuleAccess(String(row.id), row.role),
    })),
  );
};
