# API de Asistencias - Catalogos y empleados

Base: `/api/attendance` (JWT de usuario). Permisos: READ = `ATTENDANCE.RECORDS.READ`, MANAGE = `ATTENDANCE.SETTINGS.MANAGE`, WRITE = `ATTENDANCE.SCHEDULES.WRITE`.

Errores (todos): `{ "message": "..." }`. Validacion de body: 400 `{ message, errors:[{field,message}] }`. Errores de parametros de ruta/query: 400 `{ message, details:[{field,message}] }`. Sin permiso: 403. Error inesperado: 500 con mensaje generico.
Fechas siempre `YYYY-MM-DD`; instantes ISO UTC.

## Parametros

### GET /settings (READ)
200 `{ "settings": [ { key, label, description, group, type, unit, options, min, max, default_value, value, is_modified } ] }`
```json
{ "settings": [ { "key": "tolerance_min", "label": "Tolerancia de entrada", "description": "...", "group": "punctuality", "type": "integer", "unit": "min", "options": null, "min": 0, "max": 120, "default_value": 10, "value": 10, "is_modified": false } ] }
```

### PUT /settings/:key (MANAGE)
Body `{ "value": number|string, "reason": string(5-500) }`. 200 `{ "settings": [...] }` (lista completa, igual que GET).
Errores: 400 parametro desconocido / valor fuera de rango / motivo corto.

### GET /settings/changes?limit=100 (READ)
`limit` 1-500. 200 `{ "changes": [ { id, setting_key, previous_value, new_value, change_reason, changed_at, changed_by_name } ] }` (`id` es string).

## Festivos

Objeto holiday: `{ id, holiday_date, name, is_active, created_at, updated_at }`.

### GET /holidays?year=2026 (READ)
200 `{ "holidays": [ holiday ] }` ordenados por fecha. `year` opcional (2000-2100).

### POST /holidays (MANAGE)
Body `{ holiday_date, name(2-120) }`. 201 `{ "holiday": holiday }`.
```json
{ "holiday": { "id": 4, "holiday_date": "2026-03-01", "name": "Dia X", "is_active": true, "created_at": "2026-10-12T17:59:21Z", "updated_at": "2026-10-12T17:59:21Z" } }
```
Errores: 400 fecha invalida (incluye 2026-02-31); 409 ya existe festivo en esa fecha.

### PATCH /holidays/:id (MANAGE)
Body parcial `{ name?, is_active?, holiday_date? }` (al menos uno). 200 `{ "holiday": holiday }`. Errores: 400, 404, 409 (fecha duplicada).

### DELETE /holidays/:id (MANAGE)
Borrado fisico. 200 `{ "ok": true }`. Error: 404.

Crear/editar/desactivar/borrar recalcula (best-effort, sin fallar la peticion) la fecha afectada (la anterior y la nueva si cambio la fecha) con `recalculateRange({from:fecha,to:fecha})`.

## Tipos de incidencia

Objeto: `{ id, code, name, requires_attachment, is_paid, deducts_vacation, counts_as_attendance, is_hourly, is_system, sort_order, is_active }`.

### GET /incident-types?include_inactive=true (READ)
200 `{ "incident_types": [ ... ] }` ordenados por sort_order. Por defecto solo activos.

### POST /incident-types (MANAGE)
Body `{ code (^[a-z][a-z0-9_]{1,29}$), name(2-80), requires_attachment=true, is_paid=true, deducts_vacation=false, counts_as_attendance=true, is_hourly=false, sort_order? }`. 201 `{ "incident_type": {...} }`.
Errores: 400 validacion; 409 codigo duplicado.

### PATCH /incident-types/:id (MANAGE)
Body parcial con los mismos campos mas `is_active` (al menos uno). 200 `{ "incident_type": {...} }`.
Errores: 400 (tipo de sistema: no cambia `code` ni se desactiva), 404, 409 (codigo duplicado).

## Vacaciones (tabla por antiguedad)

Fila: `{ from_seniority_year, vacation_days, law_days, differs_from_law }` (`law_days` = lo que marca la Ley/LFT 2023 para ese anio; `differs_from_law` = `vacation_days != law_days`). Todas las respuestas devuelven `{ "policy": [fila...] }` ordenado por anio.
```json
{ "policy": [ { "from_seniority_year": 1, "vacation_days": 15, "law_days": 12, "differs_from_law": true } ] }
```
- GET /vacation-policy (READ).
- PUT /vacation-policy/:fromYear (MANAGE) body `{ vacation_days }` (0-60, pasos de 0.5); `fromYear` 1-60; upsert. 400 si invalido.
- DELETE /vacation-policy/:fromYear (MANAGE). 400 si es la fila 1; 404 si no existe.
- POST /vacation-policy/reset (MANAGE): restaura la LFT 2023 (1:12,2:14,3:16,4:18,5:20,6:22,11:24,16:26,21:28,26:30,31:32,36:34,41:36,46:38,51:40).

## Sucursales

### GET /branches (READ)
200 `{ "branches": [ { "id": 1, "code": "A", "name": "UNILABOR CENTRO" } ] }` (activas, por sort_order, name).

## Empleados del control

Objeto employee:
```json
{ "id": 3, "employee_code": "AKHA", "full_name": "...", "email": "...", "area": "...", "position": "...", "is_active": true,
  "branch_id": 1, "branch_name": "UNILABOR CENTRO", "hire_date": "2020-05-10",
  "is_enabled": true, "device_employee_number": "TEST-3", "suggested_device_number": "AKHA",
  "device_sync_status": "pending", "device_sync_error": null, "device_synced_at": null, "has_schedule": false }
```
`device_sync_status`: `not_applicable | pending | synced | error`. `suggested_device_number` = `employee_code` si cumple el patron del reloj, si no `null` (solo sugerencia; nunca se asigna solo). `has_schedule` = tiene asignacion con turno vigente (shift_id no nulo, sin fin o con fin >= hoy). `is_enabled=false` si no hay perfil.

### GET /employees (READ)
Query: `branch_id`, `enabled` (true/false), `search` (nombre/codigo/numero de reloj), `sync_status`, `without_schedule` (true: habilitados sin turno), `include_inactive` (true), `page`, `limit` (max 100, default 20). 200 `{ "data": [employee], "pagination": { page, limit, total, totalPages } }`. Orden: nombre.

### GET /employees/summary?branch_id= (READ)
Cuenta solo habilitados activos. 200
```json
{ "summary": { "enabled": 1, "without_branch": 0, "without_device_number": 0, "pending_sync": 1, "without_schedule": 1, "sync_error": 0 } }
```

### GET /employees/:id (READ)
200 `{ "employee": employee }`. 404 si no existe.

### PATCH /employees/:id (WRITE)
Body parcial (al menos un campo): `{ is_enabled?: bool, device_employee_number?: string|null (^[A-Za-z0-9-]{1,20}$), branch_id?: int|null, hire_date?: "YYYY-MM-DD"|null }`. 200 `{ "employee": employee }`.
Reglas: `branch_id` y `hire_date` se guardan en `public.employees`; no se habilita sin sucursal ni numero de reloj (400); no se habilita a un inactivo (400); sucursal inexistente/inactiva (400); numero de reloj unico sin importar mayusculas (409 `El numero de reloj X ya lo usa <nombre>.`). Si cambia numero, sucursal o is_enabled: `device_sync_status` = `pending` (habilitado) o `not_applicable` (deshabilitado) y se limpia `device_sync_error`; la orden al reloj la encola otra area. Auditado (`ATTENDANCE`, `attendance_employee_updated`).

### POST /employees/bulk-enable (WRITE)
Body `{ rows: [{ employee_id, device_employee_number, branch_id? }] (1-500), default_branch_id? }`. Sucursal de cada fila: `branch_id` de la fila, si no `default_branch_id`, si no la del empleado. Todo en una transaccion; si alguna fila falla no se escribe nada.
200 `{ "enabled": 2, "employee_ids": [3, 5] }`.
400 con detalle por fila:
```json
{ "message": "Hay filas con errores; no se habilito a nadie.", "details": { "rows": [ { "employee_id": 5, "message": "El numero de reloj TEST-a se repite con el colaborador 3." } ] } }
```
