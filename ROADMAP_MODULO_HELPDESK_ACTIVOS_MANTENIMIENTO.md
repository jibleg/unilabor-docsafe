# Roadmap - Modulo Mesa de Ayuda, Activos y Mantenimiento

Estado general del modulo: `completada`

Objetivo general:
Construir un modulo `HELPDESK` para mesa de ayuda operativa, gestion tecnica de activos del laboratorio, mantenimiento preventivo/correctivo, trazabilidad, retorno a operacion y soporte al cumplimiento ISO 15189:2022.

## Vision del modulo

El modulo debe cubrir dos lineas conectadas:

- mesa de ayuda operativa: solicitudes, fallas, reparaciones, seguimiento y solucion
- gestion tecnica de activos y mantenimiento: inventario, asignaciones, planes preventivos, ordenes, evidencias y trazabilidad

No se construira como un helpdesk generico. Debe funcionar como un sistema de gestion de equipos criticos del laboratorio.

## Integracion con modulos existentes

### Integracion con RH

RH aporta la base de colaboradores, areas y usuarios vinculados.

El modulo `HELPDESK` usara RH para:

- asignar equipos a colaboradores, areas o ubicaciones
- mostrar equipos asignados a cada colaborador
- permitir que colaboradores reporten fallas de sus equipos
- relacionar tickets con colaborador, area y puesto
- identificar responsables de validacion y retorno a operacion

### Integracion con QUALITY

QUALITY aporta procedimientos, documentos controlados y contexto de cumplimiento.

El modulo `HELPDESK` usara QUALITY para:

- vincular equipos con procedimientos vigentes de uso, limpieza o mantenimiento
- vincular planes de mantenimiento con documentos controlados
- asociar evidencias, reportes y certificados
- documentar impacto de fallas sobre resultados del laboratorio
- facilitar auditoria y trazabilidad institucional

## Principios de cumplimiento ISO 15189:2022

El modulo debe ayudar a demostrar:

- identificacion unica de equipos e instrumentos
- estado operativo vigente del equipo
- historial de mantenimiento preventivo y correctivo
- registro de fallas, reparaciones y retorno a operacion
- evidencia documental de intervenciones
- trazabilidad de responsables, fechas y decisiones
- evaluacion de impacto cuando una falla puede afectar resultados
- control de proveedor externo cuando aplique
- liberacion tecnica antes de volver a usar equipos criticos

## Estados sugeridos de ticket

- `nuevo`
- `en_revision`
- `asignado`
- `en_proceso`
- `esperando_refaccion`
- `esperando_proveedor`
- `solucionado`
- `validado`
- `cerrado`
- `cancelado`

## Campos criticos de solucion y retorno a operacion

Para reportes de falla, reparacion o mantenimiento correctivo:

- `solved_at`: fecha/hora en que soporte declara solucionada la falla
- `solution_summary`: descripcion de la solucion aplicada
- `return_to_operation_at`: fecha/hora en que el equipo vuelve a operacion
- `validated_by_user_id`: usuario que valida retorno a operacion
- `validated_at`: fecha/hora de validacion
- `downtime_minutes`: tiempo fuera de operacion
- `equipment_status_after_solution`: estado posterior del equipo

Regla central:

- `solucionado` significa que soporte/proveedor aplico una correccion
- `retorno a operacion` significa que el responsable valido que el equipo puede usarse nuevamente

## Estructura de sprints

| Sprint | Nombre | Objetivo principal | Estado |
| --- | --- | --- | --- |
| 13 | Arquitectura del modulo HELP DESK | Habilitar modulo, permisos, rutas y catalogos base | `completada` |
| 14 | Gestion tecnica de activos | Crear inventario tecnico y asignacion de equipos | `completada` |
| 15 | Mesa de ayuda operativa | Crear y gestionar tickets de soporte/falla/reparacion | `completada` |
| 16 | Solucion y retorno a operacion | Registrar solucion, validacion y disponibilidad del equipo | `completada` |
| 17 | Planes de mantenimiento preventivo | Crear planes, frecuencias, calendario y alertas | `completada` |
| 18 | Ejecucion de mantenimiento | Ejecutar ordenes, checklist, evidencias y cierre | `completada` |
| 19 | Cumplimiento ISO y evaluacion de riesgo | Evaluar impacto, liberar equipo y vincular procedimientos | `completada` |
| 20 | Dashboards, KPIs y reportes | Dar seguimiento operativo y reportes auditables | `completada` |
| 21 | Portal del colaborador para mesa de ayuda | Mostrar mis equipos y mis solicitudes | `completada` |
| 22 | Cierre operativo y documentacion | QA, manuales, migraciones finales y commit/push | `completada` |

## Lineas de accion por sprint

### Sprint 13 - Arquitectura del modulo HELP DESK

- crear modulo `HELPDESK`
- agregar permisos por modulo
- crear rutas, sidebar y dashboard base
- definir roles operativos
- crear catalogos iniciales:
  - categorias de equipo
  - ubicaciones
  - criticidad
  - estados operativos
  - tipos de solicitud
- crear bitacora del sprint

### Sprint 14 - Gestion tecnica de activos

- CRUD de equipos/activos
- codigo interno, nombre, categoria, marca, modelo y numero de serie
- ubicacion, area responsable y colaborador asignado
- proveedor, fecha de adquisicion y garantia
- criticidad y estado operativo
- documentos/evidencias del equipo
- historial basico del activo

### Sprint 15 - Mesa de ayuda operativa

- creacion de tickets desde equipos asignados
- tipos de solicitud:
  - falla
  - reparacion
  - soporte
  - mantenimiento correctivo
  - revision
  - requerimiento
- prioridad e impacto operativo
- comentarios y evidencias
- auditoria de cambios

### Sprint 16 - Solucion y retorno a operacion

- registrar solucion tecnica
- capturar `solved_at` y `solution_summary`
- registrar `return_to_operation_at`
- validacion por responsable
- calculo de tiempo fuera de operacion
- cambio de estado del equipo
- historial completo por equipo

### Sprint 17 - Planes de mantenimiento preventivo

- planes por equipo
- frecuencia y proxima ejecucion
- tolerancia y responsable
- procedimiento relacionado de QUALITY
- checklist requerido
- evidencia requerida
- calendario y alertas

### Sprint 18 - Ejecucion de mantenimiento

- ordenes de mantenimiento
- actividades realizadas
- checklist de ejecucion
- proveedor externo si aplica
- evidencia de cierre
- resultado conforme/no conforme/requiere seguimiento
- reprogramacion justificada

### Sprint 19 - Cumplimiento ISO y evaluacion de riesgo

- evaluacion de impacto por falla
- posible afectacion de resultados
- uso de equipo alterno
- necesidad de accion correctiva
- bloqueo o senalizacion de equipo fuera de servicio
- liberacion tecnica antes de volver a operacion
- vista de auditoria por equipo

### Sprint 20 - Dashboards, KPIs y reportes

- tickets abiertos, criticos y vencidos
- mantenimientos proximos y vencidos
- cumplimiento preventivo
- tiempo promedio de respuesta
- tiempo promedio de solucion
- tiempo fuera de operacion
- reincidencias por equipo
- reportes exportables para auditoria

### Sprint 21 - Portal del colaborador para mesa de ayuda

- vista `Mis equipos`
- crear ticket desde equipo asignado
- consultar estado de mis solicitudes
- agregar comentarios o evidencia
- confirmar funcionamiento cuando aplique

### Sprint 22 - Cierre operativo y documentacion

- QA por roles
- pruebas de alta de equipo
- pruebas de ticket de falla
- pruebas de solucion y retorno a operacion
- pruebas de mantenimiento preventivo
- pruebas de evidencias y evaluacion de impacto
- manual operativo
- roadmap actualizado
- build final
- commit y push

## Orden recomendado de implementacion

1. Crear base del modulo y permisos.
2. Crear inventario de equipos.
3. Crear tickets.
4. Implementar solucion y retorno a operacion.
5. Implementar planes y ordenes de mantenimiento.
6. Fortalecer cumplimiento ISO/riesgo.
7. Agregar dashboards y portal colaborador.
8. Cerrar con QA y documentacion.

## Bitacora general

| Fecha | Hito | Estado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Se define roadmap del modulo HELPDESK | `completada` | Se documenta alcance, integracion con RH/QUALITY y sprints 13 a 22. |
| 2026-04-21 | Sprint 13 implementado | `completada` | Modulo, permisos, rutas, dashboard y catalogos base quedaron disponibles. |
| 2026-04-21 | Sprint 14 implementado | `completada` | Inventario tecnico normalizado, CRUD de activos, asignacion RH y migracion local aplicada. |
| 2026-04-21 | Sprint 15 implementado | `completada` | Mesa de ayuda operativa con tickets, estados, prioridades, comentarios y trazabilidad. |
| 2026-04-22 | Sprint 16 implementado | `completada` | Solucion tecnica, retorno a operacion, downtime, validacion y estado posterior del activo. |
| 2026-04-22 | Sprint 17 implementado | `completada` | Planes preventivos con frecuencia, calendario operativo, checklist, responsable y orden inicial. |
| 2026-04-22 | Sprint 18 implementado | `completada` | Ejecucion de ordenes con inicio, reprogramacion justificada, cierre, resultado y checklist ejecutado. |
| 2026-04-22 | Sprint 19 implementado | `completada` | Evaluacion ISO/riesgo en tickets con impacto, bloqueo operativo, accion correctiva y liberacion tecnica. |
| 2026-04-22 | Sprint 20 implementado | `completada` | Dashboard con KPIs de tickets, mantenimiento, disponibilidad, reincidencias, areas y trazabilidad auditable. |
| 2026-04-22 | Sprint 21 implementado | `completada` | Portal del colaborador con equipos propios, solicitudes propias, comentarios y confirmacion de funcionamiento. |
| 2026-04-22 | Sprint 22 implementado | `completada` | Cierre operativo con QA por roles, manuales, migraciones identificadas y validacion final de builds. |
