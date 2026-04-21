# Sprint 15 - Mesa de Ayuda Operativa

Estado general del sprint: `pendiente`

Objetivo:
Permitir que colaboradores y usuarios autorizados creen solicitudes de soporte, fallas, reparaciones y mantenimiento correctivo sobre equipos asignados.

## Bloque 1 - Tickets

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de tickets Helpdesk | `pendiente` | Relacion con activo, colaborador, usuario solicitante y responsable. |
| DB-02 | Definir estados de ticket | `pendiente` | Nuevo, revision, asignado, proceso, espera, solucionado, validado, cerrado. |
| DB-03 | Definir prioridad e impacto operativo | `pendiente` | Incluye posible afectacion de resultados. |
| DB-04 | Crear comentarios y evidencias de ticket | `pendiente` | Fotos, PDFs, reportes, notas tecnicas. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear ticket | `pendiente` | Desde activo asignado o vista administrativa. |
| BE-02 | Listar tickets con filtros | `pendiente` | Estado, prioridad, area, activo, responsable, fechas. |
| BE-03 | Actualizar estado y asignacion | `pendiente` | Solo roles autorizados. |
| BE-04 | Registrar comentarios/evidencias | `pendiente` | Trazabilidad completa. |
| BE-05 | Auditar cambios de ticket | `pendiente` | Acciones relevantes en access logs o bitacora propia. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear pagina de solicitudes | `pendiente` | Bandeja operativa de tickets. |
| FE-02 | Crear modal/formulario de nuevo ticket | `pendiente` | Equipo, tipo, prioridad, impacto, descripcion. |
| FE-03 | Crear vista de detalle del ticket | `pendiente` | Timeline, comentarios, evidencia y estado. |

## Definicion de terminado

- colaboradores pueden reportar fallas o solicitudes
- soporte puede gestionar tickets
- evidencias y comentarios quedan trazados
- estados y prioridad son visibles

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 15 creado | `pendiente` | Base para mesa de ayuda operativa. |
