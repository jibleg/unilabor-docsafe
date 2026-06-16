# Sprint 30 - Modularidad y Reduccion de Archivos Monoliticos

Estado general del sprint: `completada`

Objetivo:
Dividir los archivos mas grandes en unidades mantenibles y testeables, sin cambiar comportamiento. Mejora directa de mantenibilidad y velocidad de desarrollo futuro.

Dependencia recomendada:
Conviene ejecutar despues del Sprint 26 (pruebas), para refactorizar con red de seguridad.

## Bloque 1 - Frontend: capa de API

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-01 | Dividir `api/service.ts` por dominio | `completada` | 2737 LOC -> `service.shared` (tipos+helpers), `service.normalizers`, `service.parsers`, `service.api-core` (auth/usuarios/empleados), `service.api-helpdesk`. |
| REF-02 | Extraer normalizadores compartidos | `completada` | Helpers de bajo nivel (`asRecord`/`getString`/`getNumber`/`unwrapPayload`/paginacion) en `service.shared`; normalizadores en `service.normalizers`/`service.parsers`. |
| REF-03 | Mantener exports compatibles | `completada` | `service.ts` queda como barril (`export *`); imports de paginas/stores sin cambios. |

## Bloque 2 - Frontend: paginas grandes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-04 | Extraer modales de `HelpdeskTicketsPage.tsx` | `completada` | 1194 -> 872 LOC. Preambulo a `HelpdeskTicketsPage.helpers`; modal de alta/edicion a `HelpdeskTicketForm`. |
| REF-05 | Extraer modales de `HelpdeskMaintenancePage.tsx` | `completada` | 1143 -> 977 LOC. Preambulo (tipos/constantes/helpers) a `HelpdeskMaintenancePage.helpers`. |
| REF-06 | Extraer modales de `UsersPage.tsx` | `completada` | 1069 -> 947 LOC. Preambulo a `UsersPage.helpers`. |
| REF-07 | Unificar configuracion de sidebar y navbar | `pendiente` | Diferido: `AppSidebar` (196) y `AppNavbar` (212) ya estan < 1000; dedup de items es mejora opcional, no bloqueante. Bonus hecho: `CatalogSelect` unificado en `components/CatalogSelect`. |

## Bloque 3 - Backend: servicios grandes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-08 | Dividir `helpdesk-ticket.service.ts` | `completada` | 1444 LOC -> `helpdesk-ticket.shared` (tipos+helpers) / `.read` (consultas+dashboard) / `.mutations` (ciclo de vida) + barril. |
| REF-09 | Dividir `helpdesk.controller.ts` | `completada` | 1395 LOC -> `helpdesk-controller.shared` (helpers/parsers) + `helpdesk-asset.controller` / `helpdesk-ticket.controller` / `helpdesk-maintenance.controller` + barril. |
| REF-10 | Revisar `document.controller.ts` | `pendiente` | Diferido: 826 LOC, ya < 1000. Mover logica a service es mejora opcional, no bloqueante. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-11 | Verificar paridad con pruebas | `completada` | Backend 63 tests verdes; frontend 26 tests + build OK; lint frontend limpio; tsc -b limpio. Sin cambios de comportamiento (solo reorganizacion + barriles). |
| REF-12 | Validar builds y commit/push | `completada` | 3 commits: backend (`c5fd194`), api frontend (`4f8193b`), paginas frontend (`b016352`). |

## Definicion de terminado

- `api/service.ts` dividido por dominio con normalizadores compartidos
- paginas y servicios mayores a 1.000 LOC divididos en unidades menores
- sin cambios de comportamiento observables
- builds correctos y pruebas verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 30 creado | `pendiente` | Refactor de modularidad sobre archivos monoliticos. |
| 2026-06-16 | Sprint 30 ejecutado | `completada` | Ningun archivo supera 1000 LOC (antes 6: service.ts 2737, ticket.service 1444, helpdesk.controller 1395, 3 paginas). Refactor por barriles re-exportadores: imports de consumidores sin cambios, sin cambios de comportamiento. Diferidos no bloqueantes: REF-07 (dedup sidebar/navbar) y REF-10 (mover logica de document.controller, ya < 1000). Cierra la V3. |
