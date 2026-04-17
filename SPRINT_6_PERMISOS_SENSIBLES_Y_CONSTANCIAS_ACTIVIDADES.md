# Sprint 6 - Permisos Sensibles y Constancias

Estado general del sprint: `pendiente`

Objetivo:
Cerrar las reglas de acceso a documentos sensibles y el manejo de vigencia para la seccion `Constancias`.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Implementar politica de documentos sensibles | `pendiente` | RH y editor/admin de todos; colaborador solo propios. |
| BE-02 | Implementar validaciones de `has_expiry` para constancias | `pendiente` | Fecha de emision y vencimiento. |
| BE-03 | Calcular estado documental de constancias | `pendiente` | Vigente, por vencer, vencido. |
| BE-04 | Exponer filtros por estado de vigencia | `pendiente` | Soporte para alertas futuras. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Mostrar badges de sensibilidad | `pendiente` | Solo cuando aporte valor al rol que lo ve. |
| FE-02 | Mostrar badges de vigencia en constancias | `pendiente` | Vigente, por vencer, vencido. |
| FE-03 | Ajustar formularios de carga para constancias | `pendiente` | Deben soportar fechas de vigencia. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar acceso de RH a documentos sensibles de todos | `pendiente` | Caso positivo. |
| QA-02 | Validar acceso del colaborador solo a sensibles propios | `pendiente` | Caso positivo. |
| QA-03 | Validar bloqueo a terceros de documentos sensibles | `pendiente` | Caso critico. |
| QA-04 | Validar calculo correcto de vigencia en constancias | `pendiente` | Debe responder a fechas reales. |

## Definicion de terminado del sprint

- documentos sensibles protegidos correctamente
- constancias manejan vigencia
- frontend muestra estados de vencimiento

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 6 creado | `completada` | Base para futura ejecucion. |
