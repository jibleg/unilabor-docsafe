# Sprint 4 - Expediente del Colaborador

Estado general del sprint: `pendiente`

Objetivo:
Construir el expediente documental por colaborador, conectando secciones, tipos documentales y documentos cargados.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla `employee_documents` | `pendiente` | Nucleo documental del expediente. |
| DB-02 | Definir metadatos documentales | `pendiente` | Archivo, fechas, estado, version, cargado por. |
| DB-03 | Crear scripts SQL o migraciones | `pendiente` | Compatible con visor seguro actual. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear endpoint de expediente por colaborador | `pendiente` | Debe devolver estructura agregada. |
| BE-02 | Crear endpoints de carga documental RH | `pendiente` | Para RH y editor. |
| BE-03 | Crear endpoints de consulta documental RH | `pendiente` | Por empleado, seccion y tipo. |
| BE-04 | Integrar visor PDF protegido con documentos RH | `pendiente` | Manteniendo la proteccion actual. |
| BE-05 | Calcular resumen del expediente | `pendiente` | Cargados, faltantes y avance. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `EmployeeExpedientPage` | `pendiente` | Vista principal del expediente. |
| FE-02 | Crear componentes de seccion documental | `pendiente` | Tarjetas por seccion y tipo documental. |
| FE-03 | Crear modal o flujo de carga documental RH | `pendiente` | Enfocado en colaborador especifico. |
| FE-04 | Mostrar resumen del expediente | `pendiente` | Progreso, faltantes, vigencias basicas. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar carga de documento por colaborador | `pendiente` | Debe quedar ligado correctamente. |
| QA-02 | Validar consulta del expediente | `pendiente` | Debe devolver secciones y tipos. |
| QA-03 | Validar visualizacion segura del documento | `pendiente` | Sin alterar proteccion del visor. |

## Definicion de terminado del sprint

- existe expediente por colaborador
- se pueden cargar documentos RH
- el expediente muestra estructura y estado
- el visor seguro opera tambien para RH

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 4 creado | `completada` | Base para futura ejecucion. |
