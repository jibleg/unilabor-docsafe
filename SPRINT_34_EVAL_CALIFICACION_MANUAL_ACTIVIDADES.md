# Sprint 34 - Calificacion Manual (Operador / RH)

Estado general del sprint: `pendiente`

Objetivo:
Cubrir el caso en que, por la naturaleza de la evaluacion, las preguntas requieren intervencion humana: RH/operador redacta las preguntas manuales (ya soportadas como tipo 'open' en el banco) y califica las respuestas abiertas de las evaluaciones que quedaron en estado 'grading'. Al cerrar la calificacion, el sistema recalcula el porcentaje y resuelve passed/failed con el mismo umbral de 80%.

Dependencia:
Requiere Sprint 33 (evaluaciones en estado 'grading' con respuestas abiertas).

## Bloque 1 - Backend (calificacion manual)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-39 | Bandeja de calificacion pendiente | `pendiente` | `GET /rh/evaluations/grading`: asignaciones en 'grading' (paginado, por capacitacion/colaborador). |
| EVAL-40 | Detalle para calificar | `pendiente` | `GET /rh/evaluations/:id/grading`: respuestas abiertas del colaborador + puntos posibles por pregunta. |
| EVAL-41 | Calificar respuestas abiertas | `pendiente` | `POST /rh/evaluations/:id/grade`: RH asigna `points_awarded` por respuesta abierta, con `graded_by_user_id`. Validar 0 <= puntos <= puntos de la pregunta. |
| EVAL-42 | Resolver evaluacion | `pendiente` | Al completar todas las abiertas: recalcular `percentage`, fijar `graded_at` y resolver 'passed' (>=80) / 'failed' (<80). Disparar generacion de constancia (Sprint 36) si passed; senal de no-acreditado si failed. |

## Bloque 2 - Frontend (UI de calificacion)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-43 | Bandeja RH de pendientes de calificar | `pendiente` | Listado con filtro por capacitacion; indicador de cuantas abiertas faltan. |
| EVAL-44 | Pantalla de calificacion | `pendiente` | Mostrar pregunta abierta + respuesta del colaborador + control de puntos; resumen de avance y boton de cierre. |
| EVAL-45 | Reflejo de resultado al colaborador | `pendiente` | Una vez resuelta, "Mis evaluaciones" muestra el estado final y, si passed, el acceso a la constancia. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-46 | Pruebas | `pendiente` | Backend: calificacion de abiertas, recalculo de porcentaje, resolucion passed/failed, validacion de rango de puntos. |
| EVAL-47 | Build, lint y commit/push | `pendiente` | Verdes. |

## Definicion de terminado

- RH puede ver y calificar las respuestas abiertas pendientes
- al cerrar la calificacion el sistema recalcula y resuelve passed/failed
- el resultado se refleja al colaborador
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 34 creado | `pendiente` | Calificacion manual de preguntas abiertas por RH/operador. |
