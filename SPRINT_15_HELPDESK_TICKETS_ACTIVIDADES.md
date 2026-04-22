# Sprint 15 - Mesa de Ayuda Operativa

Estado general del sprint: `completada`

Objetivo:
Permitir que colaboradores y usuarios autorizados creen solicitudes de soporte, fallas, reparaciones y mantenimiento correctivo sobre equipos asignados.

## Bloque 1 - Tickets

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de tickets Helpdesk | `completada` | Relacion con activo, colaborador, usuario solicitante y responsable. |
| DB-02 | Definir estados de ticket | `completada` | Nuevo, revision, asignado, proceso, espera, solucionado, validado, cerrado. |
| DB-03 | Definir prioridad e impacto operativo | `completada` | Incluye posible afectacion de resultados. |
| DB-04 | Crear comentarios y evidencias de ticket | `completada` | Comentarios operativos y tabla base para evidencias. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear ticket | `completada` | Desde activo asignado o vista administrativa. |
| BE-02 | Listar tickets con filtros | `completada` | Busqueda operativa en frontend; API lista bandeja completa. |
| BE-03 | Actualizar estado y asignacion | `completada` | Solo ADMIN/EDITOR. |
| BE-04 | Registrar comentarios/evidencias | `completada` | Comentarios activos; tabla de evidencias preparada. |
| BE-05 | Auditar cambios de ticket | `completada` | Auditoria `HELPDESK` y bitacora propia de tickets. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear pagina de solicitudes | `completada` | Bandeja operativa de tickets. |
| FE-02 | Crear modal/formulario de nuevo ticket | `completada` | Equipo, tipo, prioridad, impacto, descripcion. |
| FE-03 | Crear vista de detalle del ticket | `completada` | Detalle con comentarios y estado. |

## Definicion de terminado

- colaboradores pueden reportar fallas o solicitudes
- soporte puede gestionar tickets
- evidencias y comentarios quedan trazados
- estados y prioridad son visibles

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 15 creado | `completada` | Base para mesa de ayuda operativa. |
| 2026-04-21 | Mesa de ayuda operativa implementada | `completada` | Tickets, estados, prioridades, comentarios, auditoria y bandeja de solicitudes. |
