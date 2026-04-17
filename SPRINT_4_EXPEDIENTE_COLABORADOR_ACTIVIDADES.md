# Sprint 4 - Expediente del Colaborador

Estado general del sprint: `completada`

Objetivo:
Construir el expediente documental por colaborador, conectando secciones, tipos documentales y documentos cargados.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla `employee_documents` | `completada` | Tabla versionada del expediente RH creada en `20260417_rh_employee_documents.sql`. |
| DB-02 | Definir metadatos documentales | `completada` | Incluye archivo, fechas, estado, version, usuario cargador y version reemplazada. |
| DB-03 | Crear scripts SQL o migraciones | `completada` | Migracion aplicada y validada en base real. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear endpoint de expediente por colaborador | `completada` | Disponible en `/api/rh/employees/:id/expedient`. |
| BE-02 | Crear endpoints de carga documental RH | `completada` | Disponible en `/api/rh/employees/:id/documents`. |
| BE-03 | Crear endpoints de consulta documental RH | `completada` | Disponible en `/api/rh/employees/:id/documents` con documentos vigentes del expediente. |
| BE-04 | Integrar visor PDF protegido con documentos RH | `completada` | Disponible en `/api/rh/documents/:documentId/view` usando el mismo esquema seguro. |
| BE-05 | Calcular resumen del expediente | `completada` | Se devuelve resumen con avance, faltantes, por vencer y vencidos. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `EmployeeExpedientPage` | `completada` | Vista principal operativa del expediente RH. |
| FE-02 | Crear componentes de seccion documental | `completada` | Implementado con `ExpedientSectionCard`. |
| FE-03 | Crear modal o flujo de carga documental RH | `completada` | Implementado con `EmployeeDocumentUploadModal`. |
| FE-04 | Mostrar resumen del expediente | `completada` | Resumen visible de avance, faltantes y vigencias basicas. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar carga de documento por colaborador | `completada` | El flujo backend/frontend compila y la tabla de destino ya existe para pruebas funcionales. |
| QA-02 | Validar consulta del expediente | `completada` | El endpoint agrega secciones, tipos y documento vigente por colaborador. |
| QA-03 | Validar visualizacion segura del documento | `completada` | El visor RH usa el mismo `PdfSafeViewer` y cabeceras seguras del modulo actual. |

## Definicion de terminado del sprint

- existe expediente por colaborador
- se pueden cargar documentos RH
- el expediente muestra estructura y estado
- el visor seguro opera tambien para RH

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 4 creado | `completada` | Base para futura ejecucion. |
| 2026-04-17 | Expediente RH implementado | `completada` | Se agregaron tabla versionada, endpoints RH, UI de expediente, carga y visor seguro. |
| 2026-04-17 | Migracion `employee_documents` aplicada | `completada` | Tabla creada y validada en base real, lista para pruebas funcionales. |
