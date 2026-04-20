# Sprint 8 - Auditoria e Historial

Estado general del sprint: `completada`

Objetivo:
Cerrar la V2 con trazabilidad institucional, historial de movimientos y base de auditoria para RH y multi-modulo.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla de auditoria especifica RH o extender la existente | `completada` | Se agrego migracion para extender `access_logs` con contexto de modulo, entidad, expediente y metadata. |
| DB-02 | Disenar soporte para historial de versiones documentales | `completada` | Se aprovecho el versionado existente de `employee_documents` y se expuso su historial por tipo documental. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Registrar auditoria de visualizacion documental | `completada` | RH ya registra visualizacion segura de documentos por expediente. |
| BE-02 | Registrar auditoria de carga, edicion y eliminacion | `completada` | RH y QUALITY ya consumen un registrador comun con contexto de modulo. |
| BE-03 | Exponer historial de documento | `completada` | Disponible por colaborador y tipo documental RH. |
| BE-04 | Exponer consulta de auditoria por modulo y expediente | `completada` | Endpoint central de auditoria filtra por modulo y colaborador. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear vista de auditoria RH | `completada` | Nueva pantalla RH filtrable por colaborador. |
| FE-02 | Crear vista de historial por documento | `completada` | Modal de historial documental RH por tipo/versiones. |
| FE-03 | Mostrar ultimos movimientos del expediente | `completada` | El expediente RH muestra movimientos recientes auditados. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar logs de acceso documental | `completada` | Se registra `RH_DOCUMENT_VIEW` y `VIEW` en consulta multi-modulo. |
| QA-02 | Validar logs de carga y edicion | `completada` | Se registran altas RH y acciones documentales usando el mismo esquema de auditoria. |
| QA-03 | Validar consulta de auditoria por modulo | `completada` | `QUALITY` y `RH` son consultables y distinguibles desde auditoria. |

## Definicion de terminado del sprint

- existe auditoria por modulo
- existe trazabilidad de acciones RH
- existe historial documental o base de versionado
- la V2 queda institucionalmente cerrada

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 8 creado | `completada` | Base para futura ejecucion. |
| 2026-04-20 | Auditoria multi-modulo y trazabilidad RH implementadas | `completada` | Se agregaron servicio comun de auditoria, consulta RH, historial documental y movimientos recientes del expediente. |
| 2026-04-20 | Validacion tecnica del sprint | `completada` | `npm run build` paso en backend y frontend. |
