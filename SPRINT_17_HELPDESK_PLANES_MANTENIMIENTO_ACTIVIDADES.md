# Sprint 17 - Planes de Mantenimiento Preventivo

Estado general del sprint: `completada`

Objetivo:
Crear planes de mantenimiento preventivo por equipo, con frecuencia, calendario, responsables, checklist y vinculacion a procedimientos controlados.

## Bloque 1 - Planes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de planes de mantenimiento | `completada` | Equipo, frecuencia, fecha inicio y proxima ejecucion implementados. |
| DB-02 | Agregar tolerancia de ejecucion | `completada` | Ventana aceptable antes/despues de fecha programada. |
| DB-03 | Vincular procedimiento QUALITY | `completada` | Campo UUID preparado para documento controlado. |
| DB-04 | Definir responsable y proveedor | `completada` | Responsable RH y proveedor externo opcional. |
| DB-05 | Definir checklist/evidencia requerida | `completada` | Actividades base y bandera de evidencia requerida. |

## Bloque 2 - Calendario y alertas

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Calcular proximas ejecuciones | `completada` | Frecuencias mensual, trimestral, semestral, anual y personalizada. |
| BE-02 | Generar ordenes programadas | `completada` | Primera orden creada al alta/actualizacion del plan. |
| BE-03 | Alertar mantenimientos proximos/vencidos | `completada` | Conteo preventivo en dashboard y estado visual en bandeja. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear pagina de planes de mantenimiento | `completada` | Lista, filtros, indicadores y detalle por plan. |
| FE-02 | Crear formulario de plan | `completada` | Activo, frecuencia, responsable, tolerancia, proveedor y checklist. |
| FE-03 | Crear calendario visual | `completada` | Ordenes programadas visibles por plan como calendario operativo base. |

## Definicion de terminado

- equipos pueden tener planes preventivos
- existen proximas ejecuciones programadas
- alertas de proximos/vencidos disponibles
- plan puede referenciar procedimiento QUALITY

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 17 creado | `pendiente` | Base para mantenimiento preventivo. |
| 2026-04-22 | Planes preventivos implementados | `completada` | Migracion, backend, dashboard y pantalla de planes/calendario quedan disponibles. |
