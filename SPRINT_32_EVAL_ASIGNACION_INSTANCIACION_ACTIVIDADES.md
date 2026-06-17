# Sprint 32 - Asignacion e Instanciacion de Evaluaciones + Aviso In-App

Estado general del sprint: `pendiente`

Objetivo:
Permitir que, al cerrar una capacitacion, el sistema instancie una evaluacion por colaborador (entregando todo el banco o un subconjunto aleatorio segun la plantilla), fijando la ventana de 72 horas. El colaborador ve sus evaluaciones pendientes y, al ingresar, recibe un aviso in-app con cuenta regresiva.

Dependencia:
Requiere Sprint 31 (capacitaciones, plantillas, banco).

## Bloque 1 - Modelo de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-16 | Tabla `evaluation_assignments` | `pendiente` | Instancia por colaborador: `template_id`, `employee_id`, `status` ('pending'|'in_progress'|'submitted'|'grading'|'passed'|'failed'|'expired'|'authorized_late'), `available_at`, `deadline_at`, `started_at`, `submitted_at`, `graded_at`, `score`, `max_score`, `percentage`, `attempt_no`, marcas de notificacion (`notified_email_at`, `notified_sms_at`, `reminder_sent_at`), timestamps. |
| EVAL-17 | Tabla `evaluation_assignment_questions` | `pendiente` | Snapshot de las preguntas que le tocaron a la asignacion (clave para modo aleatorio): `assignment_id`, `question_id`, `sort_order`. |

## Bloque 2 - Backend (asignacion)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-18 | Servicio de instanciacion | `pendiente` | Dada una capacitacion/plantilla y un conjunto de colaboradores: crear asignaciones en transaccion, fijar `available_at`/`deadline_at` (= available + window_hours), y resolver el snapshot de preguntas (todas o N aleatorias deterministas por asignacion). |
| EVAL-19 | Endpoint de asignar | `pendiente` | RH dispara asignacion (manual o "al cerrar capacitacion"). Idempotente: evita duplicar asignacion activa por colaborador. |
| EVAL-20 | Endpoints del colaborador (`/me`) | `pendiente` | `GET /me/evaluations` (mis evaluaciones, paginado) y `GET /me/evaluations/pending-count` (para el badge). El colaborador solo ve las suyas. |
| EVAL-21 | Endpoint de seguimiento RH | `pendiente` | Listado de asignaciones por capacitacion con estado y deadline (paginado + busqueda). |

## Bloque 3 - Frontend (aviso in-app + listado del colaborador)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-22 | Badge de pendientes en nav | `pendiente` | Al ingresar, consultar `pending-count`; mostrar badge en el item del modulo de evaluaciones. Patron on-demand (como alertas RH), sin tabla de notificaciones. |
| EVAL-23 | Banner/toast de bienvenida | `pendiente` | Si hay pendientes: banner "Tienes N evaluacion(es) pendiente(s) - vence en Xh" con enlace al modulo y cuenta regresiva sobre `deadline_at`. |
| EVAL-24 | Pagina "Mis evaluaciones" | `pendiente` | Listado del colaborador con estado, capacitacion, tiempo restante y boton "Realizar" (habilita Sprint 33). |
| EVAL-25 | Vista RH de asignaciones | `pendiente` | Por capacitacion: quien tiene pendiente / en proceso / vencida, con filtros. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-26 | Pruebas | `pendiente` | Backend: instanciacion (snapshot all vs random, deadline correcto, idempotencia). Frontend: pending-count y render del badge. |
| EVAL-27 | Build, lint y commit/push | `pendiente` | Verdes. Migraciones aplicadas. |

## Definicion de terminado

- el sistema instancia evaluaciones por colaborador con snapshot de preguntas (all/random) y ventana de 72h
- el colaborador ve sus evaluaciones y, al ingresar, un aviso in-app con cuenta regresiva
- RH puede seguir el estado de las asignaciones por capacitacion
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 32 creado | `pendiente` | Instanciacion por colaborador + aviso in-app de pendientes. |
