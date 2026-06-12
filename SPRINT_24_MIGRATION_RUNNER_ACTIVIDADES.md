# Sprint 24 - Migration Runner y Control de Schema

Estado general del sprint: `completada`

Objetivo:
Reemplazar la aplicacion manual de archivos SQL por un mecanismo controlado, repetible y versionado de migraciones de base de datos, sin reescribir las migraciones existentes.

## Bloque 1 - Control de versiones de schema

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-01 | Crear tabla `schema_migrations` | `completada` | El runner la crea (`filename`, `checksum`, `applied_at`). |
| MIG-02 | Definir convencion de orden | `completada` | Orden por nombre con prefijo de fecha `AAAAMMDD_*.sql` en `unilabor-safedoc/sql/`. |
| MIG-03 | Inventariar las 19 migraciones existentes | `completada` | 18 traen `BEGIN;/COMMIT;` propio; `audit_module_context.sql` no. El runner despoja el control de transaccion de nivel superior. Hallazgo: `rh_document_structure.sql` no era idempotente (INSERT de `document_types` sin guard por `code`); corregido. |

## Bloque 2 - Runner

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-04 | Script `migrate` que aplica pendientes en orden | `completada` | `src/scripts/migrate.ts`: lee `sql/`, compara contra `schema_migrations`, aplica lo faltante en orden. |
| MIG-05 | Aplicar cada migracion dentro de transaccion | `completada` | `BEGIN`/`COMMIT` por migracion (con su `INSERT` de registro); `ROLLBACK` y detencion ante fallo. Verificado en local con el fallo real de `rh_document_structure.sql`. |
| MIG-06 | Comando `migrate:status` | `completada` | Lista aplicadas, pendientes y huerfanas (registradas sin archivo). |
| MIG-07 | Registrar scripts en `package.json` | `completada` | `npm run migrate` y `npm run migrate:status`. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-08 | Documentar uso en README y manual tecnico | `completada` | Nueva seccion "Migraciones de base de datos" en README; reemplaza la nota de "migraciones manuales". |
| MIG-09 | Validar build y commit/push | `completada` | `npm run build` backend OK. Las 19 migraciones aplicadas y registradas en BD local; re-run idempotente ("al dia"). |

## Definicion de terminado

- existe `schema_migrations` y registra lo aplicado
- `npm run migrate` aplica solo lo pendiente, en orden y transaccional
- `npm run migrate:status` reporta el estado
- documentacion actualizada

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 24 creado | `pendiente` | Base para control formal de migraciones. |
| 2026-06-12 | Runner implementado y validado en BD local | `completada` | `src/scripts/migrate.ts` + scripts npm. 19 migraciones aplicadas y registradas; build OK. No aplicado en produccion. |
| 2026-06-12 | Fix de idempotencia en `rh_document_structure.sql` | `completada` | Se agrego guard `NOT EXISTS` por `code` en el INSERT de `document_types` para evitar violacion de `ux_document_types_code`. |
