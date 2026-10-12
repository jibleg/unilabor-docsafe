# API de Turnos y Horarios (Control de Asistencias)

Base: `/api/attendance` (JWT de usuario). Permisos: lectura `ATTENDANCE.RECORDS.READ`, escritura `ATTENDANCE.SCHEDULES.WRITE`.
Fechas siempre `YYYY-MM-DD`; horas `HH:MM`. Weekdays ISO: 1 = lunes ... 7 = domingo.

Errores: `{ "message": "..." }`. Validacion de entrada (400): `{ "message": "Datos de entrada invalidos", "errors": [{ "field", "message" }] }`.
Dominio: 400 invalido, 404 no encontrado, 409 conflicto (con `details`). 401/403 por token / permiso.

Reglas de resolucion (motor `engine/schedule.ts`): si un dia tiene asignaciones de DIA SUELTO (no repite y inicio = fin) solo valen esas; si no, valen las recurrentes. Una asignacion sin turno (`shift_id` null) es DESCANSO.

## Turnos

### GET /shifts?include_inactive=true|false  (RECORDS.READ)
Respuesta 200 (`assignments_count` = asignaciones vigentes, sin fecha fin o con fin >= hoy):
```json
{ "shifts": [{ "id": 47, "name": "Matutino", "start_time": "08:00", "end_time": "12:00", "crosses_midnight": false,
  "break_minutes": 0, "shift_type": "fixed", "color_hex": "#112233", "is_active": true, "assignments_count": 3 }] }
```

### POST /shifts  (SCHEDULES.WRITE)
Body: `{ "name": "2-80 car, unico (sin distinguir mayusculas)", "start_time": "08:00", "end_time": "17:00", "break_minutes": 0-480 (def 0), "shift_type": "fixed"|"flexible" (def fixed), "color_hex": "#RRGGBB" (def #034898), "is_active": true? }`
201 `{ "shift": { ...misma forma que arriba, sin assignments_count } }`. 409 `Ya existe un turno con ese nombre`.
`crosses_midnight` es true cuando `end_time <= start_time` (turno nocturno).

### PATCH /shifts/:id  (SCHEDULES.WRITE)
Body: cualquier subconjunto (al menos uno) de los campos del alta. 200 `{ "shift": {...} }`; 404; 409 nombre repetido.
Si cambian horas/tipo/estado se recalculan (best-effort) los ultimos 60 dias de quienes usan el turno.

## Calendario semanal

### GET /schedule?week&branch_id&search&only_enabled&page&limit  (RECORDS.READ)
- `week`: cualquier fecha; se usa el inicio de semana segun el parametro `week_start` (def domingo). Def: hoy.
- `only_enabled` (def true): solo `attendance.employee_profiles.is_enabled`. `false` incluye a todo colaborador activo.
- `search`: nombre, codigo de empleado o numero de reloj. `branch_id`: `employees.branch_id`.
- `page` (def 1), `limit` (def 200, max 500).

200:
```json
{
  "data": [{
    "employee_id": 2, "full_name": "...", "employee_code": "UGMC", "position": "...",
    "branch_id": 1, "branch_name": "UNILABOR CENTRO", "device_employee_number": "T002", "is_enabled": true,
    "week_hours": 32.5,
    "days": [{
      "date": "2026-10-15",
      "chips": [{ "assignment_id": 49, "shift_id": 47, "name": "Matutino", "start_time": "08:00", "end_time": "12:00",
                  "hours": 4, "color_hex": "#112233", "is_recurring": false, "duplicate_count": 1 }],
      "is_rest_day": false, "has_conflict_limit": true, "is_split": true, "total_hours": 8.5
    }]
  }],
  "pagination": { "page": 1, "limit": 200, "total": 1, "total_pages": 1 },
  "shifts": [ /* turnos activos (leyenda), forma de GET /shifts sin assignments_count */ ],
  "max_shifts_per_day": 3, "week_start": "sunday", "week_start_date": "2026-10-11",
  "days": ["2026-10-11", "...", "2026-10-17"]
}
```
- Descanso: un chip `{ shift_id: null, name: "Descanso", start_time: null, end_time: null, hours: 0, color_hex: "#9CA3AF" }` y `is_rest_day: true`.
- `has_conflict_limit`: el dia ya alcanzo `max_shifts_per_day`. `is_split`: jornada partida (>1 turno). `total_hours`: horas netas (descuenta `break_minutes`).
- `duplicate_count`: asignaciones identicas fundidas en el chip. `assignment_id` es la primera de ellas.
- Para mostrar, los turnos inactivos se siguen viendo; el calculo de asistencia si los ignora.

### GET /schedule/employee/:employeeId?from&to  (RECORDS.READ)
Dia por dia resuelto (para la ficha). Def: la semana actual; maximo 366 dias. 200:
```json
{ "employee": { "id": 1, "full_name": "...", "employee_code": "..." }, "from": "2026-10-12", "to": "2026-10-18",
  "days": [{ "date": "2026-10-12", "weekday": 1, "chips": [ /* igual que arriba */ ], "is_rest_day": false,
             "has_schedule": true, "has_conflict_limit": false, "is_split": false, "total_hours": 4 }] }
```
404 colaborador inexistente; 400 rango invalido.

## Asignaciones

### POST /assignments  (SCHEDULES.WRITE)
```json
{ "employee_ids": [1, 2], "shift_ids": [47, 48], "start_date": "2026-10-12", "end_date": null,
  "repeats_weekly": true, "week_interval": 1, "weekdays": [1,2,3,4,5], "notes": "opcional", "keep_existing": false }
```
- `shift_ids` vacio = DESCANSO. `repeats_weekly=false` => dia suelto (`end_date = start_date`, `weekdays` se ignora). `week_interval` 1-8. Con `repeats_weekly=true`, `weekdays` es obligatorio.
- Crea una asignacion por colaborador y por turno. Colaboradores deben existir y estar habilitados (409 si no); turnos deben existir y estar activos (400).
- `keep_existing=true` (dia suelto): si el dia tiene solo programacion recurrente, la copia como sueltas para que el tramo nuevo se SUME en vez de reemplazarla.
- Todo en una transaccion: si hay conflicto en cualquier colaborador no se escribe nada.

201 `{ "assignments": [{ "id": 47, "employee_id": 1, "shift_id": 47, "is_rest_day": false, "start_date": "2026-10-12", "end_date": null, "repeats_weekly": true, "week_interval": 1, "weekdays": [1,2,3,4,5], "notes": null }] }`
(no incluye las copias hechas por `keep_existing`).

409 conflicto:
```json
{ "message": "Nombre: horario incoherente en 9 dia(s) — lun 12 oct: «B» 10:00-14:00 se encima con «A» 08:00-12:00 | ...",
  "details": [{ "employee_id": 1, "employee_name": "...", "summary": "horario incoherente en ...",
               "conflicts": [{ "date": "2026-10-12", "message": "..." }] }] }
```
(`conflicts` limitado a 50 por colaborador; `summary` muestra hasta 3 dias.) Conflictos detectados: traslape (incluye dia vecino para turnos nocturnos), turno sobre descanso, descanso sobre turnos, turno repetido, mas de `max_shifts_per_day`. Horizonte de simulacion: 366 dias. Un dia suelto solo compite con otros dias sueltos (reemplaza a las recurrentes); una recurrente compite con lo que el dia ya resuelve.

### PATCH /assignments/:id  (SCHEDULES.WRITE)
Body: subconjunto (al menos un campo) de `{ shift_id: number|null, start_date, end_date: date|null, repeats_weekly, week_interval, weekdays, notes }`. El colaborador no cambia. Se valida con el detector ignorando la propia asignacion.
200 `{ "assignment": { ...forma de arriba } }`; 404; 409 con el mismo `details`. Bitacora `edit`.

### DELETE /assignments/:id?date=YYYY-MM-DD&from_date_only=true|false  (SCHEDULES.WRITE)
Afecta a TODAS las asignaciones del mismo colaborador y turno (o descanso) que aplican en `date` (def: inicio de la asignacion), porque el calendario las funde en un chip.
- `from_date_only=true` y `date` posterior al inicio: CIERRA la asignacion el dia anterior (accion `end`).
- Si no: la elimina fisicamente (accion `remove`; la bitacora conserva la huella).

200 `{ "result": { "action": "end"|"remove"|"mixed", "ended_ids": [47], "removed_ids": [] } }`. 404 si no existe.

## Copiar horario

### POST /schedule/copy  (SCHEDULES.WRITE)
```json
{ "source_employee_id": 2, "source_date": "2026-10-14", "target_employee_ids": [9], "same_week": true, "weeks": 1, "replace": false }
```
- `source_date`: cualquier fecha de la semana origen. `target_employee_ids` vacio = el mismo colaborador.
- Semanas destino: `same_week=true` y el destino es OTRO colaborador => la misma semana; en cualquier otro caso => las `weeks` (1-12) semanas siguientes a la origen.
- Copia como DIAS SUELTOS (descansos incluidos). Omite dias que ya tienen programacion (recurrente o suelta) salvo `replace=true`, que borra los sueltos de ese dia y escribe los nuevos. Omite dias que generen conflicto. Dias sin horario en el origen no se copian.
- 400 si el origen no tiene horario esa semana. Bitacora `copy` por colaborador destino.

200:
```json
{ "result": { "created": 5, "assignments_created": 10, "skipped_existing": 0, "skipped_conflict": 0,
  "detail": [{ "employee_id": 9, "date": "2026-10-12", "reason": "existing"|"conflict", "message": "..." }] } }
```
`created` cuenta dias; `detail` hasta 5.

## Bitacora

### GET /schedule/log?from&to&employee_id&action&page&limit  (RECORDS.READ)
`from`/`to` sobre la fecha local (zona configurada) del cambio; `action`: schedule|edit|remove|end|copy; `page` def 1, `limit` def 50 (max 200). Mas reciente primero.
```json
{ "data": [{ "id": 9, "employee_id": 1, "employee_name": "...", "action": "end", "shift_name": "Matutino",
  "description": "Termino Matutino 08:00-12:00 (lun, mar...) ...", "start_date": "2026-10-12", "end_date": "2026-10-15",
  "repeats_weekly": true, "weekdays": [1,2,3,4,5], "changed_by_user_id": "uuid", "changed_by_name": "...",
  "changed_at": "2026-10-12T18:02:34.748Z" }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "total_pages": 1 } }
```
`shift_name` es 'Descanso' para descansos y null en `copy`.

## Notas de integracion
- Tras cada alta/edicion/baja/copia se llama `recalculateAffectedPastDays(employeeId, from, to)` (best-effort, nunca rompe la peticion) y se audita con `module_code: 'ATTENDANCE'` (`ATTENDANCE_SCHEDULE_ASSIGN|EDIT|END|REMOVE|COPY`, `ATTENDANCE_SHIFT_CREATE|UPDATE`).
- La bitacora (`attendance.schedule_changes`) se escribe en la misma transaccion que el cambio.
