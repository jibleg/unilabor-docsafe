# Sprint 40 - Evaluacion Practica (Captura Directa de Calificacion por RH)

Estado general del sprint: `en curso` (codigo completo, builds/lint/tests verdes; pendiente aplicar migracion en BD, validacion en navegador y commit)

Objetivo:
Cubrir las capacitaciones cuya evaluacion es 100% practica / presencial (entrenamiento en sitio), donde no hay cuestionario que el colaborador conteste: RH captura directamente la calificacion obtenida por cada colaborador y, si es >= 8 (en escala 0-10), el sistema genera y archiva en automatico su constancia anual, reusando el mismo motor de emision que ya existe. Se agrega un nuevo "tipo" de evaluacion (`practical`) sin romper el flujo de quiz existente (`quiz`).

Dependencia:
Requiere el modulo de Evaluaciones completo (Sprints 31-39). Reusa: emision e idempotencia de constancia (`certificate-issuance.service.ts`), tabla `evaluation_assignments` (estados, `score`/`max_score`/`percentage`, `certificate_document_id`), expediente `employee_documents`, dashboard de trazabilidad y editor de plantilla.

## Decisiones de diseno confirmadas (2026-07-02)

- **Captura en un solo paso**: RH abre un "acta de capacitacion practica" (elige curso/plantilla practica + fecha), marca a los colaboradores del grupo y captura la nota de cada uno. Al guardar se crea el `evaluation_assignment` ya calificado (estado terminal) y, si acredita, se emite la constancia al instante. No hay paso intermedio de asignar-luego-calificar.
- **Escala 0-10, umbral 8**: RH captura la nota en 0-10. Se almacena `percentage = nota * 10` (NUMERIC), y `score = percentage`, `max_score = 100` (enteros, para mantener identica la semantica del motor de quiz: `percentage = score/max_score*100`). El motor de aprobado sigue igual: `percentage >= passing_score` (80 = nota 8). Se admite un decimal en la nota (8.5 -> percentage 85, sin perdida porque nota*10 es entero).
- **Captura masiva e individual**: la misma pantalla permite capturar a varios colaboradores a la vez (tipo lista de asistencia) o a uno solo.
- **El colaborador NO interviene**: una evaluacion practica no se "realiza" ni aparece como pendiente en "Mis evaluaciones"; el colaborador solo ve la constancia resultante en su expediente (como hoy).
- **Reprobado practico NO notifica a RH**: a diferencia del quiz, aqui RH es quien captura la nota, asi que el correo de "no acreditado a RH" seria redundante; solo queda el registro `failed` en el assignment. La constancia solo se emite si acredita (>= 8).
- **Aditivo y no destructivo**: nueva columna `evaluation_type` con default `'quiz'`; cero impacto en plantillas, evaluaciones y constancias existentes.
- **Recaptura = correccion que REEMPLAZA** (confirmado 2026-07-02): si RH vuelve a capturar a un colaborador ya calificado en la misma practica (escenario "capturo por partes en varios momentos"), la nueva nota reemplaza la anterior EN EL LUGAR (misma fila de `evaluation_assignments`, sin duplicar ni inflar la trazabilidad). Si sigue acreditado, la emision supersede la constancia previa por `reference_key` y emite la vigente; si la correccion lo deja no acreditado, se revoca (supersede) la constancia previa. La pantalla de captura muestra un badge "Ya: N/10" por colaborador ya calificado.

## Bloque 1 - Backend (modelo de datos y plantilla)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-93 | Migracion `evaluation_type` | `completada` | `sql/20260702_01_eval_practical_type.sql`: `ALTER TABLE evaluation_templates ADD COLUMN IF NOT EXISTS evaluation_type ... CHECK (evaluation_type IN ('quiz','practical'))` + constraint. Idempotente. **Pendiente aplicar en BD local** (contenedor `postgres12` estaba apagado) y en el proximo deploy (`npm run migrate`). |
| EVAL-94 | Schema y servicio de plantilla | `completada` | `schemas/training.schema.ts`: `evaluation_type` en create/update. `evaluation-template.service.ts`: persistir/mapear el campo; una plantilla `practical` no exige banco de preguntas y guarda `selection_mode=null`, `random_count=null`, `requires_manual_grading=false`. Validar que `practical` no acepte `random_count`. |

## Bloque 2 - Backend (captura directa y emision)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-95 | Servicio de captura practica | `completada` | Nuevo `services/evaluation-practical.service.ts` -> `capturePracticalResults(templateId, capturedAt, results[])`. Por cada `{employee_id, score}`: valida plantilla `practical`+activa y nota en [0,10]; calcula `percentage=score*10` y `passed=percentage>=passing_score`; inserta el `evaluation_assignment` en estado terminal (`passed`/`failed`), con `available_at`/`submitted_at`/`graded_at=capturedAt`, `score`, `max_score=10`, `percentage`, `created_by_user_id`. SIN snapshot de preguntas. Transaccional por resultado. |
| EVAL-96 | Enganche de constancia | `completada` | Tras COMMIT de cada resultado acreditado, reusar `tryIssueCertificate(assignmentId, passed)` (best-effort, mismo hook post-commit que submit/grade). Idempotencia y versionado por curso ya cubiertos por `certificate-issuance.service.ts`. Devolver resumen `{ acreditados, no_acreditados, constancias_emitidas }`. |
| EVAL-97 | Endpoint de captura | `completada` | `POST /api/rh/trainings/practical/capture` (RH ADMIN/EDITOR). Schema Zod `capturePracticalSchema` (`template_id`, `captured_at?`, `results: [{ employee_id, score }]`, `results` no vacio, nota 0-10 con 1 decimal). Controller + wiring en `training.routes.ts`. |

## Bloque 3 - Backend (guardas de integridad entre tipos)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-98 | Guardas quiz vs practica | `completada` | `evaluation-attempt.service.ts`: `startEvaluation`/`submitEvaluation` responden 400 si la plantilla es `practical` (el colaborador no la contesta). `evaluation-assignment.service.ts`: `assignEvaluation` (flujo quiz) responde 400 si la plantilla es `practical`. `/me/evaluations` excluye asignaciones de plantillas `practical` de la lista de "Realizar". |

## Bloque 4 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-99 | Tipo en editor de plantilla | `completada` | `EvaluationTemplateEditorModal.tsx`: switch **Quiz / Practica**. En modo practica se oculta el editor de banco de preguntas y solo se pide titulo (umbral fijo nota 8); en modo quiz, sin cambios. Reflejar el tipo en el listado de plantillas. |
| EVAL-100 | Pantalla de captura practica | `completada` | Nueva `pages/RhPracticalCapturePage.tsx`: selector de curso/plantilla practica -> fecha de la capacitacion -> lista de colaboradores con checkbox + input de nota (0-10) por colaborador (masivo e individual) -> boton "Guardar y emitir constancias" -> resumen (acreditados / no acreditados / constancias emitidas). API en `service.api-training.ts` (`capturePracticalResults`). Nuevo item en sidebar RH. |
| EVAL-101 | Reflejo en trazabilidad y expediente | `completada` | Verificar (sin cambios de backend) que el dashboard de trazabilidad (`RhTrainingDashboardPage`) y la seccion Constancias del expediente muestran las evaluaciones practicas y sus constancias, distinguiendo el tipo cuando aplique. |

## Bloque 5 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-102 | Pruebas backend | `completada` | Captura acreditado (>=8) -> assignment `passed` + constancia emitida (idempotente); no acreditado (<8) -> `failed` sin constancia; validacion de rango de nota; guardas (start/submit/assign rechazan `practical`; quiz intacto). |
| EVAL-103 | Build, lint y commit/push | `en curso` | Backend `npm run build` OK + **105 tests verdes**; frontend `npm run build` OK, `npm run lint` 0, **26 tests verdes**. **Commit + push a `main` PENDIENTE** (a confirmar con el usuario tras validacion en navegador). Migracion versionada lista para el proximo deploy. |

## Definicion de terminado

- RH puede marcar una plantilla como practica (sin banco de preguntas)
- RH captura calificaciones 0-10 de uno o varios colaboradores en una sola operacion
- una nota >= 8 genera y archiva la constancia anual en el expediente, visible de inmediato; < 8 queda como no acreditado sin constancia
- una evaluacion practica no aparece como pendiente al colaborador ni puede iniciarse/enviarse como quiz
- el flujo de quiz existente (Sprints 31-39) queda intacto
- builds, tests y lint verdes; migracion versionada

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-07-02 | Archivo del Sprint 40 creado | `completada` | Evaluacion practica: captura directa de calificacion por RH (un solo paso, escala 0-10 umbral 8, masiva) que reusa el motor de emision de constancia. Decisiones de diseno confirmadas con el usuario. |
| 2026-07-02 | Recaptura = correccion (reemplazo) | `completada` | Migracion `20260702_01` aplicada en BD local (columna+constraint verificados, 5 plantillas quedaron 'quiz'). Ante duda del usuario sobre capturar 2+ veces al mismo colaborador: `capturePracticalResults` ahora hace find-or-update (busca asignacion existente por template+employee con FOR UPDATE; si existe, UPDATE en el lugar limpiando certificate_document_id + revoca constancia si baja de acreditado; si no, INSERT). Resumen agrega `reemplazados`. Front `RhPracticalCapturePage` carga capturas previas (listTemplateAssignments) y muestra badge "Ya: N/10" por colaborador; recarga tras guardar. Backend build+105 tests / frontend build+lint+26 tests verdes. |
| 2026-07-02 | Bloques 1-5 codificados | `en curso` | Backend: migracion `20260702_01`, `evaluation_type` en types/schema/servicio de plantilla, nuevo `evaluation-practical.service.ts` (helper puro `resolvePracticalOutcome` + `capturePracticalResults`), endpoint `POST /rh/trainings/practical/capture` + controller + mapeo de errores, guardas en start/submit/assign + filtro `/me`. Tests: 14 nuevos (schema `capturePracticalSchema`/`evaluation_type` + helper), 105 verdes. Frontend: `evaluation_type` en modelos/API, `capturePracticalResults`, switch de tipo en `EvaluationTemplateEditorModal`, `RhTrainingsPage` (crear practica, badge, boton capturar), nueva `RhPracticalCapturePage` + ruta `/rh/practical-capture` + item sidebar (ClipboardPen). Build+lint+26 tests verdes. PENDIENTE: aplicar migracion en BD, validacion en navegador, commit/push. |
