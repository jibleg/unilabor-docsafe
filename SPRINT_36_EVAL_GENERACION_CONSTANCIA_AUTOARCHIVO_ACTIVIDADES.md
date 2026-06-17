# Sprint 36 - Generacion Real de Constancia y Auto-archivo en Expediente

Estado general del sprint: `pendiente`

Objetivo:
Al resolverse una evaluacion como aprobada (>= 80%), generar en automatico la constancia con datos reales del colaborador y la evaluacion, archivarla sola en su seccion de Constancias del expediente RH (tabla `employee_documents`, tipo `COURSE_CERTIFICATE`) con vigencia anual, y dejarla visualizable de inmediato al concluir.

Dependencia:
Requiere Sprint 33 (resultado passed) y Sprint 35 (motor de render y plantilla de constancia).

## Bloque 1 - Backend (generacion + archivo)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-58 | Hook al resolver passed | `pendiente` | Al pasar una asignacion a 'passed' (auto en Sprint 33 o manual en Sprint 34), disparar generacion de constancia. Idempotente: no duplicar si ya existe. |
| EVAL-59 | Render con datos reales | `pendiente` | Reusar `certificate-render.service.ts`: nombre real, capacitacion, fecha de emision, calificacion, vigencia. Guardar el PDF en `uploads/documents` (patron de nombre SAFEDOC-*). |
| EVAL-60 | Alta en `employee_documents` | `pendiente` | Insertar como `COURSE_CERTIFICATE` del colaborador: `issue_date` = hoy, `expiry_date` = +12 meses, `is_current`, version, `uploaded_by_user_id` = sistema. Reusa el versionado existente. |
| EVAL-61 | Endpoint de acceso a la constancia | `pendiente` | El colaborador ve/descarga su constancia (reusar `/documents/:documentId/view` y control de acceso por seccion ya existente). |

## Bloque 2 - Frontend (visualizacion inmediata)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-62 | Boton "Ver constancia" en resultados | `pendiente` | En la pantalla de resultados (Sprint 33), al passed mostrar la constancia recien generada en el visor PDF. |
| EVAL-63 | Constancia en seccion de Constancias | `pendiente` | Verificar que aparece de inmediato en la seccion Constancias del expediente del colaborador, con su vigencia. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-64 | Pruebas | `pendiente` | Backend: generacion idempotente al passed, alta correcta en employee_documents con issue/expiry, no genera en failed. |
| EVAL-65 | Build, lint y commit/push | `pendiente` | Verdes. |

## Definicion de terminado

- al >= 80% se genera la constancia con datos reales y vigencia anual
- se archiva sola en la seccion de Constancias del expediente del colaborador
- el colaborador la visualiza de inmediato al concluir
- no se genera en evaluaciones no aprobadas; generacion idempotente
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 36 creado | `pendiente` | Generacion real de constancia + auto-archivo en expediente + visualizacion inmediata. |
