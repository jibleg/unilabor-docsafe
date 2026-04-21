# Sprint 16 - Solucion y Retorno a Operacion

Estado general del sprint: `pendiente`

Objetivo:
Registrar solucion tecnica, validacion y fecha de retorno a operacion despues de fallas, reparaciones o mantenimiento correctivo.

## Bloque 1 - Datos de solucion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Agregar `solved_at` al ticket | `pendiente` | Fecha/hora en que soporte declara solucion. |
| DB-02 | Agregar `solution_summary` | `pendiente` | Descripcion tecnica de la solucion aplicada. |
| DB-03 | Agregar `return_to_operation_at` | `pendiente` | Fecha/hora real de retorno a operacion. |
| DB-04 | Agregar validacion de responsable | `pendiente` | `validated_by_user_id` y `validated_at`. |
| DB-05 | Calcular `downtime_minutes` | `pendiente` | Desde reporte/fuera de servicio hasta retorno. |

## Bloque 2 - Flujo operativo

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Marcar ticket como solucionado | `pendiente` | Requiere resumen y evidencia cuando aplique. |
| BE-02 | Validar retorno a operacion | `pendiente` | Responsable confirma que el equipo puede usarse. |
| BE-03 | Actualizar estado operativo del activo | `pendiente` | Operativo, condicionado o fuera de servicio. |
| BE-04 | Registrar historial del activo | `pendiente` | Fallas, solucion y retorno quedan en trazabilidad. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Agregar accion `Solucionar` | `pendiente` | Captura solucion, fecha y evidencia. |
| FE-02 | Agregar accion `Validar retorno` | `pendiente` | Captura fecha de retorno y validador. |
| FE-03 | Mostrar tiempo fuera de operacion | `pendiente` | En ticket y ficha del equipo. |

## Definicion de terminado

- ticket distingue solucion de retorno a operacion
- equipo no vuelve a operativo sin validacion cuando aplique
- downtime queda calculado
- historial del equipo queda completo

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 16 creado | `pendiente` | Base para solucion y retorno operativo. |
