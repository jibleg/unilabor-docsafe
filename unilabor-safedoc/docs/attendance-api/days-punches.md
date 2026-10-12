# API Asistencias: dias calculados y checadas

Prefijo `/api/attendance`. Todas las rutas requieren `Authorization: Bearer <JWT>`.
Errores: `{ "message": "..." }` (400 validacion de dominio, 403 sin permiso, 404, 409). Errores de
validacion Zod: `{ "message": "Datos de entrada invalidos", "errors": [{ "field", "message" }] }` (400).
Paginacion: `{ "page", "limit", "total", "totalPages" }` (limit por defecto 50, maximo 200).
Fechas `YYYY-MM-DD` (calendario local de la zona de ajustes); instantes en ISO 8601 UTC.

## GET /days
Permiso: `ATTENDANCE.RECORDS.READ`.
Query (todos opcionales): `from`, `to` (por defecto los ultimos 7 dias hasta hoy; maximo 366 dias),
`branch_id`, `employee_id`, `result` (uno o varios separados por coma: `present,late,absent,partial_absence,early_departure,incident,rest_day,holiday,no_schedule`),
`search` (nombre o codigo), `only_issues` (`true`: falta, retardo, falta parcial, salida anticipada, falta por retardos o revision pendiente), `page`, `limit`.
`summary` cuenta TODAS las filas del filtro (no solo la pagina).

```json
{
  "data": [{
    "id": 162, "work_date": "2026-10-05",
    "employee": { "id": 127, "code": "E-001", "full_name": "Ana Perez", "area": "Laboratorio", "branch_id": 3, "branch_name": "UNILABOR LOMAS" },
    "expected_start_time": "09:00", "expected_end_time": "18:00",
    "clock_in_at": "2026-10-05T15:20:00.000Z", "clock_out_at": "2026-10-06T00:00:00.000Z",
    "late_minutes": 20, "early_departure_minutes": 0, "worked_hours": 7.67, "overtime_hours": 0,
    "day_result": "late", "reason": "late_entry",
    "incident": null,
    "is_late_accumulation_absence": false, "has_pending_review": false,
    "segments": [{
      "shift_id": 31, "name": "Oficina", "expected_start": "09:00", "expected_end": "18:00",
      "clock_in_at": "2026-10-05T15:20:00.000Z", "clock_out_at": "2026-10-06T00:00:00.000Z",
      "clock_in_punch_id": 138, "clock_out_punch_id": 139,
      "late_minutes": 20, "early_departure_minutes": 0, "hours": 7.67, "has_punches": true
    }]
  }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 },
  "summary": { "absent": 0, "late": 1, "partial_absence": 0, "early_departure": 0, "late_accumulation_absence": 0, "pending_review": 0 },
  "range": { "from": "2026-10-05", "to": "2026-10-11" }
}
```
`incident` (si `day_result = incident`): `{ "id", "code", "name" }`. `reason`: `on_time`, `late_entry`, `early_exit`, `no_punches`,
`excessive_late`, `missing_exit`, `workday_incomplete`, `missing_segment`, `missing_exit_tolerated`, `holiday`, `holiday_worked`,
`rest_day`, `no_schedule`, `no_shift_for_day`, `incident:<codigo>`. Orden: fecha desc, nombre.
Errores: 400 rango > 366 dias, `from > to`, valores de filtro invalidos.

## POST /days/recalculate
Permiso: `ATTENDANCE.INCIDENTS.AUTHORIZE`.
Body: `{ "from": "2026-10-01", "to": "2026-10-10", "employee_ids": [127] }` (`employee_ids` opcional = todos los habilitados).
Maximo 92 dias por llamada. Solo dias cerrados: `to` se acota a ayer (hoy en la zona de ajustes); si `from` es posterior a ayer responde 400.
Respuesta 200: `{ "employees": 1, "days": 7 }`. Audita `attendance_days_recalculated`.

## GET /punches
Permiso: `ATTENDANCE.RECORDS.READ`.
Query (opcionales): `from`, `to` (por defecto ultimos 7 dias; maximo 366), `branch_id`, `employee_id`, `source` (`terminal|manual`),
`review_status` (`none|pending|approved|rejected`), `only_review` (`true` = solo pendientes; prevalece sobre `review_status`),
`search` (nombre, codigo o numero de reloj), `page`, `limit`. Orden: `punched_at` desc.

```json
{
  "data": [{
    "id": 141,
    "employee": { "id": 127, "code": "E-001", "full_name": "Ana Perez" },
    "device_employee_number": "1042",
    "source": "terminal",
    "terminal": { "id": 2, "name": "Reloj entrada", "serial_number": "DS-K1T..." },
    "branch": { "id": 3, "name": "UNILABOR LOMAS" },
    "punch_type": "in", "punched_at": "2026-10-08T15:00:00.000Z", "device_reported_at": "2026-10-08T15:00:01.000Z",
    "verification_method": "face", "review_status": "pending", "review_reason": null,
    "reviewed_at": null, "reviewed_by_name": null,
    "manual_justification": null, "registered_by_name": null
  }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 },
  "range": { "from": "2026-10-06", "to": "2026-10-12" }
}
```
`employee` es `null` para numeros de reloj desconocidos (usar `device_employee_number`). `terminal`/`branch` pueden ser `null`.
`punch_type` puede ser `null`.

## POST /punches/manual
Permiso: `ATTENDANCE.INCIDENTS.AUTHORIZE`. Respuesta 201.
Body: `{ "employee_id": 127, "work_date": "2026-10-05", "time": "09:20", "punch_type": "in", "justification": "Olvido checar" }`
(`punch_type`: `in|out`; `justification` 5 a 500 caracteres). La hora se interpreta en la zona de ajustes.
Respuesta: `{ "punch": <checada como en GET /punches>, "recalculation": { "employees": 1, "days": 2 } }`.
Errores: 400 fecha/instante futuro; 404 colaborador inexistente o inactivo. Audita `attendance_punch_manual_created`.
Recalcula `work_date - 1` y `work_date` (solo hasta ayer). Una checada de hoy posterior al corte del dia (04:00 por defecto) no recalcula nada (`days` = 0) y el dia lo calcula el proceso nocturno; una de hoy anterior al corte pertenece al dia laboral de ayer, que si se recalcula (`days` = 1).

## POST /punches/:id/review
Permiso: `ATTENDANCE.INCIDENTS.AUTHORIZE`.
Body: `{ "decision": "approve" | "reject", "reason": "min. 5 caracteres si reject" }`.
Solo checadas `pending`. Respuesta 200: `{ "punch": {...}, "recalculation": { "employees", "days" } }`
(si la checada no tiene colaborador no hay recalculo). Errores: 404, 409 (no esta pendiente), 400 (reject sin motivo).
Audita `attendance_punch_approved` / `attendance_punch_rejected`.

## POST /punches/:id/link-employee
Permiso: `ATTENDANCE.INCIDENTS.AUTHORIZE`. Body: `{ "employee_id": 127 }`.
Vincula una sola vez una checada de numero desconocido. Respuesta 200: `{ "punch": {...}, "recalculation": {...} }`.
Errores: 404 (checada o colaborador), 409 (ya vinculada). Audita `attendance_punch_linked`.

## Proceso nocturno
`startAttendanceScheduler()` (registrado en `src/index.ts`): cron `ATTENDANCE_CRON` (default `30 3 * * *`); `ATTENDANCE_ENABLED=false` lo apaga.
Cada corrida (`runAttendanceNightlyJob()`): recalcula los ultimos 3 dias hasta ayer y despues llama `openVacationPeriodsForAll(hoy)`
(un fallo ahi se registra pero no afecta el calculo). Resultado: `{ skipped, from, to, recalculation: {employees, days}, vacationPeriods }`.
