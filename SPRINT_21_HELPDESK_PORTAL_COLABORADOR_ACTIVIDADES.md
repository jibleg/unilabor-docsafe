# Sprint 21 - Portal del Colaborador para Mesa de Ayuda

Estado general del sprint: `completada`

Objetivo:
Crear una experiencia simple para que colaboradores consulten sus equipos asignados, reporten fallas y den seguimiento a sus solicitudes.

## Bloque 1 - Mis equipos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PORT-01 | Vista `Mis equipos` | `completada` | Equipos asignados o bajo responsabilidad del colaborador. |
| PORT-02 | Detalle simple de equipo | `completada` | Estado, ubicacion, codigo y datos principales visibles. |
| PORT-03 | Reportar falla desde equipo | `completada` | Crea ticket con activo preseleccionado desde portal. |

## Bloque 2 - Mis solicitudes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PORT-04 | Vista `Mis solicitudes` | `completada` | Tickets propios del colaborador autenticado. |
| PORT-05 | Agregar comentarios/evidencia | `completada` | Comentarios restringidos a tickets propios. |
| PORT-06 | Confirmar funcionamiento | `completada` | Confirmacion disponible cuando soporte registra solucion. |

## Bloque 3 - Seguridad

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| SEC-01 | Restringir a equipos propios | `completada` | Backend valida asignacion/responsabilidad del activo. |
| SEC-02 | Restringir tickets propios | `completada` | Endpoints `/me` solo devuelven solicitudes del colaborador. |

## Definicion de terminado

- colaborador ve sus equipos
- colaborador crea tickets desde sus equipos
- colaborador consulta y comenta sus solicitudes
- acceso protegido desde backend

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 21 creado | `pendiente` | Base para portal Helpdesk del colaborador. |
| 2026-04-22 | Portal del colaborador implementado | `completada` | Mis equipos, mis solicitudes, alta de ticket, comentarios y confirmacion de funcionamiento. |
