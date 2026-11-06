import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getXlabDbConfig } from './env';

/**
 * Segundo pool, a `xlab` (BD del LIS, distinta de la de DocSafe y sin dblink ni
 * postgres_fdw). Se crea al primer uso, nunca al arrancar: sin configuracion o con
 * `xlab` caido, DocSafe sigue funcionando y solo se apagan las notificaciones.
 *
 * La BD es SQL_ASCII: el texto del LIS viene en WIN1252 (usar `lisText`) y lo que
 * escribe Contigo+ en su esquema ya viaja en UTF-8. node-postgres fuerza UTF8 al
 * conectar, por eso `xlabQuery` fija SQL_ASCII (paso directo de bytes) en cada conexion.
 */
export class XlabUnavailableError extends Error {
  readonly code = 'XLAB_UNAVAILABLE';

  constructor() {
    super('XLab no esta disponible');
  }
}

const LOG_INTERVAL_MS = 60_000;

let pool: Pool | null = null;
let lastLogAt = 0;
const sessionsReady = new WeakSet<PoolClient>();

// Con `xlab` caido cada navegacion de cada usuario fallaria: una linea por minuto basta.
const logXlabError = (context: string, error: unknown): void => {
  const now = Date.now();
  if (now - lastLogAt < LOG_INTERVAL_MS) {
    return;
  }
  lastLogAt = now;
  console.error(`[xlab] ${context}:`, error instanceof Error ? error.message : error);
};

const getPool = (): Pool | null => {
  if (pool) {
    return pool;
  }
  const config = getXlabDbConfig();
  if (!config) {
    return null;
  }
  pool = new Pool({
    ...config,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
    query_timeout: 6_000,
    application_name: 'docsafe-notificaciones',
  });
  // Sin este listener, un cliente inactivo que pierde la conexion tumba el proceso.
  pool.on('error', (error) => logXlabError('Cliente inactivo del pool', error));
  return pool;
};

/**
 * Consulta en `xlab`. Cualquier falla (sin configurar, caido, sin permiso) sale como
 * XlabUnavailableError: para quien llama significa lo mismo y el detalle queda en el log.
 */
export const xlabQuery = async <T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> => {
  const current = getPool();
  if (!current) {
    throw new XlabUnavailableError();
  }
  let client: PoolClient | null = null;
  let failed = false;
  try {
    client = await current.connect();
    if (!sessionsReady.has(client)) {
      await client.query("SET client_encoding TO 'SQL_ASCII'");
      sessionsReady.add(client);
    }
    return await client.query<T>(text, params);
  } catch (error) {
    failed = true;
    logXlabError('Error en consulta', error);
    throw new XlabUnavailableError();
  } finally {
    client?.release(failed);
  }
};

/** Columna de texto del LIS (WIN1252 sobre SQL_ASCII) convertida a UTF-8. NULL-safe. */
export const lisText = (column: string): string =>
  `convert_from(convert((${column})::bytea, 'WIN1252', 'UTF8'), 'UTF8')`;
