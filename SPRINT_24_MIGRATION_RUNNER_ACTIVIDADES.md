# Sprint 24 - Migration Runner y Control de Schema

Estado general del sprint: `pendiente`

Objetivo:
Reemplazar la aplicacion manual de archivos SQL por un mecanismo controlado, repetible y versionado de migraciones de base de datos, sin reescribir las migraciones existentes.

## Bloque 1 - Control de versiones de schema

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-01 | Crear tabla `schema_migrations` | `pendiente` | Registra nombre de archivo, hash y fecha de aplicacion. |
| MIG-02 | Definir convencion de orden | `pendiente` | Mantener prefijo por fecha actual `AAAAMMDD_*.sql` en `unilabor-safedoc/sql/`. |
| MIG-03 | Inventariar las 19 migraciones existentes | `pendiente` | Confirmar que todas son idempotentes (`IF NOT EXISTS` / `ON CONFLICT`). |

## Bloque 2 - Runner

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-04 | Script `migrate` que aplica pendientes en orden | `pendiente` | Lee `sql/`, compara contra `schema_migrations`, aplica lo faltante. |
| MIG-05 | Aplicar cada migracion dentro de transaccion | `pendiente` | Si una falla, rollback de esa migracion. |
| MIG-06 | Comando `migrate:status` | `pendiente` | Lista aplicadas vs pendientes. |
| MIG-07 | Registrar scripts en `package.json` | `pendiente` | `npm run migrate` y `npm run migrate:status`. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MIG-08 | Documentar uso en README y manual tecnico | `pendiente` | Reemplaza la nota de "aplicar SQL a mano en orden". |
| MIG-09 | Validar build y commit/push | `pendiente` | Runner no debe alterar el esquema de las migraciones ya escritas. |

## Definicion de terminado

- existe `schema_migrations` y registra lo aplicado
- `npm run migrate` aplica solo lo pendiente, en orden y transaccional
- `npm run migrate:status` reporta el estado
- documentacion actualizada

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 24 creado | `pendiente` | Base para control formal de migraciones. |
