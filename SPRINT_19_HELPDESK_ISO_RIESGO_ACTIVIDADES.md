# Sprint 19 - Cumplimiento ISO y Evaluacion de Riesgo

Estado general del sprint: `completada`

Objetivo:
Fortalecer el modulo para cumplimiento ISO 15189:2022 mediante evaluacion de impacto, gestion de riesgo, liberacion tecnica y trazabilidad auditable.

## Bloque 1 - Evaluacion de impacto

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| ISO-01 | Registrar si falla afecta resultados | `completada` | Campo existente reforzado con evaluacion ISO/riesgo. |
| ISO-02 | Registrar uso en analisis recientes | `completada` | Campo de uso reciente o lotes potencialmente afectados. |
| ISO-03 | Registrar uso de equipo alterno | `completada` | Continuidad operativa documentada. |
| ISO-04 | Registrar necesidad de accion correctiva | `completada` | Bandera y notas para futura integracion con Calidad. |
| ISO-05 | Registrar responsable de evaluacion | `completada` | Usuario evaluador y fecha quedan trazados. |

## Bloque 2 - Control operativo

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Senalizar equipo fuera de servicio | `completada` | Evaluacion de riesgo puede bloquear activo como fuera de servicio. |
| BE-02 | Bloquear uso operativo cuando aplique | `completada` | Retorno a operacion exige liberacion cuando hay riesgo/impacto. |
| BE-03 | Liberacion tecnica documentada | `completada` | Resumen, usuario y fecha de liberacion tecnica. |
| BE-04 | Vincular procedimientos QUALITY | `completada` | Campo de documento controlado preparado para QUALITY. |

## Bloque 3 - Auditoria

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUD-01 | Vista de auditoria por equipo | `completada` | Historial del ticket y cambios de estado del activo quedan trazados. |
| AUD-02 | Reporte de impacto por falla | `completada` | Detalle del ticket muestra evaluacion, bloqueo, liberacion y retorno. |

## Definicion de terminado

- fallas criticas capturan impacto y riesgo
- equipo fuera de servicio queda controlado
- retorno a operacion requiere liberacion documentada
- Calidad puede revisar trazabilidad e impacto

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 19 creado | `pendiente` | Base para cumplimiento ISO y riesgo. |
| 2026-04-22 | Evaluacion ISO/riesgo implementada | `completada` | Tickets con impacto, riesgo, accion correctiva, bloqueo operativo y liberacion tecnica. |
