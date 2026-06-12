# Sprint 25 - Aplicacion y Validacion de Migraciones Helpdesk

Estado general del sprint: `en progreso`

Objetivo:
Aplicar y validar en base de datos real las migraciones del modulo Helpdesk, que quedaron identificadas pero no ejecutadas en el cierre de la fase (fallo de autenticacion de PostgreSQL). Es el unico pendiente operativo real para que Helpdesk funcione end to end.

Dependencia:
Recomendado ejecutar despues del Sprint 24 (runner). Si urge operar, se puede aplicar a mano y formalizar con el runner despues.

## Bloque 1 - Preparacion de entorno

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-01 | Corregir credenciales de `DATABASE_URL` / `DB_*` | `completada` | El runner del Sprint 24 conecto sin error de auth con los `DB_*` del `.env` local. |
| APP-02 | Respaldar base antes de migrar | `no aplica` | BD local de desarrollo; migraciones idempotentes y transaccionales (rollback ante fallo). |
| APP-03 | Confirmar orden de migraciones Helpdesk | `completada` | Orden garantizado por el runner (prefijo de fecha): module_seed, base_catalogs, assets_inventory, tickets, ticket_resolution, maintenance_plans, maintenance_execution, iso_risk. |

## Bloque 2 - Aplicacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-04 | Aplicar migraciones Helpdesk en orden | `completada` | Aplicadas con `npm run migrate`; registradas en `schema_migrations`. |
| APP-05 | Verificar tablas y catalogos creados | `completada` | 24 tablas `helpdesk_*` presentes; catalogos con seed (asset_categories=5, ticket_priorities=4, etc.). |
| APP-06 | Confirmar seed del modulo en `modules` | `completada` | `modules` contiene HELPDESK (activo) junto a QUALITY y RH. |

## Bloque 3 - Validacion funcional en navegador

Pendiente de recorrido visual por el equipo (validacion manual). El backend y la BD
ya estan listos: schema migrado, catalogos con seed y modulo HELPDESK activo. Para
correr: `npm run dev` en `unilabor-safedoc` y en `unilabor-safedoc-ui`, login con un
usuario con acceso al modulo HELPDESK, y marcar cada flujo al validarlo.

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-07 | Validar `/helpdesk/assets` | `pendiente (validacion manual)` | Alta y asignacion de equipo. |
| APP-08 | Validar `/helpdesk/tickets` | `pendiente (validacion manual)` | Ticket de falla, solucion y retorno a operacion. |
| APP-09 | Validar `/helpdesk/maintenance` | `pendiente (validacion manual)` | Plan, orden y checklist. |
| APP-10 | Validar `/helpdesk/dashboard` y `/helpdesk/my-portal` | `pendiente (validacion manual)` | KPIs y portal del colaborador. |

## Definicion de terminado

- migraciones Helpdesk aplicadas en base real
- catalogos y tablas verificados
- flujos Helpdesk validados en navegador contra base actualizada
- pendiente conocido cerrado en `MEMORIA_AVANCES_PROYECTO.md`

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 25 creado | `pendiente` | Cierra el unico pendiente operativo del proyecto. |
| 2026-06-12 | Migraciones Helpdesk aplicadas y verificadas en BD local | `completada` | Via runner del Sprint 24. 24 tablas `helpdesk_*`, catalogos con seed, modulo HELPDESK activo. Bloques 1 y 2 cerrados. |
| 2026-06-12 | Bloque 3 entregado para validacion manual en navegador | `en progreso` | Equipo hara el recorrido visual (APP-07..10) con el stack levantado. |
