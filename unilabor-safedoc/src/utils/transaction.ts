import type { PoolClient } from 'pg';
import pool from '../config/db';

/**
 * Ejecutor de consultas: lo cumplen tanto el `pool` como un `PoolClient` de una
 * transaccion abierta. Los helpers de escritura aceptan un `Queryable` para
 * poder participar en una transaccion (todo confirma o todo revierte).
 */
export type Queryable = Pick<PoolClient, 'query'>;

/**
 * Corre `fn` dentro de una transaccion (BEGIN/COMMIT). Si `fn` lanza, revierte
 * (ROLLBACK) y relanza el error. Siempre libera el cliente al pool.
 */
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
