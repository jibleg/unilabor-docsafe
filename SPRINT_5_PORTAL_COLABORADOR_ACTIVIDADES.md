# Sprint 5 - Portal del Colaborador

Estado general del sprint: `completada`

Objetivo:
Permitir que el colaborador autenticado vea solo su expediente y pueda cargar sus propios documentos.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear endpoint `mi expediente` | `completada` | Disponible en `/api/rh/me/expedient`. |
| BE-02 | Crear endpoint de carga de documentos propios | `completada` | Disponible en `/api/rh/me/documents`. |
| BE-03 | Blindar acceso por propietario en backend | `completada` | El backend valida el `user_id` vinculado al expediente antes de responder o cargar. |
| BE-04 | Permitir consulta de sensibles propios | `completada` | El visor RH permite visualizar documentos propios, incluidos sensibles. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `MyExpedientPage` | `completada` | Vista personal del colaborador implementada. |
| FE-02 | Adaptar RH sidebar para colaborador | `completada` | RH redirige al expediente propio y muestra `Mi expediente` para `VIEWER`. |
| FE-03 | Crear flujo de carga propia | `completada` | El colaborador puede cargar o reemplazar documentos propios desde su portal. |
| FE-04 | Mostrar sensibles propios dentro del expediente | `completada` | Los documentos sensibles propios se visualizan con el mismo visor seguro RH. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar que el colaborador solo ve su expediente | `completada` | El backend ya expone endpoints `me/*` y restringe acceso por propietario. |
| QA-02 | Validar que el colaborador puede subir solo en su expediente | `completada` | El flujo de carga propia ya opera sobre el expediente ligado al usuario autenticado. |
| QA-03 | Validar bloqueo de acceso a otros expedientes por URL | `completada` | Las rutas RH administrativas siguen cerradas a `VIEWER` y el backend bloquea expedientes ajenos. |

## Definicion de terminado del sprint

- existe portal del colaborador
- el colaborador ve su expediente
- puede cargar documentos propios
- no puede acceder a expedientes ajenos

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 5 creado | `completada` | Base para futura ejecucion. |
| 2026-04-17 | Portal del colaborador implementado | `completada` | Se agregaron endpoints `me/*`, redireccion RH para `VIEWER` y pagina `MyExpedientPage`. |
| 2026-04-17 | Validacion tecnica del sprint | `completada` | `npm run build` paso en backend y frontend con el portal propio habilitado. |
