# Sprint 38 - Scheduler de 72h, Vencimiento y Autorizacion Extemporanea

Estado general del sprint: `pendiente`

Objetivo:
Cerrar el ciclo de la ventana de 72 horas con un scheduler en proceso (node-cron): enviar recordatorio cuando se acerca el vencimiento, marcar como vencidas las evaluaciones no realizadas y avisar a RH, e implementar el flujo de autorizacion extemporanea por el cual RH reabre una evaluacion vencida con una nueva ventana.

Dependencia:
Requiere Sprint 32 (deadline_at) y Sprint 37 (canales de notificacion para recordatorios/avisos).

## Bloque 1 - Backend (scheduler)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-75 | Integrar node-cron | `pendiente` | Scheduler in-process arrancado desde `index.ts` (guardado por env para no duplicar en multi-instancia). Job periodico (ej. cada 15 min). |
| EVAL-76 | Recordatorio antes de vencer | `pendiente` | Para asignaciones 'pending'/'in_progress' con poco tiempo restante (ej. <= 24h) y sin `reminder_sent_at`: enviar correo/SMS y marcar. |
| EVAL-77 | Marcado de vencidas | `pendiente` | Asignaciones cuyo `deadline_at` paso y siguen sin enviar: pasar a 'expired' y notificar a RH. Transaccional/idempotente. |

## Bloque 2 - Backend (extemporaneo)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-78 | Solicitud de extemporaneo | `pendiente` | El colaborador (o RH a su nombre) registra la solicitud sobre una asignacion 'expired'. |
| EVAL-79 | Autorizacion por RH | `pendiente` | `POST /rh/evaluations/:id/authorize-late`: reabre con nueva ventana (`available_at`/`deadline_at`), estado 'authorized_late', `attempt_no` se mantiene (sigue siendo intento unico de evaluacion, solo se reabre la ventana). Auditar quien autoriza. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-80 | Estado vencido y solicitud | `pendiente` | En "Mis evaluaciones", una evaluacion vencida muestra el estado y el boton para solicitar autorizacion a RH. |
| EVAL-81 | Panel RH de extemporaneos | `pendiente` | RH ve solicitudes y autoriza con un clic (reabre ventana). Refleja la nueva fecha limite. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-82 | Pruebas | `pendiente` | Backend: recordatorio una sola vez, marcado de vencidas idempotente, reapertura por autorizacion. Probar la logica del job con reloj inyectable (sin depender de Date real). |
| EVAL-83 | Build, lint y commit/push | `pendiente` | Verdes. |

## Definicion de terminado

- un scheduler envia recordatorios y marca vencidas las evaluaciones no realizadas, avisando a RH
- existe el flujo de autorizacion extemporanea que reabre la ventana
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 38 creado | `pendiente` | node-cron para recordatorio/vencimiento + autorizacion extemporanea por RH. |
