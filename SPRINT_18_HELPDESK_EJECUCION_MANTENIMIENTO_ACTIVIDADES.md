# Sprint 18 - Ejecucion de Mantenimiento

Estado general del sprint: `completada`

Objetivo:
Ejecutar y cerrar ordenes de mantenimiento preventivo/correctivo con checklist, evidencia, proveedor y resultado documentado.

## Bloque 1 - Ordenes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear/ajustar ordenes de mantenimiento | `completada` | Ordenes programadas desde plan y extendidas para ejecucion. |
| DB-02 | Registrar actividades realizadas | `completada` | Texto tecnico, hallazgos y observaciones. |
| DB-03 | Registrar checklist | `completada` | Cumple/no cumple/no aplica por actividad. |
| DB-04 | Registrar proveedor externo | `completada` | Campo de proveedor en cierre de orden. |
| DB-05 | Registrar resultado | `completada` | Conforme, no conforme o requiere seguimiento. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Iniciar orden de mantenimiento | `completada` | Cambia estado de orden a en proceso. |
| BE-02 | Adjuntar evidencias | `completada` | Referencia textual de reportes, fotos o certificados. |
| BE-03 | Cerrar orden | `completada` | Valida fecha, actividades y resultado. |
| BE-04 | Reprogramar con justificacion | `completada` | Guarda fecha anterior, nueva fecha y motivo. |
| BE-05 | Actualizar proxima fecha del plan | `completada` | Al cierre genera siguiente orden segun frecuencia. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear bandeja de ordenes | `completada` | Ordenes visibles desde detalle del plan. |
| FE-02 | Crear vista de ejecucion | `completada` | Modal de cierre con checklist, evidencia, resultado y proveedor. |
| FE-03 | Mostrar historial en ficha de equipo | `completada` | Historial operativo visible por plan/activo. |

## Definicion de terminado

- ordenes pueden ejecutarse y cerrarse
- evidencias quedan asociadas
- reprogramaciones quedan justificadas
- plan actualiza proxima ejecucion

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 18 creado | `pendiente` | Base para ejecucion de mantenimiento. |
| 2026-04-22 | Ejecucion de mantenimiento implementada | `completada` | Iniciar, reprogramar y cerrar ordenes con trazabilidad de checklist y resultado. |
