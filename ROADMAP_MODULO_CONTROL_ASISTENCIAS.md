# ROADMAP — Módulo Control de Asistencias (DocSafe)

Fecha: 2026-10-12 · Estado: **implementado en local (backend + frontend), en fase de pruebas funcionales; sin desplegar** · Origen: port adaptado del módulo Asistencias de SIAIT/bioresiduos.

---

## 0. Estado de implementación (2026-10-12)

| Fase | Estado | Evidencia |
|---|---|---|
| 1. Base (schema, permisos, módulo, empleados, parámetros, festivos) | Hecha (local) | `sql/20261012_01_attendance_schema.sql`, `sql/20261012_02_attendance_rbac.sql`; `docs/attendance-api/catalogs.md` |
| 2. Horarios | Hecha (local) | `schedule.md`; detector de conflictos con 30 pruebas |
| 3. Motor de cálculo + proceso nocturno | Hecha (local) | `src/services/attendance/engine/*` (motor puro) y `day-recalculation.service.ts`; `days-punches.md` |
| 4. HikVision (API del agente, ingesta, agente local, simulador) | Hecha (local); **falta prueba con reloj real** | `devices-agent.md`, carpeta `attendance-agent/` |
| 5. Incidencias y vacaciones | Hecha (local) | `incidents-vacations.md` |
| 6. Tableros y reportes | Hecha (local) | `boards-exports.md` |
| Frontend (11 pantallas) | Hecho (local); **falta QA visual en navegador** | `src/pages/attendance/*` |
| 7. Pruebas funcionales y cierre | En curso | suite e2e `unilabor-safedoc/scripts/e2e-attendance.mjs`; pruebas de pantallas en `src/pages/attendance/__tests__` |

**Pendiente antes de producción:** (a) QA visual con navegador real; (b) prueba con un HikVision real en una sucursal piloto (captura remota de huella/rostro sin probar en hardware); (c) cargar `hire_date` de los empleados; (d) manual de usuario; (e) deploy con autorización explícita (SQL primero: `20261012_01` y `20261012_02`, luego código; crear carpeta de uploads `uploads/attendance-punches` y `uploads/attendance-incidents`, y variables `ATTENDANCE_ENABLED`, `ATTENDANCE_CRON`, `ATTENDANCE_PUBLIC_URL`).

**Decisiones tomadas durante la construcción (difieren del borrador):**
- Valores en inglés en BD y API: `day_result` (`present|late|absent|partial_absence|early_departure|incident|rest_day|holiday|no_schedule`), parámetros y enums (`late_period: month|fortnight|week`, `vacations_no_balance: warn|block|allow`, `missing_segment_result`, `missing_exit_result`).
- Parámetros definidos en `engine/settings.ts` (22). Se agregó `missing_exit_result` (entrada sin salida: `absent` por defecto o `present` con marca de revisión) y `timezone`. No existen `request_days_back` ni `photo_retention_days` (no hay autoservicio ni purga de fotos).
- Las checadas con revisión `pending` **sí cuentan** en el cálculo hasta que RH las rechace; las `rejected` no cuentan.
- No se recalculan días de hoy ni futuros (saldrían como falta); el proceso nocturno (03:30) recalcula los últimos 3 días hasta ayer y abre periodos de vacaciones.
- Un solo criterio de conteo: la falta por retardos acumulados cuenta como falta en compromiso, ranking y tendencia.
- `attendance.punches`: se permite que `terminal_id`, `branch_id` y `registered_by_user_id` pasen a NULL (efecto de `ON DELETE SET NULL`) sin alterar el dato crudo; se eliminó el CHECK que exigía terminal.
- Autorizar una incidencia cuyo tipo exige comprobante sin comprobante vigente da 409; las filas importadas de esos tipos quedan `captured`.
- Respuestas JSON planas (`{ recurso }`, `{ data, pagination }`, `{ message }`), no `{ ok, data }`.
- Endpoint adicional `GET /attendance/punches/:id/photo` (autenticado) para fotos de checadas.

## 1. Objetivo

Controlar la asistencia de los empleados de cada sucursal con **relojes biométricos HikVision** (uno por sucursal). El sistema recibe las checadas, las compara contra el horario programado, calcula cada día (asistencia, retardo, falta…), gestiona incidencias y vacaciones, y entrega tableros y reportes. RH es **un solo equipo central** que ve todas las sucursales.

## 2. Decisiones cerradas

| # | Decisión |
|---|---|
| 1 | Captura **solo con HikVision**, un equipo por sucursal, equipos ya adquiridos. Un **agente local por sucursal**. Respaldo: checada manual con motivo. |
| 2 | RH es un área única para todas las sucursales. Los festivos son iguales para todas. |
| 3 | Los colaboradores son los **mismos `employees` de RH**; solo se indica la sucursal (`employees.branch_id` ya existe y apunta a `helpdesk_asset_units`). |
| 4 | Permisos aprobados (5): consultar, gestionar horarios, autorizar incidencias/checadas, configurar, gestionar relojes. |

## 3. Alcance

**Entra:** turnos y programación · checadas HikVision · checada manual · revisión de checadas · cálculo diario · incidencias y comprobantes · vacaciones · festivos · parámetros · tablero en vivo · tablero de compromiso · Excel y PDF · alertas de reloj caído · bitácora.

**No entra:** app móvil (PIN, selfie, geocerca, offline) · exportes de nómina NOI/CONTPAQi · alcance por jefe de sucursal (RH ve todo) · tipos de checado campo/mixto y "en viaje" · multi-empresa por esquema.

## 4. Qué reutilizamos de DocSafe y qué es nuevo

| Reutiliza | Nuevo |
|---|---|
| `employees` (+ `branch_id`) | Módulo `ATTENDANCE` (código en `ModuleCode`, selector de módulos, `NAV_CONFIG`) |
| `helpdesk_asset_units` como catálogo de sucursales (`listBranches`) | Schema `attendance` con 17 tablas (sección 6) |
| RBAC `MODULO.RECURSO.ACCION` + `requirePermission` + `/admin/roles` | Permisos `ATTENDANCE.*` y roles de sistema |
| `audit.service` (access_logs) | Bitácora propia de horarios y de parámetros |
| Schedulers `node-cron` en `src/services` | Scheduler nocturno de asistencia |
| Zod + `validate.middleware`, `exceljs`, `pdf-lib`/`pdfkit`, `multer`, notificaciones | Agente local HikVision (carpeta nueva) |
| Migraciones SQL con `schema_migrations` | Migraciones `2026xxxx_attendance_*.sql` (la base ya existe: `20261012_01`) |

## 5. Arquitectura

```
Sucursal A                         Servidor DocSafe (Express + PG)
┌────────────┐  ISAPI/LAN  ┌─────────────┐   HTTPS (solo salida)   ┌──────────────────────┐
│ HikVision  │◄───────────►│ Agente local│────────────────────────►│ /api/attendance/agent │
└────────────┘             │ (cola SQLite)│◄────── órdenes ────────│  latido·órdenes·checadas
Sucursal B ... idem        └─────────────┘                         └─────────┬────────────┘
                                                                              ▼
                          attendance.punches (inmutables) ─► motor de cálculo ─► attendance.daily_results
                                                                    ▲ turnos · festivos · incidencias · parámetros
Frontend React: tablero · horarios · días · checadas · incidencias · vacaciones · relojes · configuración
```

- El agente solo hace conexiones de **salida**; no se abren puertos al internet.
- Las checadas son **inmutables** (solo INSERT). Toda corrección es una incidencia o una checada manual justificada.
- `attendance.daily_results` es **recalculable**: es una función pura de checadas, horario, festivos e incidencias.

## 6. Modelo de datos — schema `attendance`

**Implementado en** [`unilabor-safedoc/sql/20261012_01_attendance_schema.sql`](unilabor-safedoc/sql/20261012_01_attendance_schema.sql) (aplicado y verificado en la BD local de desarrollo; **no** en producción).

Todo el módulo vive en su **propio schema de PostgreSQL `attendance`**, separado de `public`. Referencia sin duplicar a `public.employees` (colaboradores), `public.helpdesk_asset_units` (sucursales) y `public.users` (quien captura/autoriza).

**Convenciones de nombres:** tablas en plural y sin prefijo (el schema ya lo aporta: `attendance.punches`); booleanos `is_*`/`has_*`; fechas `*_date`, instantes `*_at`, duraciones `*_minutes`/`*_hours`; FKs a usuarios `*_by_user_id`; estados con valores legibles en inglés (`day_result = 'late'`). Índices `ix_attendance_*` / `ux_attendance_*`.

### 6.1 Único cambio fuera del schema
`public.employees.hire_date DATE` (aditivo): la fecha de ingreso es dato de RH y base de las vacaciones. La **sucursal** sigue siendo `employees.branch_id` (ya existe). Todo lo demás del colaborador, específico de asistencia, va en `attendance.employee_profiles` (no se ensancha `employees`).

### 6.2 Tablas (17)

| Grupo | Tabla | Propósito y columnas clave |
|---|---|---|
| Configuración | `settings` | `setting_key` PK, `setting_value` JSONB, `updated_by_user_id`. Solo guarda lo que difiere del default del código. |
| | `setting_changes` | historial: `previous_value`, `new_value`, `change_reason` (≥5 caracteres, obligatorio), `changed_by_user_id`, `changed_at`. |
| | `holidays` | `holiday_date` UNIQUE, `name`, `is_active`. Globales para todas las sucursales. |
| Colaboradores | `employee_profiles` | `employee_id` PK→`employees`, `is_enabled`, `device_employee_number` (único, sin distinguir mayúsculas; solo `[A-Za-z0-9-]{1,20}`), `device_sync_status` (`not_applicable|pending|synced|error`), `device_sync_error`, `device_synced_at`. |
| Horarios | `shifts` | `name` (único ci), `start_time`, `end_time`, `crosses_midnight` (**columna generada**), `break_minutes` 0‑480, `shift_type` (`fixed|flexible`), `color_hex`, `is_active`. |
| | `shift_assignments` | `employee_id`, `shift_id` (**NULL = descanso**), `is_rest_day` (generada), `start_date`, `end_date` (NULL = sin fin), `repeats_weekly`, `week_interval` 1‑8, `weekdays` SMALLINT[] (ISO 1‑7, validado), `notes`, `created_by_user_id`. |
| | `schedule_changes` | bitácora: `change_action` (`schedule|edit|remove|end|copy`), `shift_name`, `description`, fechas, `repeats_weekly`, `weekdays`, `changed_by_user_id`, `changed_at`. |
| Relojes | `agents` | **uno por sucursal** (`branch_id` UNIQUE): `name`, `api_key_hash` (SHA‑256), `api_key_prefix`, `software_version`, `host_name`, `operating_system`, `local_ip`, `last_heartbeat_at`, `is_active`. |
| | `terminals` | `agent_id`, `branch_id`, `serial_number` UNIQUE, `name`, `model`, `firmware_version`, `local_ip`, `is_online`, `clock_drift_seconds`, `enrolled_people_count`, `last_event_at`, `last_heartbeat_at`. Se auto‑registran con el primer latido. |
| | `agent_orders` | cola del agente: `order_type` (`sync_person|remove_person|enroll_fingerprint|enroll_face|fetch_events|check_status`), `payload`, `order_status` (`pending|processing|done|error`), `result`, `error_message`, `attempt_count`, `created_at`, `picked_up_at`, `finished_at`. |
| Checadas | `punches` | **evidencia inmutable**: `employee_id` (NULL si el número del reloj es desconocido), `device_employee_number`, `source` (`terminal|manual`), `terminal_id`, `branch_id`, `punch_type` (`in|out|break_start|break_end|NULL`), `punched_at` (instante efectivo), `device_reported_at`, `received_at`, `verification_method` (`face|fingerprint|card|pin|manual|other`), `device_event_serial`, `photo_path`, `review_status` (`none|pending|approved|rejected`), `review_reason`, `reviewed_by_user_id`, `reviewed_at`, `manual_justification`, `registered_by_user_id`. |
| Incidencias | `incident_types` | `code` UNIQUE, `name`, `requires_attachment`, `is_paid`, `deducts_vacation`, `counts_as_attendance`, `is_hourly`, `is_system`, `sort_order`, `is_active`. **Sembrados 8**: `vacation`, `medical_leave`, `paid_permission`, `unpaid_permission`, `business_trip`, `justified_absence`, `holiday_worked`, `overtime`. |
| | `incidents` | `employee_id`, `incident_type_id`, `start_date`, `end_date`, `hours`, `days`, `reason`, `imss_folio`, `incident_status` (`captured|authorized|rejected|cancelled`), `captured_by_user_id`, `authorized_by_user_id`, `authorized_at`, `authorization_notes`, `notified_at`. |
| | `incident_attachments` | **evidencia en disco** (no base64 en BD): `file_path`, `original_file_name`, `mime_type`, `size_bytes`, `uploaded_by_user_id`, `deleted_at`/`deleted_by_user_id` (baja lógica). |
| Cálculo | `daily_results` | `UNIQUE(employee_id, work_date)`; `branch_id` (sucursal vigente ese día), `expected_start_time`, `expected_end_time`, `clock_in_at`, `clock_out_at`, `day_result`, `late_minutes`, `early_departure_minutes`, `worked_hours`, `overtime_hours`, `incident_id`, `is_late_accumulation_absence`, `has_pending_review`, `calculation_detail`, `segments`, `calculated_at`. |
| Vacaciones | `vacation_policy` | tabla por antigüedad: `from_seniority_year` PK, `vacation_days`. Sembrada con LFT 2023 (1→12 … 51→40). |
| | `vacation_periods` | `UNIQUE(employee_id, seniority_year)`; `period_start_date`, `period_due_date`, `days_entitled`, `days_adjustment`, `adjustment_reason`, `days_taken`. |

**Valores de `day_result`** (en inglés, sin `en_viaje`): `present` (asistencia) · `late` (retardo) · `absent` (falta) · `partial_absence` (falta parcial) · `early_departure` (salida anticipada) · `incident` (incidencia) · `rest_day` (descanso) · `holiday` (festivo) · `no_schedule` (sin horario). Las secciones 7 y 11 los nombran en español por legibilidad; en BD y API se usan estos códigos.

### 6.3 Garantías en la base de datos
- **`punches` no se puede borrar** (trigger) y solo admite actualizar los campos de revisión; una checada con número desconocido puede vincularse **una vez** a un colaborador, nunca reasignarse.
- Idempotencia de ingesta: índice único `(terminal_id, device_event_serial)`.
- Checada manual exige justificación (≥5 caracteres) y usuario que la registró; checada de terminal exige terminal.
- Un agente por sucursal; un número de reloj no se repite; el motivo de un cambio de parámetro es obligatorio.
- `shifts.crosses_midnight` e `shift_assignments.is_rest_day` son columnas generadas (no pueden quedar inconsistentes).
- `updated_at` se mantiene por trigger en las tablas mutables.
- Los adjuntos de incidencias usan `ON DELETE RESTRICT`: una incidencia con evidencia no se puede borrar.

## 7. Reglas de negocio (motor de cálculo)

Motor **puro** (`attendance-calculator.ts`, sin acceso a BD) con pruebas unitarias. Se trabaja en minutos de hora local (zona configurable; default `America/Mexico_City`).

### 7.1 Programación
- Un día resuelve a una lista de **tramos** (turnos). Si existen asignaciones de **día suelto** (no repite y `start = end`), **solo valen esas**; si no, valen las recurrentes.
- Recurrente aplica si la fecha está en el rango, su día ISO está en `weekdays` y las semanas desde `start_date` son múltiplo de `interval_weeks` (semana inicia domingo o lunes según parámetro).
- Una asignación con `shift_id` NULL es **descanso** y anula los turnos del día.
- Varios tramos el mismo día = **jornada partida** (máx. `max_shifts_per_day`, default 3). Sin traslapes.
- Turno **flexible**: solo cuenta horas (sin retardo ni salida anticipada).
- **Detector de conflictos** al programar (horizonte 366 días): traslape, turno sobre descanso, descanso sobre turnos, turno repetido, límite de turnos. Incluye comparación con el día vecino para turnos nocturnos.
- Copiar horario: copia una semana a las siguientes N (1‑12) o a otros empleados, como días sueltos; omite días ocupados o con conflicto (opción reemplazar) y reporta qué omitió.

### 7.2 Ventana del día
`[work_date + hora_corte, +1 día)` con `hora_corte` default 04:00. Si el primer tramo cruza medianoche: ventana de 12:00 a 12:00 del día siguiente.

### 7.3 Emparejado de checadas
- Se ignoran las checadas `rejected`. Las `pending` **sí cuentan** pero marcan el día `review_pending` (decisión a confirmar, ver 14).
- Deduplicación por **ventana de rebote** (default 60 s): checadas del mismo empleado dentro de la ventana se toman como una.
- Entrada = primera `in` (o primera checada si no hay tipo). Salida = última `out` (o última checada si hay más de una); se descarta si no es posterior a la entrada.
- Con varios tramos, el límite entre tramos es el **punto medio** entre el fin de uno y el inicio del siguiente.

### 7.4 Cascada de decisión del día (el primero que aplica gana)
1. **Incidencia autorizada de día completo** → `incidencia`.
2. **Sin horario** (sin turnos en la ventana de programación) → `sin_horario`.
3. **Festivo** (tabla global) → `festivo` (se registran horas si trabajó). Sin tramos → `descanso`.
4. **Sin entrada** → `falta`.
5. Por tramo (`esperada = fecha + hora`):
   - `retardo` = minutos de entrada tarde; se registra completo solo si `> tolerance_min` (default 10).
   - `anticipado` = minutos de salida antes; se registra completo solo si `> early_exit_min` (default 15).
   - `horas` = salida − entrada − descanso.
6. Resultado final, en este orden: todos los tramos sin checadas → `falta`; retardo `> late_until_min` (30) → `falta`; entrada sin salida → `falta` (parametrizable, ver 14); horas `< min_workday_hours` (4) → `falta`; tramo sin checar → `falta_parcial` o `falta` (`missing_segment`); hay retardo → `retardo`; hay salida anticipada → `salida_anticipada`; si no, `asistencia`.
7. **Horas extra**: solo con incidencia autorizada de tipo horas; `min(autorizadas, max(0, trabajadas − esperadas))`.

Resultados posibles: `asistencia · retardo · falta · falta_parcial · salida_anticipada · incidencia · descanso · festivo · sin_horario`. (No existe `en_viaje`.)

### 7.5 Falta por retardos acumulados
Cada `late_per_absence` retardos (default 3) dentro del periodo (`mes|quincena|semana`) marca `late_accumulated_absence = true` en el retardo que completa el grupo. Se recalcula completo por periodo (idempotente). **Un solo criterio de conteo en todos los tableros**: cuenta como falta en compromiso, ranking y tendencia (corrige la inconsistencia de bioresiduos).

### 7.6 Vacaciones
- Tabla por antigüedad (LFT) editable; periodos por aniversario con vencimiento `vacation_validity_months` (18).
- Días tomados = suma de incidencias autorizadas que descuentan vacaciones, repartidas **del periodo más antiguo al más nuevo**; periodos vencidos aportan 0.
- Saldo = Σ(derecho + ajuste − tomados) de periodos no vencidos. Ajuste manual −60…60 con motivo obligatorio.
- Días laborables de una solicitud = días con turno según programación, sin festivos (semana sin programación → lunes a viernes).
- Política sin saldo (`vacations_no_balance`): `advertir | bloquear | permitir`.
- Requiere `employees.hire_date`; sin ella no se calcula saldo.

### 7.7 Índice de compromiso
- `esperados` = días con horario, sin incidencia. `asistencias = presentes + 0.5·faltas_parciales`.
- `pct_asistencia = asistencias/esperados`; `pct_puntualidad = puntuales/esperados` (puntual = `asistencia` o `salida_anticipada` sin falta por retardos); `pct_salidas = salidas_completas/presentes`.
- `compromiso = round((A·pA + P·pP + S·pS)/(pA+pP+pS))`; pesos 40/40/20 normalizados.
- Niveles: `≥ ejemplar` (95) ejemplar · `≥ (ejemplar+atención)/2` comprometido · `≥ atención` (70) regular · menor, requiere atención · sin datos.
- Ranking: compromiso desc → faltas asc → retardos asc → racha desc → nombre. Rachas puntuales que se rompen con retardo, falta, falta parcial o falta por retardos.

### 7.8 Parámetros (`attendance.*`, cambio con motivo obligatorio)
`tolerance_min 10` · `late_until_min 30` · `late_per_absence 3` · `late_period mes` · `early_exit_min 15` · `cutoff_time 04:00` · `punch_debounce_s 60` · `clock_drift_max_min 10` · `agent_offline_min 15` · `vacation_validity_months 18` · `missing_segment media_falta` · `min_workday_hours 4` · `week_start domingo` · `max_shifts_per_day 3` · `vacations_no_balance advertir` · `weight_attendance/punctuality/exits 40/40/20` · `commitment_exemplary 95` · `commitment_attention 70` · `request_days_back 7` · `photo_retention_days 365` *(solo si se guardan fotos de checada; con purga real)*.
> Se **omiten** `geofence_*`, `selfie_max_kb`, `dias_max_tramo_abierto` y `periodo_nomina`.

## 8. Permisos (módulo `ATTENDANCE`)

| Código | Descripción | Quién |
|---|---|---|
| `ATTENDANCE.RECORDS.READ` | Consultar tableros, días, checadas, incidencias, horarios; exportar Excel/PDF | Consultar |
| `ATTENDANCE.SCHEDULES.WRITE` | Altas de turnos y programación; asignar sucursal/número de reloj; copiar horarios | Gestionar horarios |
| `ATTENDANCE.INCIDENTS.AUTHORIZE` | Capturar/autorizar/rechazar/cancelar incidencias; justificar falta; checada manual; aprobar/rechazar checadas en revisión; ajustar vacaciones; recalcular; importar Excel | Autorizar |
| `ATTENDANCE.SETTINGS.MANAGE` | Parámetros, tipos de incidencia, festivos, tabla de vacaciones | Configurar |
| `ATTENDANCE.DEVICES.MANAGE` | Agentes, terminales, órdenes, sincronizar personal, enrolamiento | Gestionar relojes |

Roles de sistema (patrón existente): `ATTENDANCE_VIEWER` (RECORDS.READ), `ATTENDANCE_EDITOR` (+SCHEDULES.WRITE +INCIDENTS.AUTHORIZE), `ATTENDANCE_ADMIN` (todos). `ADMIN_SUPERUSER` recibe todos. Todo endpoint usa `requirePermission`; sin excepciones por "alcance" porque RH ve todo.

*(Pendiente de decisión: un sexto permiso `ATTENDANCE.SELF.VIEW` para que cada empleado vea su propia asistencia y solicite vacaciones/permisos — ver sección 14.)*

## 9. API (Express, validación Zod)

Prefijo `/api/attendance`. Todos con `verifyToken` + `requirePermission`, salvo `agent/*`.

- **Catálogos y configuración** (`SETTINGS.MANAGE`; lectura `RECORDS.READ`): `GET/PUT /settings`, `GET /settings/log`, CRUD `/holidays`, CRUD `/incident-types`, `GET/PUT/DELETE /vacation-table`, `POST /vacation-table/reset`.
- **Empleados**: `GET /employees` (filtros sucursal, activo, sin horario, pendientes de reloj), `PATCH /employees/:id` (`is_enabled`, `device_employee_number` en `attendance.employee_profiles`; `branch_id` y `hire_date` en `employees`; `SCHEDULES.WRITE`), `POST /employees/bulk-enable`.
- **Horarios** (`SCHEDULES.WRITE`; lectura `RECORDS.READ`): CRUD `/shifts`; `GET /schedule?week&branch`; `POST/PATCH/DELETE /assignments`; `POST /schedule/copy`; `GET /schedule/log`.
- **Cálculo**: `GET /days`; `POST /days/recalculate {from,to}` (`INCIDENTS.AUTHORIZE`); `POST /days/:employeeId/:date/justify`; `POST /punches/manual`.
- **Checadas**: `GET /punches` (filtros origen, revisión, sucursal); `POST /punches/:id/review {approve|reject, reason}`.
- **Incidencias**: `GET/POST /incidents`; `POST /incidents/:id/{authorize|reject|cancel}`; `GET /incidents/:id/files/:fileId` (descarga protegida); `POST /incidents/import/simulate` y `/import`; `GET /incidents/template`.
- **Vacaciones**: `GET /employees/:id/vacations`; `POST /vacations/adjust`; `POST /vacations/open-periods`.
- **Tableros**: `GET /board/live?date&branch`; `GET /board/commitment?period&anchor&from&to&branch&employee`.
- **Reportes**: `GET /export/{commitment|days|overtime}.xlsx`; `GET /report/commitment.pdf`.
- **Relojes** (`DEVICES.MANAGE`): CRUD `/agents` (clave en claro **una sola vez**), `/terminals`, `POST /agents/:id/sync {all}`, `POST /employees/:id/enroll {fingerprint|face}`, `GET /orders`.
- **Agente** (auth Bearer propia, ruta pública para JWT): `POST /agent/heartbeat`, `GET /agent/orders`, `POST /agent/orders/:id/result`, `POST /agent/punches` (lote ≤500, idempotente).

Contrato `{ok, data|error}` consistente con DocSafe; todas las escrituras relevantes llaman a `audit.service`.

## 10. Agente HikVision (`attendance-agent/`)

- Programa Node ≥22.5 sin dependencias npm pesadas; cola local con `node:sqlite`; corre como servicio en una PC de la sucursal (NSSM/pm2).
- Config por sucursal: `docsafeUrl`, `agentKey`, y la terminal (`ip`, `puerto`, `usuario`, `password`). Las credenciales del reloj **solo viven en ese archivo**.
- Autenticación: `Authorization: Bearer <64 hex>`; el servidor busca el SHA‑256 en `attendance.agents` (la sucursal se deduce del agente).
- **Latido** (60 s): versión, PC, IP y estado de la terminal (serie, modelo, firmware, en línea, desfase de hora, personas). Respuesta con órdenes pendientes y hora del servidor.
- **Órdenes** (15 s o al recibir aviso): `sync_person`, `remove_person`, `enroll_fingerprint`, `enroll_face`, `fetch_events`, `status`. Toma con `FOR UPDATE SKIP LOCKED`, reintento tras 10 min en proceso, máximo 5 intentos.
- **ISAPI** con Digest MD5 (fallback Basic), timeout 15 s: alta/modificación/baja de persona (`UserInfo`), captura de huella/rostro, descarga de eventos (`AcsEvent`). Llave = `device_employee_number`.
- **Entrada de eventos**: push HTTP del reloj al agente en LAN, recuperación periódica (cada 10 min, últimas 24 h) y orden `fetch_events`. Cola con `UNIQUE(serial_terminal, serial_evento)`; entrega en lotes de 200 cada 5 s; sin internet se acumula; purga a 30 días.
- **Ingesta servidor**: terminal debe pertenecer al agente; mapa `checkIn/overtimeIn→in`, `checkOut/overtimeOut→out`, `breakOut→break_start`, `breakIn→break_end`, otro→NULL. Número de empleado desconocido → checada con `employee_id` NULL y `review_status=pending`. Reloj desfasado más que `clock_drift_max_min` (y menos de 1 h) → revisión pendiente.
- **Simulador de terminal** para QA sin hardware (mismo enfoque que bioresiduos).
- Verificar con el modelo real HikVision la captura remota de huella/rostro (en bioresiduos estaba "por verificar"); el enrolamiento directo en el equipo es el camino seguro.

## 11. Frontend (React, módulo `ATTENDANCE`)

Registro del módulo: `ModuleCode`, selector de módulos, `NAV_CONFIG.ATTENDANCE`, rutas con `PermissionGate`. Filtros en la URL, tablas con paginación (patrón ya usado en RH), modales de confirmación (nunca `alert/confirm` nativos), íconos con nombres cortos.

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/attendance/dashboard` | **Hoy en vivo**: KPIs (esperados, presentes, tarde, sin checar, en revisión), anillo de avance, "Quién está" por estado, ausencias de la semana, estado de agentes/terminales, tendencia 14 días, ranking del mes; filtro por sucursal; refresco 60 s | READ |
| `/attendance/commitment` | **Compromiso por periodo**: selector de periodo (día…año + rango), 8 KPIs, nivel del equipo, reconocimientos, requieren atención, tendencia, ranking, detalle por persona (tira de días, comparativa vs equipo) | READ |
| `/attendance/schedule` | **Calendario semanal**: chips de turno de color, jornada partida, recurrencia, selección múltiple, "Programar", "Copiar horario", filtro por sucursal | READ / SCHEDULES.WRITE |
| `/attendance/schedule/log` | Bitácora de cambios de horario | READ |
| `/attendance/shifts` | Catálogo de turnos | SCHEDULES.WRITE |
| `/attendance/days` | **Días**: resultado por empleado/día, badges por resultado, justificar falta, checada manual, recalcular rango, Excel | READ / AUTHORIZE |
| `/attendance/punches` | **Checadas**: crudas, origen, método, revisión; aprobar/rechazar; "Desconocido" para números sin empleado | READ / AUTHORIZE |
| `/attendance/incidents` | Incidencias: crear, autorizar/rechazar/cancelar, adjuntos, importar desde Excel (simular → importar) | READ / AUTHORIZE |
| `/attendance/employees` | Empleados del control: sucursal, número de reloj, ingreso, estado de sincronización con el reloj, alta masiva | READ / SCHEDULES.WRITE |
| `/attendance/employees/:id` | Ficha de asistencia: datos de reloj, vacaciones (saldo, periodos, ajuste), acciones de enrolamiento | READ |
| `/attendance/devices` | Agentes y terminales por sucursal, clave del agente, sincronizar, órdenes recientes | DEVICES.MANAGE |
| `/attendance/settings` | Parámetros (modal con motivo), festivos, tipos de incidencia, tabla de vacaciones | SETTINGS.MANAGE |

Convenciones visuales: reutilizar los componentes del tablero/paneles de DocSafe; color + texto/ícono en todo estado; colores por resultado (verde asistencia, ámbar retardo, rojo falta, azul salida anticipada, morado incidencia, gris descanso/festivo/sin horario).

## 12. Procesos automáticos

- **Cron nocturno** (`node-cron`, `ATTENDANCE_CRON`, default 03:30; `ATTENDANCE_ENABLED=false` lo apaga): recalcula los últimos 3 días, abre periodos de vacaciones por aniversario y revisa agentes sin latido.
- **Recálculo bajo demanda** al autorizar/cancelar incidencias, justificar, checada manual o aprobar/rechazar una checada, y al cambiar la programación (solo días pasados, tope 60).
- **Alertas**: reloj o agente sin latido `> agent_offline_min` (tablero + notificación a quien tenga `DEVICES.MANAGE`); aviso al empleado cuando se autoriza su incidencia (correo/SMS según lo que ya usa DocSafe).

## 13. Fases de implementación

Cada fase termina con pruebas verdes, `tsc -b`/build del front y revisión del usuario. **Nada se despliega sin autorización explícita**; las migraciones se aplican **antes** que el código (lección del lockout RBAC).

| Fase | Contenido | Entregable / criterio de aceptación | Tamaño |
|---|---|---|---|
| **1. Base** | Schema `attendance` (**migración ya escrita y verificada en local**), `hire_date` en `employees`, parámetros, festivos, turnos, asignaciones, bitácora; permisos y roles `ATTENDANCE`; módulo en front (selector, `NAV_CONFIG`, layout); pantalla Empleados (sucursal, número de reloj, ingreso); Parámetros y Festivos | Un admin habilita empleados y fija sucursal/número; permisos visibles en `/quality/roles` | M |
| **2. Horarios** | Turnos; resolución de día; detector de conflictos; calendario semanal; programar/editar/quitar/terminar; copiar horario; bitácora | Programar jornada partida y recurrente sin conflictos; pruebas de `resolveDay` y conflictos | M |
| **3. Motor de cálculo** | Motor puro + `attendance.daily_results`; carga por rango (sin N×D); recalcular; cron nocturno; pantalla Días; checada manual y justificar falta | Tabla de escenarios (≥40 casos) verde; recálculo idempotente; Días muestra resultados correctos | L |
| **4. HikVision** | Tablas de agentes/terminales/órdenes/checadas; endpoints del agente; agente local + simulador; pantalla Relojes; Checadas con revisión (aprobar/rechazar); ingesta idempotente con rebote | Checadas de una terminal simulada llegan, se deduplican y alimentan el cálculo; luego prueba con un reloj real en **una** sucursal piloto | L |
| **5. Incidencias y vacaciones** | Tipos y flujo completo; adjuntos en disco con baja lógica; importación Excel; vacaciones (tabla, periodos, saldo, ajuste); política sin saldo | Autorizar incidencia recalcula días y descuenta vacaciones; saldo coincide con la tabla LFT | M |
| **6. Tableros y reportes** | Hoy en vivo; compromiso (ranking, detalle, reconocimientos); Excel (compromiso/días/horas extra); PDF; alertas de reloj caído | Cifras del tablero = cifras del Excel/PDF; filtro por sucursal en todo | M |
| **7. Cierre** | Manual de usuario (Word, patrón existente), roadmap/sprints en `.md`, despliegue por sucursal, capacitación RH | Piloto 1 sucursal → resto | S |

Orden recomendado de despliegue: fases 1‑3 juntas (sin hardware), luego fase 4 con una sucursal piloto, luego 5‑6.

## 14. Preguntas abiertas / supuestos a confirmar

1. **Autoservicio del empleado** (ver su asistencia, solicitar vacaciones/permisos): ¿entra en esta versión? Si sí, se añade `ATTENDANCE.SELF.VIEW` y una pestaña en "Mi perfil".
2. **Entrada sin salida**: bioresiduos lo trata como `falta`. ¿Lo mantenemos como default o preferimos `asistencia` con marca de revisión?
3. **Checadas en revisión**: ¿cuentan en el cálculo hasta que RH las rechace (como hoy en bioresiduos, que sí cuentan), o no cuentan hasta aprobarlas?
4. **Fecha de ingreso** (`hire_date`) de todos los empleados: RH debe capturarla (o cargarla por Excel) antes de usar vacaciones. ¿Existe ya en algún archivo?
5. **Zona horaria**: ¿todas las sucursales están en la misma zona (America/Mexico_City)?
6. **Fotos de checada**: el HikVision puede enviar foto del evento. ¿Se guarda (con política de retención) o solo se registra el evento?
7. **Foto de rostro del empleado** para cargar al reloj: ¿se sube desde DocSafe o se enrola directamente en el equipo? (propuesta: enrolar en el equipo; subir foto como extra opcional).
8. **Plataforma del agente**: ¿la PC de cada sucursal es Windows? Define cómo se instala el servicio.
9. **Modelo exacto del HikVision**: confirmar soporte ISAPI (`AccessControl/UserInfo`, `AcsEvent`, push HTTP) en el firmware instalado.
10. **Notificaciones**: ¿correo, SMS o WhatsApp para avisar al empleado y al responsable de relojes?
11. **Baja de empleado**: confirmar que `is_active=false` ordena `remove_person` al reloj y conserva el histórico de asistencia.

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Falta `hire_date` | Carga por Excel antes de la fase 5; sin fecha se deshabilita solo vacaciones |
| ISAPI difiere por firmware | Simulador + prueba con el equipo real en la fase 4 antes de generalizar |
| Reloj sin internet o apagado | Cola local del agente; alerta de latido; recuperación periódica de 24 h |
| Reloj con hora desfasada | Campo `device_time`, revisión automática y alerta de desfase |
| Números de empleado repetidos o mal cargados | Índice único; checadas desconocidas quedan en revisión, no se pierden |
| Cálculo con reglas ambiguas | Motor puro con tabla de escenarios; parámetros con motivo y bitácora |
| Pérdida de evidencia | Checadas inmutables; adjuntos con baja lógica; recálculo siempre posible |
| Despliegue con lockout (código antes que SQL) | Migración primero; script consolidado `MIGRACIONES_DEPLOY_<fecha>.sql`; **no** usar `npm run migrate` sobre dump de prod en local |
| Archivos > 1000 líneas | Dividir servicios por responsabilidad (calculator, schedule, punches, incidents, vacations, board, exports, agent) |

## 16. Estándares de código

Zod en toda entrada; controladores delgados, servicios por dominio; sin archivos de más de 1000 líneas; `tsc -b` y `vitest` limpios; sin diálogos nativos del navegador; confirmaciones con modal singleton; íconos y nombres cortos; ningún DELETE físico de evidencia.

## 17. Lo que NO copiamos de bioresiduos (correcciones deliberadas)

- Validaciones manuales por regex → esquemas **Zod**.
- Aprobación/rechazo de checadas en revisión (allá no existía).
- Control de acceso consistente en descargas de comprobantes (allá faltaba).
- Deduplicación por ventana de rebote.
- Una sola regla para contar la falta por retardos en todos los tableros.
- Carga del cálculo por rango en vez de una consulta por empleado y día.
- Parámetros definidos sin uso (`dias_max_tramo_abierto`) y `retencion_fotos_dias` sin purga: solo se incluye lo que se implementa.
- Comprobantes en base64 dentro de la BD → archivos en disco con baja lógica.
