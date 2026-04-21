# Sprint 10 - Aplicacion de Permisos en Expediente y Alertas

Estado general del sprint: `completada`

Objetivo:
Hacer que la matriz documental por colaborador gobierne el expediente RH, el portal del colaborador, las cargas, el historial y las alertas.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Expediente

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EXP-01 | Filtrar expediente RH por secciones y documentos habilitados | `completada` | Aplica para RH y portal del colaborador. |
| EXP-02 | Ajustar resumen del expediente con solo tipos asignados | `completada` | Total, faltantes, vencidos y avance deben ignorar no asignados. |

## Bloque 2 - Documentos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DOC-01 | Filtrar listado de documentos por matriz asignada | `completada` | No deben aparecer documentos de tipos deshabilitados. |
| DOC-02 | Bloquear carga de documentos no asignados | `completada` | Validacion backend para RH y colaborador. |
| DOC-03 | Bloquear historial y visualizacion no asignados cuando aplique | `completada` | Refuerza seguridad real. |

## Bloque 3 - Alertas

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| ALT-01 | Calcular faltantes solo con documentos habilitados | `completada` | Evita alertas de documentos que no aplican al colaborador. |
| ALT-02 | Calcular vencidos y por vencer solo con documentos habilitados | `completada` | Evita seguimiento de documentos fuera de matriz. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar build backend | `completada` | `npm run build` paso. |
| QA-02 | Validar build frontend | `completada` | `npm run build` paso con advertencia no bloqueante de bundle. |

## Definicion de terminado del sprint

- expediente muestra solo secciones/documentos habilitados por colaborador
- carga de documentos no asignados queda bloqueada
- historial y visualizacion respetan la matriz asignada
- alertas ignoran documentos no asignados
- builds backend y frontend pasan

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Sprint 10 iniciado | `completada` | Se inicia la aplicacion real de permisos documentales al expediente RH. |
| 2026-04-21 | Permisos aplicados al expediente y alertas | `completada` | Expediente, documentos, cargas, historial, vista protegida y alertas ya respetan la matriz asignada. |
