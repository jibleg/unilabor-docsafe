# Sprint 31 - Base: Capacitaciones, Plantillas y Banco de Preguntas

Estado general del sprint: `completada`

Objetivo:
Crear el modelo de datos y la administracion (backend + UI RH) para definir capacitaciones, sus plantillas de evaluacion y el banco de preguntas con respuestas correctas. Incluye agregar el campo telefono al colaborador, capturado en su alta, para habilitar el SMS de sprints posteriores. Al cierre, RH puede armar evaluaciones completas; aun no se asignan ni se contestan.

Dependencia:
Base del modulo. No depende de otros sprints del roadmap.

## Bloque 1 - Modelo de datos (migraciones SQL)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-01 | Tabla `training_courses` | `completada` | Capacitacion: `code` unico, `title`, `description`, `certificate_validity_months` (default 12), `is_active`, `created_by_user_id`, timestamps. |
| EVAL-02 | Tabla `evaluation_templates` | `completada` | Plantilla ligada a capacitacion: `passing_score` (default 80), `window_hours` (default 72), `selection_mode` ('all'|'random'), `random_count` (nullable), `status` ('draft'|'published'), `is_active`, timestamps. |
| EVAL-03 | Tabla `evaluation_questions` (banco) | `completada` | `template_id`, `type` ('single'|'multiple'|'boolean'|'open'), `text`, `points` (default 1), `sort_order`. |
| EVAL-04 | Tabla `evaluation_question_options` | `completada` | `question_id`, `text`, `is_correct`, `sort_order`. Solo para tipos auto-calificables. |
| EVAL-05 | Columna `phone` en `employees` | `completada` | Migracion aditiva nullable; formato E.164 validado en capa Zod. |

## Bloque 2 - Backend (CRUD + Zod)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-06 | Service + controller de capacitaciones | `completada` | CRUD `training_courses`; listado paginado (reusar helper `pagination.ts`). |
| EVAL-07 | Service + controller de plantillas y banco | `completada` | CRUD de plantilla, preguntas y opciones (anidado/transaccional). Deriva `requires_manual_grading` si hay preguntas 'open'. Validacion: si `selection_mode='random'`, `random_count` <= total de preguntas. |
| EVAL-08 | Esquemas Zod | `completada` | `training.schema.ts` y `evaluation-template.schema.ts`; validar tipos de pregunta, opciones con al menos una correcta en single/boolean, telefono E.164 en `employee.schema.ts`. |
| EVAL-09 | Rutas bajo `/api/rh` con roles | `completada` | `verifyToken` + `authorizeModuleAccess('RH')` + `authorizeModuleRole('RH',['ADMIN','EDITOR'])`. Registrar en `index.ts`. |

## Bloque 3 - Frontend (UI de diseno)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-10 | Capa API (`service.api-*`) y tipos | `completada` | Funciones CRUD de capacitaciones/plantillas/preguntas; tipos en `types/models.ts`. |
| EVAL-11 | Pagina de capacitaciones | `completada` | Listado paginado + alta/edicion de capacitacion (vigencia constancia, activo). |
| EVAL-12 | Editor de plantilla y banco de preguntas | `completada` | Configurar passing (80), ventana (72h), modo all/random + cantidad; alta de preguntas con tipos y opciones correctas. Componentes < 1000 LOC. |
| EVAL-13 | Captura de telefono en alta de colaborador | `completada` | Agregar campo telefono en el formulario de RhEmployeesPage / modal de alta. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-14 | Pruebas | `completada` | Backend: validacion de plantilla/banco (random_count, opcion correcta). Frontend: contrato de API de capacitaciones. |
| EVAL-15 | Build, lint y commit/push | `completada` | tsc backend + build frontend + tests + lint verdes. Migraciones aplicadas con `npm run migrate`. |

## Definicion de terminado

- modelo de datos de capacitaciones, plantillas, banco y opciones creado y migrado
- RH puede crear una capacitacion con su plantilla y banco de preguntas (auto-calificables y abiertas)
- el colaborador se registra con telefono
- builds, tests y lint verdes; migraciones aplicadas

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 31 creado | `pendiente` | Base del modulo de evaluaciones: modelo de datos + diseno de capacitacion/banco + telefono. |
| 2026-06-17 | Sprint 31 ejecutado completo | `completada` | 5 migraciones idempotentes en `sql/20260617_0X_*.sql` (training_courses, evaluation_templates, evaluation_questions, evaluation_question_options, employees.phone) aplicadas en BD dev. Backend: `training.schema.ts` (Zod con superRefine por tipo de pregunta), `training.service.ts` + `evaluation-template.service.ts` (banco por reemplazo transaccional, `requires_manual_grading` derivado, validacion random_count<=banco), `training.controller.ts`, `training.routes.ts` montadas en `/api/rh/trainings` (RH ADMIN/EDITOR). Telefono E.164 en employee schema/service/controller. Frontend: `service.api-training.ts`, pagina `RhTrainingsPage` + `EvaluationTemplateEditorModal` (config + banco con opciones/correctas, modo all/random), campo telefono en alta de colaborador, ruta `/rh/trainings` + item en sidebar. Backend tsc + 89 tests verdes (13 nuevos de schema). Frontend build + lint limpio + 26 tests. Smoke e2e de services contra BD dev OK (codigo auto, manual-grading derivado, cascada) y limpiado. Migraciones quedan versionadas en git para correr `npm run migrate` en produccion al desplegar. Sin commit aun (pendiente de autorizacion). |
