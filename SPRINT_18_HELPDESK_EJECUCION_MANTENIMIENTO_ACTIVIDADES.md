# Sprint 18 - Ejecucion de Mantenimiento

Estado general del sprint: `pendiente`

Objetivo:
Ejecutar y cerrar ordenes de mantenimiento preventivo/correctivo con checklist, evidencia, proveedor y resultado documentado.

## Bloque 1 - Ordenes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear/ajustar ordenes de mantenimiento | `pendiente` | Programadas desde plan o creadas manualmente. |
| DB-02 | Registrar actividades realizadas | `pendiente` | Texto tecnico y observaciones. |
| DB-03 | Registrar checklist | `pendiente` | Cumplido/no cumplido/no aplica. |
| DB-04 | Registrar proveedor externo | `pendiente` | Si aplica. |
| DB-05 | Registrar resultado | `pendiente` | Conforme, no conforme, requiere seguimiento. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Iniciar orden de mantenimiento | `pendiente` | Cambia estado del equipo si aplica. |
| BE-02 | Adjuntar evidencias | `pendiente` | Reportes, fotos, certificados. |
| BE-03 | Cerrar orden | `pendiente` | Valida campos obligatorios. |
| BE-04 | Reprogramar con justificacion | `pendiente` | Trazabilidad para auditoria. |
| BE-05 | Actualizar proxima fecha del plan | `pendiente` | Al cierre conforme. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear bandeja de ordenes | `pendiente` | Programadas, en proceso, vencidas, cerradas. |
| FE-02 | Crear vista de ejecucion | `pendiente` | Checklist, evidencias, resultado. |
| FE-03 | Mostrar historial en ficha de equipo | `pendiente` | Mantenimientos ejecutados. |

## Definicion de terminado

- ordenes pueden ejecutarse y cerrarse
- evidencias quedan asociadas
- reprogramaciones quedan justificadas
- plan actualiza proxima ejecucion

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 18 creado | `pendiente` | Base para ejecucion de mantenimiento. |
