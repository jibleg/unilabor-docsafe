# Sprint 29 - Paginacion y Rendimiento en Listados

Estado general del sprint: `completada`

Objetivo:
Incorporar paginacion del lado servidor en los listados que hoy traen todos los registros, para que el sistema escale con el crecimiento de datos sin degradar la experiencia.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-01 | Definir contrato de paginacion estandar | `completada` | Helper `src/utils/pagination.ts`: `resolvePagination`/`buildPaginatedResult`/`buildIlikeSearch`/`isPaginationRequested`. Respuesta uniforme `{data, pagination:{page,limit,total,totalPages}}` (alineado con `category`). Paginacion **opt-in**: sin `page`/`limit` el listado devuelve todo (compat con dropdowns). |
| PAG-02 | Paginar listado de activos Helpdesk | `completada` | `listHelpdeskAssets` + busqueda server-side (codigo, nombre, serie, marca, categoria, ubicacion, asignado). |
| PAG-03 | Paginar listado de tickets Helpdesk | `completada` | `listHelpdeskTickets` + busqueda (folio, titulo, descripcion, activo, solicitante, estado, prioridad). |
| PAG-04 | Paginar listado de empleados RH | `completada` | `listEmployees` + busqueda (codigo, nombre, correo, area, puesto). |
| PAG-05 | Revisar otros listados grandes | `completada` | Documentos (por rol), usuarios y ordenes de mantenimiento paginados con busqueda. `category` refactorizado al helper comun. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-06 | Adaptar `api/service.ts` al contrato de paginacion | `completada` | Tipos `PageResult`/`PaginationMeta`/`PageQuery` + `extractPagination`. Funciones `listXPaginated` nuevas; las `listX` de array se conservan para dropdowns. |
| PAG-07 | Agregar controles de paginacion en paginas grandes | `completada` | Hook `usePaginatedList` + componente `Pagination`. Aplicado a Tickets, Activos y Empleados con busqueda server-side. Resumenes (tarjetas) ahora server-side: `/helpdesk/summary` ampliado (critical/assigned) y nuevo `/helpdesk/tickets/summary`. |
| PAG-08 | Evitar refetch innecesario al navegar | `completada` | Busqueda con debounce (350ms) y reset a pagina 1; catalogos/empleados auxiliares se cargan una sola vez (ya no en cada cambio de pagina). |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-09 | Pruebas de paginacion | `completada` | Backend: `src/utils/pagination.test.ts` (10 casos). Frontend: `service.test.ts` cubre `listEmployeesPaginated` (contrato + defaults). |
| PAG-10 | Validar build y commit/push | `completada` | Backend tsc + 63 tests verdes. Frontend build + 26 tests verdes. Lint frontend limpio (0 errores). |

## Definicion de terminado

- contrato de paginacion uniforme en backend
- listados de alto volumen paginan del lado servidor
- frontend consume paginacion sin romper normalizacion
- navegacion sin refetch redundante en las paginas tocadas

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 29 creado | `pendiente` | Paginacion para escalar con el volumen de datos. |
| 2026-06-16 | Sprint 29 ejecutado completo | `completada` | Backend pagina 6 listados (activos, tickets, empleados, documentos, usuarios, ordenes) con contrato uniforme opt-in + busqueda server-side; `category` refactorizado al helper. Frontend: hook+componente de paginacion en Tickets/Activos/Empleados con resumenes server-side. Alcance acordado: backend 6 listados, UI en los 3 prioritarios. Build/tests/lint verdes. |
