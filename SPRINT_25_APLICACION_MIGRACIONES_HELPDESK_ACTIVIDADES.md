# Sprint 25 - Aplicacion y Validacion de Migraciones Helpdesk

Estado general del sprint: `pendiente`

Objetivo:
Aplicar y validar en base de datos real las migraciones del modulo Helpdesk, que quedaron identificadas pero no ejecutadas en el cierre de la fase (fallo de autenticacion de PostgreSQL). Es el unico pendiente operativo real para que Helpdesk funcione end to end.

Dependencia:
Recomendado ejecutar despues del Sprint 24 (runner). Si urge operar, se puede aplicar a mano y formalizar con el runner despues.

## Bloque 1 - Preparacion de entorno

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-01 | Corregir credenciales de `DATABASE_URL` / `DB_*` | `pendiente` | El cierre Helpdesk fallo por auth de PostgreSQL. |
| APP-02 | Respaldar base antes de migrar | `pendiente` | Dump previo por seguridad. |
| APP-03 | Confirmar orden de migraciones Helpdesk | `pendiente` | Ver `MEMORIA_AVANCES_PROYECTO.md`: seed, catalogs, assets, tickets, resolution, plans, execution, iso_risk. |

## Bloque 2 - Aplicacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-04 | Aplicar migraciones Helpdesk en orden | `pendiente` | Con runner del Sprint 24 o manual si aun no existe. |
| APP-05 | Verificar tablas y catalogos creados | `pendiente` | Activos, tickets, resolucion, planes, ordenes, iso/riesgo. |
| APP-06 | Confirmar seed del modulo en `modules` | `pendiente` | HELPDESK debe convivir con QUALITY y RH. |

## Bloque 3 - Validacion funcional en navegador

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| APP-07 | Validar `/helpdesk/assets` | `pendiente` | Alta y asignacion de equipo. |
| APP-08 | Validar `/helpdesk/tickets` | `pendiente` | Ticket de falla, solucion y retorno a operacion. |
| APP-09 | Validar `/helpdesk/maintenance` | `pendiente` | Plan, orden y checklist. |
| APP-10 | Validar `/helpdesk/dashboard` y `/helpdesk/my-portal` | `pendiente` | KPIs y portal del colaborador. |

## Definicion de terminado

- migraciones Helpdesk aplicadas en base real
- catalogos y tablas verificados
- flujos Helpdesk validados en navegador contra base actualizada
- pendiente conocido cerrado en `MEMORIA_AVANCES_PROYECTO.md`

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 25 creado | `pendiente` | Cierra el unico pendiente operativo del proyecto. |
