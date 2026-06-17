# Sprint 37 - Notificaciones por Correo y SMS (LabsMobile)

Estado general del sprint: `pendiente`

Objetivo:
Notificar al colaborador, por correo y SMS, que su evaluacion esta disponible e indicarle que cuenta con 72 horas para realizarla; y notificar a RH cuando un colaborador queda no acreditado (< 80%) para su recapacitacion. Se introduce un canal de notificacion abstracto, se integra LabsMobile para SMS y se registra una bitacora de envios para trazabilidad.

Dependencia:
Requiere Sprint 32 (asignaciones, telefono del colaborador) y consume la senal de no-acreditado del Sprint 33/34.

## Bloque 1 - Modelo de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-66 | Tabla `notification_log` | `pendiente` | Auditoria: `channel` ('email'|'sms'), `recipient`, `template`, `assignment_id` (nullable), `status` ('sent'|'failed'), `error`, `sent_at`. Trazabilidad ISO. |

## Bloque 2 - Backend (canal abstracto + SMS)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-67 | Interface `NotificationChannel` | `pendiente` | Abstraer envio; `EmailChannel` envuelve el `email.service.ts` existente. |
| EVAL-68 | `SmsChannel` con LabsMobile | `pendiente` | Integrar API HTTP de LabsMobile; credenciales por env (`LABSMOBILE_USER`/`LABSMOBILE_TOKEN`) validadas en `config/env.ts`. Manejo de error no bloqueante + registro en log. |
| EVAL-69 | Plantillas de mensaje | `pendiente` | Correo + SMS de "evaluacion disponible - 72h"; correo a RH de "colaborador no acreditado - recapacitacion". Texto breve para SMS. |
| EVAL-70 | Disparo al asignar y al no-acreditar | `pendiente` | Al instanciar (Sprint 32): enviar correo + SMS y marcar `notified_email_at`/`notified_sms_at`. Al failed: notificar a RH. Todo registrado en `notification_log`. |

## Bloque 3 - Frontend / Operacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-71 | Documentar env de LabsMobile | `pendiente` | `.env.example` + README seccion notificaciones. |
| EVAL-72 | Vista de bitacora de envios (RH) | `pendiente` | Listado de notificaciones por asignacion/colaborador para soporte y auditoria (paginado). |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-73 | Pruebas | `pendiente` | Backend: canal abstracto (mock), registro en log en exito/fallo, no bloquea el flujo si SMS falla. |
| EVAL-74 | Build, lint y commit/push | `pendiente` | Verdes. Migracion aplicada. |

## Definicion de terminado

- al quedar disponible la evaluacion, el colaborador recibe correo + SMS con la ventana de 72h
- al quedar no acreditado, RH recibe el aviso de recapacitacion
- todo envio queda registrado en `notification_log`; un fallo de SMS no rompe el flujo
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 37 creado | `pendiente` | Canal de notificacion abstracto + SMS LabsMobile + bitacora de envios. |
