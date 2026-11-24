import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const LOG_INTERVAL_MS = 60_000;
const lastLogAt = new Map<string, number>();

// Un corte de la BD produce el mismo error en todas las conexiones a la vez:
// se deja una linea por minuto y por origen para no inundar el log.
const logDbConnectionError = (context: string, error: unknown): void => {
  const now = Date.now();
  if (now - (lastLogAt.get(context) ?? 0) < LOG_INTERVAL_MS) {
    return;
  }
  lastLogAt.set(context, now);
  console.error(`[db] ${context}:`, error instanceof Error ? error.message : error);
};

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  // La BD esta en otro servidor: sin keepalive, una conexion inactiva que la red
  // corta en silencio se descubre hasta el siguiente uso, con un ETIMEDOUT.
  keepAlive: true,
});

// Sin estos listeners, perder la conexion con la BD (reinicio de mantenimiento,
// corte de red) emite un 'error' sin manejar y Node termina el proceso. Con ellos
// el pool descarta la conexion rota y abre otra en la siguiente consulta.
pool.on('error', (error) => logDbConnectionError('Conexion inactiva del pool perdida', error));

// El listener del pool solo cubre las conexiones inactivas. Una conexion prestada
// (pool.connect) que se corta entre dos consultas emite el error en el cliente.
pool.on('connect', (client) => {
  client.on('error', (error) => logDbConnectionError('Conexion en uso perdida', error));
});

export default pool;
