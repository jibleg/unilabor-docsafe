# Sprint 38 - Scheduler de 72h, Vencimiento y Autorizacion Extemporanea

Estado general del sprint: `completada`

Objetivo:
Cerrar el ciclo de la ventana de 72 horas con un scheduler en proceso (node-cron): enviar recordatorio cuando se acerca el vencimiento, marcar como vencidas las evaluaciones no realizadas y avisar a RH, e implementar el flujo de autorizacion extemporanea por el cual RH reabre una evaluacion vencida con una nueva ventana.

Dependencia:
Requiere Sprint 32 (deadline_at) y Sprint 37 (canales de notificacion para recordatorios/avisos).

## Bloque 1 - Backend (scheduler)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-75 | Integrar node-cron | `completada` | Scheduler in-process arrancado desde `index.ts` (guardado por env para no duplicar en multi-instancia). Job periodico (ej. cada 15 min). |
| EVAL-76 | Recordatorio antes de vencer | `completada` | Para asignaciones 'pending'/'in_progress' con poco tiempo restante (ej. <= 24h) y sin `reminder_sent_at`: enviar correo/SMS y marcar. |
| EVAL-77 | Marcado de vencidas | `completada` | Asignaciones cuyo `deadline_at` paso y siguen sin enviar: pasar a 'expired' y notificar a RH. Transaccional/idempotente. |

## Bloque 2 - Backend (extemporaneo)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-78 | Solicitud de extemporaneo | `completada` | El colaborador (o RH a su nombre) registra la solicitud sobre una asignacion 'expired'. |
| EVAL-79 | Autorizacion por RH | `completada` | `POST /rh/evaluations/:id/authorize-late`: reabre con nueva ventana (`available_at`/`deadline_at`), estado 'authorized_late', `attempt_no` se mantiene (sigue siendo intento unico de evaluacion, solo se reabre la ventana). Auditar quien autoriza. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-80 | Estado vencido y solicitud | `completada` | En "Mis evaluaciones", una evaluacion vencida muestra el estado y el boton para solicitar autorizacion a RH. |
| EVAL-81 | Panel RH de extemporaneos | `completada` | RH ve solicitudes y autoriza con un clic (reabre ventana). Refleja la nueva fecha limite. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-82 | Pruebas | `completada` | Backend: recordatorio una sola vez, marcado de vencidas idempotente, reapertura por autorizacion. Probar la logica del job con reloj inyectable (sin depender de Date real). |
| EVAL-83 | Build, lint y commit/push | `completada` | Verdes. |

## Definicion de terminado

- un scheduler envia recordatorios y marca vencidas las evaluaciones no realizadas, avisando a RH
- existe el flujo de autorizacion extemporanea que reabre la ventana
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 38 creado | `pendiente` | node-cron para recordatorio/vencimiento + autorizacion extemporanea por RH. |
| 2026-06-17 | Sprint 38 ejecutado completo | `completada` | Dependencia **node-cron** + migracion `sql/20260617_13` (late_requested_at). Backend: `evaluation-scheduler.service.ts` (helper puro `evaluateTiming` con reloj inyectable; `processReminders` envia recordatorio a <=24h sin previo y marca reminder_sent_at; `processExpirations` marca 'expired' los vencidos y avisa a RH; `runSchedulerTick`; `startEvaluationScheduler` cron */15 guardado por SCHEDULER_ENABLED/SCHEDULER_CRON, arrancado en index.ts tras listen). Extemporaneo en evaluation-assignment.service: `requestLateAuthorization` (colaborador, solo vencidas -> late_requested_at), `authorizeLateAttempt` (RH, reabre ventana=now+window_hours, status 'authorized_late', limpia reminder/late_requested, mismo intento), `listExpiredAssignments`. start/submit/countPending aceptan 'authorized_late'. Notificaciones: notifyEvaluationReminder (correo+SMS) y notifyEvaluationExpiredToRh. Endpoints: POST `/me/evaluations/:id/request-late`; RH `GET /evaluations/expired`, POST `/evaluations/:id/authorize-late`. Frontend: boton 'Solicitar autorizacion' (vencidas) en MyEvaluationsPage + estado 'Solicitud enviada'; pagina `RhLateRequestsPage` (autorizar) + ruta `/rh/late-requests` + item sidebar (Clock); isAssignmentActionable incluye authorized_late. Backend 91 tests (6 nuevos del scheduler) / frontend 26, builds+lint OK. Smoke e2e: expira(1)->solicita->panel(1)->autoriza(reabre futuro, countPending=1)->recordatorio #1=1 marca, #2=0. |
