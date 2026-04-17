# Sprint 6 - Permisos Sensibles y Constancias

Estado general del sprint: `completada`

Objetivo:
Cerrar las reglas de acceso a documentos sensibles y el manejo de vigencia para la seccion `Constancias`.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Implementar politica de documentos sensibles | `completada` | Admin/editor ven todos; colaborador solo sus propios documentos RH. |
| BE-02 | Implementar validaciones de `has_expiry` para constancias | `completada` | Se exige fecha de emision y fecha de vencimiento validas. |
| BE-03 | Calcular estado documental de constancias | `completada` | Se calcula `valid`, `expiring`, `expired` y `uploaded`. |
| BE-04 | Exponer filtros por estado de vigencia | `completada` | Los endpoints RH de documentos soportan `expiry_status`. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Mostrar badges de sensibilidad | `completada` | Se muestran en expediente RH y portal propio cuando aplica. |
| FE-02 | Mostrar badges de vigencia en constancias | `completada` | Se reflejan en tarjetas del expediente y resumen RH. |
| FE-03 | Ajustar formularios de carga para constancias | `completada` | El modal y el frontend exigen fechas para tipos con vigencia. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar acceso de RH a documentos sensibles de todos | `completada` | Las rutas administrativas RH y el visor siguen habilitados para admin/editor. |
| QA-02 | Validar acceso del colaborador solo a sensibles propios | `completada` | `me/*` y el visor RH bloquean acceso a expedientes ajenos. |
| QA-03 | Validar bloqueo a terceros de documentos sensibles | `completada` | El backend valida propiedad del documento en el visor y en la carga propia. |
| QA-04 | Validar calculo correcto de vigencia en constancias | `completada` | La vigencia se calcula con fecha actual y ventana de 30 dias. |

## Definicion de terminado del sprint

- documentos sensibles protegidos correctamente
- constancias manejan vigencia
- frontend muestra estados de vencimiento

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 6 creado | `completada` | Base para futura ejecucion. |
| 2026-04-17 | Reglas de sensibles y constancias implementadas | `completada` | Se reforzo backend con acceso por propietario, validacion de vigencia y filtros por `expiry_status`. |
| 2026-04-17 | Validacion tecnica del sprint | `completada` | `npm run build` paso en backend y frontend con los cambios del sprint. |
