# Manual Operativo - Mesa de Ayuda, Activos y Mantenimiento

Version: `1.0`

Fecha: `2026-04-22`

Modulo: `HELPDESK`

## Objetivo

Guiar el uso operativo del modulo de mesa de ayuda, inventario tecnico de activos, mantenimiento preventivo/correctivo, retorno a operacion y trazabilidad alineada a ISO 15189:2022.

El modulo se integra con:

- RH: colaboradores, usuarios vinculados, areas y responsables.
- QUALITY: documentos controlados, procedimientos, evidencias y soporte de auditoria.

## Roles operativos

### ADMIN

Puede administrar todo el modulo:

- consultar dashboard e indicadores
- crear, editar y dar seguimiento a activos
- crear y atender solicitudes
- crear planes de mantenimiento
- iniciar, reprogramar y cerrar ordenes
- registrar evaluacion ISO/riesgo
- documentar liberacion tecnica
- consultar portal personal

### EDITOR

Puede operar el modulo:

- consultar dashboard
- administrar activos
- atender tickets
- ejecutar mantenimiento
- documentar solucion, retorno, riesgo y liberacion
- consultar portal personal

### VIEWER / colaborador

Puede usar el portal personal:

- consultar sus equipos asignados
- crear solicitudes sobre sus equipos
- consultar sus solicitudes
- agregar comentarios
- confirmar funcionamiento cuando soporte ya registro solucion

## Flujo 1 - Inventario tecnico de activos

Ruta: `/helpdesk/assets`

Uso principal:

1. Registrar activo con codigo interno, nombre, categoria, marca, modelo y numero de serie.
2. Clasificar ubicacion, area, criticidad y estado operativo.
3. Asignar colaborador responsable o usuario asignado desde RH.
4. Mantener estado operativo actualizado: operativo, condicionado, mantenimiento, fuera de servicio o retirado.

Campos minimos recomendados:

- codigo interno
- nombre del equipo
- categoria
- ubicacion
- area
- marca/modelo/serie cuando aplique
- criticidad
- estado operativo
- colaborador asignado o responsable

## Flujo 2 - Mesa de ayuda operativa

Ruta operativa: `/helpdesk/tickets`

Ruta colaborador: `/helpdesk/my-portal`

Estados sugeridos:

- Nuevo
- En revision
- Asignado
- En proceso
- Esperando refaccion
- Esperando proveedor
- Solucionado
- Validado
- Cerrado
- Cancelado

Proceso:

1. Crear solicitud con activo relacionado, tipo, prioridad, descripcion e impacto.
2. Asignar responsable.
3. Agregar comentarios de seguimiento.
4. Registrar solucion tecnica con fecha y resumen.
5. Validar retorno a operacion con fecha real.
6. Registrar estado posterior del equipo.

Regla clave:

- `Solucionado` significa que soporte o proveedor aplico una correccion.
- `Retorno a operacion` significa que el responsable valido que el equipo puede usarse nuevamente.

## Flujo 3 - Evaluacion ISO/riesgo

Ruta: detalle de solicitud en `/helpdesk/tickets`

Debe registrarse cuando una falla puede afectar resultados, continuidad o seguridad operativa.

Campos:

- nivel de riesgo
- evaluacion de impacto
- uso en analisis recientes
- uso de equipo alterno
- necesidad de accion correctiva
- bloqueo operativo
- liberacion tecnica requerida

Regla de control:

Si el ticket tiene impacto a resultados, riesgo alto/critico o bloqueo operativo, el retorno a operacion requiere liberacion tecnica documentada.

## Flujo 4 - Planes de mantenimiento preventivo

Ruta: `/helpdesk/maintenance`

Proceso:

1. Crear plan por activo.
2. Definir frecuencia: mensual, trimestral, semestral, anual o personalizada.
3. Definir responsable, proveedor externo y tolerancia.
4. Registrar checklist base.
5. Generar orden programada.

Cada plan mantiene ordenes programadas para ejecucion y seguimiento.

## Flujo 5 - Ejecucion de mantenimiento

Ruta: `/helpdesk/maintenance`

Acciones de orden:

- iniciar orden
- reprogramar con justificacion
- cerrar orden

Al cerrar orden se registra:

- fecha de cierre
- actividades realizadas
- hallazgos
- proveedor externo
- evidencia o certificado referenciado
- resultado: conforme, no conforme o requiere seguimiento
- checklist ejecutado

Cuando la orden se cierra, el sistema calcula la siguiente fecha segun frecuencia del plan y genera la siguiente orden programada.

## Flujo 6 - Portal del colaborador

Ruta: `/helpdesk/my-portal`

El colaborador puede:

- ver sus equipos
- reportar falla o solicitud
- consultar sus solicitudes
- agregar comentarios
- confirmar funcionamiento cuando ya existe solucion

Seguridad:

- solo puede ver activos asignados o bajo su responsabilidad
- solo puede ver tickets propios
- backend valida la vinculacion con RH

## Dashboard e indicadores

Ruta: `/helpdesk/dashboard`

Incluye:

- activos registrados
- tickets abiertos
- mantenimientos proximos
- equipos fuera de servicio
- tickets criticos
- tickets vencidos
- impacto a resultados
- liberacion tecnica pendiente
- promedio de solucion
- promedio fuera de operacion
- disponibilidad por estado
- cumplimiento preventivo
- reincidencias por equipo
- reporte por area
- trazabilidad auditable reciente

## Evidencia para ISO 15189:2022

El modulo soporta trazabilidad de:

- identificacion unica de equipos
- responsable y ubicacion
- estado operativo vigente
- fallas y acciones tomadas
- solucion tecnica
- retorno a operacion
- tiempo fuera de servicio
- mantenimiento preventivo/correctivo
- evaluacion de impacto a resultados
- liberacion tecnica
- proveedor externo cuando aplique
- historial y auditoria de acciones

## Validaciones recomendadas antes de auditoria

- Todo equipo critico debe tener responsable y estado operativo.
- Todo ticket con impacto a resultados debe tener evaluacion ISO/riesgo.
- Todo retorno a operacion de equipo critico debe tener liberacion tecnica cuando aplique.
- Toda orden de mantenimiento debe tener resultado y evidencia referenciada.
- Los equipos fuera de servicio deben permanecer bloqueados hasta validacion o liberacion.
