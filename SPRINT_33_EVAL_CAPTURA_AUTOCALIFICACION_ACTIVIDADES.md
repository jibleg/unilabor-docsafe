# Sprint 33 - Captura, Auto-calificacion y Pantalla de Resultados (motion.dev)

Estado general del sprint: `completada`

Objetivo:
Permitir que el colaborador conteste su evaluacion desde cualquier dispositivo, con una UI moderna, minimalista y profesional animada con motion.dev. Al enviar, el sistema auto-califica las preguntas objetivas, calcula el porcentaje y muestra una pantalla de resultados con mensaje de felicitacion segun la nota. Si la evaluacion tiene preguntas abiertas, queda en estado de calificacion pendiente (resuelve Sprint 34). Intento unico: si < 80% se marca no acreditado y se deja la senal para notificar a RH (envio real en Sprint 37).

Dependencia:
Requiere Sprint 32 (asignaciones con snapshot de preguntas).

## Bloque 1 - Modelo de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-28 | Tabla `evaluation_responses` | `completada` | `assignment_id`, `question_id`, `selected_option_ids` (jsonb, para single/multiple/boolean), `text_answer` (para open), `is_correct` (nullable hasta calificar), `points_awarded`, `graded_by_user_id`, timestamps. |

## Bloque 2 - Backend (captura + auto-calificacion)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-29 | Iniciar evaluacion | `completada` | `POST /me/evaluations/:id/start`: valida ventana vigente (no vencida), pasa a 'in_progress', fija `started_at`. Devuelve las preguntas del snapshot SIN marcar las respuestas correctas. |
| EVAL-30 | Guardar/enviar respuestas | `completada` | `POST /me/evaluations/:id/submit`: persiste respuestas, valida que la ventana siga vigente. Transaccional. |
| EVAL-31 | Auto-calificacion | `completada` | Calcular `points_awarded` por pregunta objetiva (single/boolean exacto; multiple segun regla definida), sumar y obtener `percentage`. Si NO hay abiertas: resolver 'passed' (>=80) / 'failed' (<80). Si hay abiertas: estado 'grading'. |
| EVAL-32 | Senal de no-acreditado | `completada` | Al quedar 'failed', registrar la senal para notificar a RH (consumida por Sprint 37). No reintentos del colaborador. |

## Bloque 3 - Frontend (UI responsiva + motion + resultados)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-33 | Pantalla de evaluacion responsiva | `completada` | Layout fluido smartphone/tablet/escritorio; en movil una pregunta a la vez con barra de progreso. Soporta single/multiple/boolean/open. |
| EVAL-34 | Animaciones motion.dev | `completada` | `motion@12` (ya instalado): transiciones entre preguntas, micro-interacciones de seleccion, entrada de resultados. Diseno minimalista y profesional. |
| EVAL-35 | Pantalla de resultados con mensaje por nota | `completada` | 100% perfecto / 90-99 excelente / 80-89 felicidades acreditaste (animacion celebratoria); <80 mensaje de apoyo + aviso de recapacitacion (tono sobrio). En passed, boton "Ver constancia" (habilita Sprint 36). En grading, mensaje "tu evaluacion sera revisada por RH". |
| EVAL-36 | Bloqueo por ventana vencida | `completada` | Si la ventana vencio, UI muestra el camino para solicitar autorizacion extemporanea a RH (flujo real en Sprint 38). |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-37 | Pruebas | `completada` | Backend: auto-calificacion (single/multiple/boolean), umbral 80, deteccion de abiertas -> grading, rechazo por ventana vencida. Frontend: render por tipo de pregunta y mensajes por rango de nota. |
| EVAL-38 | Build, lint y commit/push | `completada` | Verdes. Migracion aplicada. |

## Definicion de terminado

- el colaborador contesta desde cualquier dispositivo con UI moderna animada
- las evaluaciones objetivas se califican solas con umbral 80%
- las que tienen abiertas quedan en 'grading'
- la pantalla de resultados muestra el mensaje correcto segun la nota
- < 80% deja la senal para notificar a RH; sin reintentos del colaborador
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 33 creado | `pendiente` | Captura responsiva + motion.dev + auto-calificacion + resultados por nota. |
| 2026-06-17 | Sprint 33 ejecutado completo | `completada` | Migracion `sql/20260617_08_eval_responses` aplicada. Backend: `evaluation-attempt.service.ts` (start valida ventana/propiedad y pasa a in_progress; submit reemplaza respuestas, auto-califica objetivas por coincidencia exacta del conjunto correcto -todo o nada-, calcula percentage; con preguntas abiertas -> 'grading', sin abiertas -> passed/failed segun passing_score; intento unico), endpoints `/me/evaluations/:id` (detalle sin exponer correctas), `/start`, `/submit` (Zod). Frontend: `TakeEvaluationPage` responsiva con motion (AnimatePresence entre preguntas, barra de progreso, una pregunta a la vez, opciones radio/checkbox/abierta), pantalla de resultados con mensaje por nota (100 perfecto / 90-99 excelente / 80-89 acreditaste / <80 apoyo + aviso RH / grading en revision) y animacion celebratoria al aprobar; bloqueo por ventana vencida con mensaje de extemporaneo; boton 'Realizar' habilitado (navega a /rh/my-evaluations/:id). Backend 82 tests / frontend 26, builds+lint OK. Smoke e2e: correcto->passed 100, incorrecto->failed 0, abierta->grading 2/3. |
