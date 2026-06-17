# Roadmap - Modulo de Evaluaciones de Capacitacion y Constancias (ISO 15189:2022)

Estado general del roadmap: `pendiente`

Objetivo general:
Construir, dentro del modulo RH, un flujo completo de evaluacion de capacitacion para colaboradores exigido por ISO 15189:2022: cerrada una capacitacion, el sistema instancia una evaluacion por colaborador, le notifica (SMS + correo + aviso in-app) que cuenta con 72 horas para realizarla, la califica de forma automatica (o manual cuando hay preguntas abiertas) y, si obtiene >= 80%, genera y archiva en automatico su constancia anual en su seccion de Constancias del expediente, visualizable al instante.

## Principios

- no romper funcionalidad existente de QUALITY, RH ni HELPDESK
- reusar lo que ya existe: `employee_documents` + `uploads/documents` + visor PDF, `email.service.ts`, patron modulo (rutas -> controller -> service -> schema Zod -> migracion SQL), roles por modulo RH
- cada archivo se mantiene < 1000 LOC (estandar del proyecto)
- toda entrada validada con Zod; respuesta de error 400 uniforme
- cada sprint cierra con `npm run build` correcto en backend y frontend, tests verdes y commit + push

## Decisiones de diseno confirmadas

- SMS via **LabsMobile** (API HTTP). Se agrega campo telefono a `employees`, capturado al registrar el colaborador.
- Notificacion de disponibilidad: correo + SMS + aviso in-app, con ventana de **72 horas**. Vencida, el colaborador pide a RH **autorizacion extemporanea** (RH reabre con nueva ventana).
- Calificacion aprobatoria **80%**. **Intento unico**: si < 80% -> "no acreditado" y el sistema **notifica a RH para recapacitacion** (RH reasigna; el colaborador no reintenta solo).
- Constancia con **vigencia anual** (emision + 12 meses); reusa las alertas de vencimiento existentes.
- **Banco de preguntas por capacitacion**; al crear la evaluacion RH elige entregar **todo el banco** o un **subconjunto aleatorio** (N de M).
- Tipos de pregunta: opcion unica / multiple / V-F = **auto-calificables**; **abiertas = calificacion manual** por RH.
- **Constancia disenable**: RH disena la plantilla (logo, texto con placeholders, 1..N firmas) y puede ver un **preliminar** (render con datos de muestra) antes de publicar.
- UI del colaborador **responsiva** (smartphone / tablet / escritorio) con animaciones **motion.dev** (`motion@12`, ya instalado) y **mensaje de felicitacion segun calificacion**.

## Estructura de sprints

| Sprint | Nombre | Entrega | Estado |
| --- | --- | --- | --- |
| 31 | Base: capacitaciones, plantillas y banco de preguntas | Modelo de datos + CRUD + UI de diseno; campo telefono en alta de colaborador | `pendiente` |
| 32 | Asignacion e instanciacion + aviso in-app | Instanciar evaluacion por colaborador (all/random), estados, deadline 72h, badge/banner de pendiente | `pendiente` |
| 33 | Captura, auto-calificacion y resultados (motion) | UI responsiva con motion.dev, envio, auto-calificacion, pantalla de resultados con mensaje segun nota | `pendiente` |
| 34 | Calificacion manual (operador / RH) | Redaccion de preguntas manuales y calificacion de respuestas abiertas; recalculo y resolucion | `pendiente` |
| 35 | Disenador de constancia + vista preliminar | Motor PDF (pdfkit), plantilla disenable (logo/texto/firmas), endpoint de preliminar con datos de muestra | `pendiente` |
| 36 | Generacion real de constancia + auto-archivo | Al passed (>=80%) generar PDF real, archivar en expediente (issue+expiry 12m), visualizacion inmediata | `pendiente` |
| 37 | Notificaciones (correo + LabsMobile SMS) | Canal de notificacion abstracto, SMS LabsMobile, aviso de disponibilidad y de no-acreditado, log de envios | `pendiente` |
| 38 | Scheduler 72h, vencimiento y extemporaneo | node-cron: recordatorio, marcar vencidas + avisar RH, flujo de autorizacion extemporanea | `pendiente` |
| 39 | QA, trazabilidad ISO, dashboard y cierre | Dashboard RH, reporte de trazabilidad ISO 15189, auditoria, tests, documentacion | `pendiente` |

## Dependencias sugeridas

1. 31 es la base de todo (modelo de datos).
2. 32 depende de 31; 33 depende de 32; 34 depende de 33.
3. 35 (disenador/preliminar) depende de 31 y aporta el motor PDF que reusa 36.
4. 36 depende de 33 (resultado passed) y 35 (motor PDF).
5. 37 (notificaciones) habilita los avisos reales que consume 38 (scheduler/recordatorios/extemporaneo).
6. 39 cierra: integra todo, trazabilidad ISO y QA final.

## Definicion de exito

El modulo se considera logrado cuando:

- RH puede crear capacitaciones, su banco de preguntas y la plantilla de constancia con preliminar
- el sistema instancia evaluaciones por colaborador y notifica por correo, SMS y en la app con ventana de 72h
- el colaborador contesta desde cualquier dispositivo, con UI moderna y recibe mensaje segun su nota
- las evaluaciones objetivas se califican solas; las abiertas las califica RH
- al >= 80% se genera y archiva la constancia anual, visible de inmediato; al < 80% se notifica a RH para recapacitacion
- el vencimiento a 72h y la autorizacion extemporanea funcionan via scheduler
- existe trazabilidad y reportes suficientes para auditoria ISO 15189:2022

## Bitacora general

| Fecha | Hito | Estado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Se define el roadmap del modulo de Evaluaciones y Constancias | `pendiente` | 9 sprints (31-39). Decisiones de diseno confirmadas con el usuario. Arranca despues de cerrar la V3. |
