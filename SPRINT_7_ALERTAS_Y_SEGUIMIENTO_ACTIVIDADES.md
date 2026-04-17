# Sprint 7 - Alertas y Seguimiento

Estado general del sprint: `pendiente`

Objetivo:
Agregar valor operativo al modulo RH con alertas de faltantes, vigencias y seguimiento del expediente.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear servicio de alertas por expediente incompleto | `pendiente` | Basado en tipos obligatorios. |
| BE-02 | Crear servicio de alertas por documento por vencer | `pendiente` | Enfocado a constancias inicialmente. |
| BE-03 | Crear servicio de alertas por documento vencido | `pendiente` | Filtro prioritario para RH. |
| BE-04 | Crear endpoints de consulta de alertas RH | `pendiente` | Por colaborador y globales. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `RhAlertsPage` | `pendiente` | Vista de alertas consolidada. |
| FE-02 | Integrar resumen de alertas en dashboard RH | `pendiente` | Faltantes, por vencer y vencidos. |
| FE-03 | Crear filtros por colaborador, area o estado | `pendiente` | Para operacion diaria de RH. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alertas de expediente incompleto | `pendiente` | Deben reflejar reglas del catalogo. |
| QA-02 | Validar alertas por vencimiento | `pendiente` | Deben activarse con fechas reales. |
| QA-03 | Validar dashboard RH con metricas de seguimiento | `pendiente` | Debe ser consistente con el backend. |

## Definicion de terminado del sprint

- existen alertas funcionales
- RH puede identificar faltantes y vencimientos
- dashboard RH muestra seguimiento documental

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 7 creado | `completada` | Base para futura ejecucion. |
