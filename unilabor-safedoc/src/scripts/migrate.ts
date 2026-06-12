/**
 * Migration runner de SafeDoc.
 *
 * Aplica los archivos `sql/*.sql` pendientes, en orden por nombre, registrando
 * cada uno en la tabla de control `schema_migrations`. Reemplaza la aplicacion
 * manual de SQL "a mano en orden".
 *
 * Uso:
 *   npm run migrate           -> aplica las migraciones pendientes
 *   npm run migrate:status    -> lista aplicadas vs pendientes (no modifica nada)
 *
 * La conexion sale de las variables DB_* del .env (ver src/config/db.ts), por lo
 * que corre contra la BD configurada localmente. No apuntar a produccion aqui.
 */
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { PoolClient } from 'pg';
import pool from '../config/db';

const SQL_DIR = join(__dirname, '..', '..', 'sql');

interface AppliedMigration {
  filename: string;
  checksum: string;
}

/** Quita el BOM inicial que arrastran algunos archivos exportados desde Windows. */
function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/**
 * Elimina las sentencias de control de transaccion de nivel superior (`BEGIN;` /
 * `COMMIT;`) para que la transaccion la maneje el runner. Solo afecta lineas que
 * son exactamente `BEGIN;` o `COMMIT;`: los `BEGIN` de bloques PL/pgSQL (`DO $$
 * BEGIN ... END $$`) no llevan `;` y se conservan intactos.
 */
function stripTopLevelTransaction(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join('\n');
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Lista los archivos .sql ordenados por nombre (prefijo de fecha AAAAMMDD_*). */
function listMigrationFiles(): string[] {
  return readdirSync(SQL_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied(client: PoolClient): Promise<Map<string, AppliedMigration>> {
  const { rows } = await client.query<AppliedMigration>(
    'SELECT filename, checksum FROM public.schema_migrations'
  );
  return new Map(rows.map((row) => [row.filename, row]));
}

async function runMigrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();

    let pending = 0;
    for (const filename of files) {
      const raw = stripBom(readFileSync(join(SQL_DIR, filename), 'utf8'));
      const sum = checksum(raw);
      const previous = applied.get(filename);

      if (previous) {
        if (previous.checksum !== sum) {
          console.warn(
            `  ! ${filename} ya aplicada pero su contenido cambio (checksum distinto). ` +
              `Las migraciones deben ser inmutables: crea una nueva en vez de editar esta.`
          );
        }
        continue;
      }

      pending += 1;
      const sql = stripTopLevelTransaction(raw);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, sum]
        );
        await client.query('COMMIT');
        console.log(`  + ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  x ${filename} fallo; se hizo rollback de esta migracion.`);
        throw err;
      }
    }

    if (pending === 0) {
      console.log('Base de datos al dia: no hay migraciones pendientes.');
    } else {
      console.log(`Listo: ${pending} migracion(es) aplicada(s).`);
    }
  } finally {
    client.release();
  }
}

async function runStatus(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();

    console.log('Estado de migraciones:\n');
    let pending = 0;
    for (const filename of files) {
      const record = applied.get(filename);
      if (record) {
        console.log(`  [x] ${filename}`);
      } else {
        pending += 1;
        console.log(`  [ ] ${filename}  (pendiente)`);
      }
    }

    const orphans = [...applied.keys()].filter((name) => !files.includes(name));
    for (const name of orphans) {
      console.log(`  [?] ${name}  (registrada pero el archivo ya no existe)`);
    }

    console.log(
      `\nTotal: ${files.length} | aplicadas: ${files.length - pending} | pendientes: ${pending}`
    );
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';
  if (command === 'status') {
    await runStatus();
  } else if (command === 'migrate') {
    await runMigrate();
  } else {
    console.error(`Comando desconocido: ${command}. Usa "migrate" o "status".`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Error en el runner de migraciones:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
