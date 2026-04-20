# Sprint 7 - Alertas y Seguimiento

Estado general del sprint: `completada`

Objetivo:
Agregar valor operativo al modulo RH con alertas de faltantes, vigencias y seguimiento del expediente.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear servicio de alertas por expediente incompleto | `completada` | Basado en tipos obligatorios y documentos vigentes faltantes. |
| BE-02 | Crear servicio de alertas por documento por vencer | `completada` | Enfocado en constancias con vigencia dentro de 30 dias. |
| BE-03 | Crear servicio de alertas por documento vencido | `completada` | Prioriza constancias ya vencidas. |
| BE-04 | Crear endpoints de consulta de alertas RH | `completada` | Disponibles en `/api/rh/alerts` y `/api/rh/employees/:id/alerts`. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `RhAlertsPage` | `completada` | Vista consolidada de alertas RH implementada. |
| FE-02 | Integrar resumen de alertas en dashboard RH | `completada` | Dashboard RH ya muestra faltantes, por vencer y vencidos. |
| FE-03 | Crear filtros por colaborador, area o estado | `completada` | Filtros operativos en la pantalla de alertas RH. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alertas de expediente incompleto | `completada` | Las alertas se calculan contra tipos obligatorios activos. |
| QA-02 | Validar alertas por vencimiento | `completada` | Las alertas se activan segun fechas reales y ventana de 30 dias. |
| QA-03 | Validar dashboard RH con metricas de seguimiento | `completada` | Dashboard y pagina RH consumen el mismo resumen backend. |

## Definicion de terminado del sprint

- existen alertas funcionales
- RH puede identificar faltantes y vencimientos
- dashboard RH muestra seguimiento documental

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 7 creado | `completada` | Base para futura ejecucion. |
| 2026-04-17 | Alertas RH implementadas | `completada` | Se agregaron servicio backend, endpoints, vista consolidada y dashboard con seguimiento documental. |
| 2026-04-17 | Validacion tecnica del sprint | `completada` | `npm run build` paso en backend y frontend. |
