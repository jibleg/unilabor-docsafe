# Sprint 8 - Auditoria e Historial

Estado general del sprint: `pendiente`

Objetivo:
Cerrar la V2 con trazabilidad institucional, historial de movimientos y base de auditoria para RH y multi-modulo.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla de auditoria especifica RH o extender la existente | `pendiente` | Debe incluir contexto de modulo. |
| DB-02 | Disenar soporte para historial de versiones documentales | `pendiente` | Segun alcance final del sprint. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Registrar auditoria de visualizacion documental | `pendiente` | Especialmente para sensibles. |
| BE-02 | Registrar auditoria de carga, edicion y eliminacion | `pendiente` | Debe incluir usuario y colaborador afectado. |
| BE-03 | Exponer historial de documento | `pendiente` | Si aplica versionado. |
| BE-04 | Exponer consulta de auditoria por modulo y expediente | `pendiente` | Base para control institucional. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear vista de auditoria RH | `pendiente` | Filtrable y legible. |
| FE-02 | Crear vista de historial por documento | `pendiente` | Si el versionado ya existe. |
| FE-03 | Mostrar ultimos movimientos del expediente | `pendiente` | Valor operativo y de trazabilidad. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar logs de acceso documental | `pendiente` | Deben registrar acciones reales. |
| QA-02 | Validar logs de carga y edicion | `pendiente` | Deben coincidir con el flujo operativo. |
| QA-03 | Validar consulta de auditoria por modulo | `pendiente` | `QUALITY` y `RH` deben ser distinguibles. |

## Definicion de terminado del sprint

- existe auditoria por modulo
- existe trazabilidad de acciones RH
- existe historial documental o base de versionado
- la V2 queda institucionalmente cerrada

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 8 creado | `completada` | Base para futura ejecucion. |
