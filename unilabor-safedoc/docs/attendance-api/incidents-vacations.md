# API de Incidencias y Vacaciones (Control de Asistencias)

Base: `/api/attendance` (JWT de usuario). Permisos: `READ` = `ATTENDANCE.RECORDS.READ`, `AUTH` = `ATTENDANCE.INCIDENTS.AUTHORIZE`.
Fechas siempre texto `AAAA-MM-DD`; instantes ISO. Numeros (dias/horas) como `number`.

Convenciones de error: `{ "message": "..." }` (400 invalido, 401, 403 sin permiso, 404, 409 conflicto/estado/politica).
Validacion Zod: `{ "message": "Datos de entrada invalidos", "errors": [{ "field": "reason", "message": "..." }] }`.

## Objeto `incident`

```json
{
  "id": 26,
  "employee": { "id": 144, "full_name": "Ana Perez", "employee_code": "E-100", "branch_id": 1, "branch_name": "UNILABOR CENTRO" },
  "type": { "id": 1, "code": "vacation", "name": "Vacaciones", "is_hourly": false, "requires_attachment": true, "deducts_vacation": true },
  "start_date": "2026-11-16", "end_date": "2026-11-20",
  "days": 4, "hours": null,
  "status": "captured",
  "reason": "prueba", "imss_folio": null,
  "captured_by_name": "RH Central", "authorized_by_name": null, "authorized_at": null,
  "authorization_notes": null, "notified_at": null,
  "attachments_count": 2, "created_at": "2026-10-12T18:02:29.075Z"
}
```
`status`: `captured | authorized | rejected | cancelled`. `days` se fija al capturar (dias laborables segun programacion; `null` en tipos por horas). El detalle agrega `attachments: [{ id, original_file_name, mime_type, size_bytes, uploaded_at, uploaded_by_name }]` (solo vigentes, sin binarios).

## Incidencias

### GET /incidents  (READ)
Query: `from`, `to` (traslape con el rango), `employee_id`, `branch_id`, `type_id`, `status`, `search` (nombre o codigo), `page` (1), `limit` (25, max 200).
Respuesta: `{ "data": [incident...], "pagination": { "page": 1, "limit": 25, "total": 3, "pages": 1 } }`.

### GET /incidents/:id  (READ)
`{ "incident": { ...incident, "attachments": [...] } }`. 404 si no existe.

### POST /incidents  (AUTH)
JSON o `multipart/form-data`. Campos: `employee_id`, `incident_type_id`, `start_date` (obligatorios); `end_date` (default = start_date), `hours` (obligatorio y 0<h<=24 en tipos por horas, que exigen una sola fecha), `reason`, `imss_folio`, `authorize` (true/false; "on"/"SI" en multipart), `authorization_notes`. Archivos: campo `files` (hasta 3; tambien se acepta `file`), JPG/PNG/WebP/PDF, 5 MB c/u. Se valida la firma binaria del contenido.
Respuesta 201: `{ "incident": {...detalle con attachments}, "warnings": ["La solicitud (4 dias) excede el saldo..."] }`.
Errores: 400 (colaborador no habilitado, tipo inactivo, fin<inicio, horas, falta comprobante si el tipo lo exige, archivo invalido), 409 (duplicado: mismo empleado/tipo/rango en captured|authorized; o politica `block` de vacaciones sin saldo).
Si el tipo descuenta vacaciones se evalua contra el saldo (saldo - pendientes capturados) segun `settings.vacations_no_balance`: `warn` agrega el aviso en `warnings`, `block` responde 409, `allow` no dice nada.

### POST /incidents/:id/authorize | /reject | /cancel  (AUTH)
Body `{ "notes"?: string }`. Respuesta `{ "incident": {...detalle}, "warnings": [] }`.
Transiciones: `captured -> authorized|rejected|cancelled`, `authorized -> rejected|cancelled`; el resto 409. Autorizar un tipo con `requires_attachment` sin comprobante vigente => 409; y reevalua la politica de saldo (`block` => 409).
Al pasar a/desde `authorized`: `recalculateRange(rango, [empleado])` y, si el tipo deduce vacaciones, `recalculateVacationDaysTaken` (ambos best-effort). Al autorizar se envia correo al colaborador (best-effort) y se marca `notified_at` si salio.
`authorize`/`reject` registran quien y cuando decidio; `cancel` solo cambia el estado (y las notas si se envian).

### GET /incidents/:id/attachments/:attachmentId  (READ)
Descarga el archivo (`Content-Disposition: inline`, `Cache-Control: private, no-store`). 404 si no existe, tiene baja logica o falta en disco.

### POST /incidents/:id/attachments  (AUTH)
multipart, campo `files` (hasta 3). Solo incidencias captured|authorized (409 en otro caso; max 10 vigentes). Respuesta 201: `{ "attachments": [ ...vigentes ] }`.

### DELETE /incidents/:id/attachments/:attachmentId  (AUTH)
Baja logica (`deleted_at`, `deleted_by_user_id`); jamas se borra fila ni archivo. 409 si es el ultimo comprobante vigente de una incidencia autorizada cuyo tipo lo exige. Respuesta: `{ "incident": {...detalle} }`.

### POST /days/:employeeId/:date/justify  (AUTH)
multipart o JSON: `reason` (>=5), archivo opcional (`file` o `files`; obligatorio si el tipo `justified_absence` lo exige, lo que ocurre con la configuracion actual). Crea y autoriza una incidencia `justified_absence` de un dia (days = 1) y recalcula el dia. Respuesta 201 `{ "incident": {...}, "warnings": [] }`. 409 si ya hay una igual vigente.

## Importacion Excel

### GET /incidents/template  (AUTH)
Descarga `plantilla-incidencias.xlsx`. Hojas: `Incidencias` (encabezados + listas desplegables de tipo y SI/NO), `Instrucciones`, `Ejemplo`, `Catalogos` (tipos y colaboradores habilitados).
Columnas: `employee_number` (numero de reloj o employee_code), `type` (nombre o codigo), `start_date` (AAAA-MM-DD, DD/MM/AAAA o serial/fecha de Excel), `end_date`, `hours`, `reason`, `imss_folio`, `authorize` (SI/NO), `notes`. Tambien se aceptan los encabezados en espanol (`numero_empleado`, `tipo`, `fecha_inicio`, `fecha_fin`, `horas`, `motivo`, `folio_imss`, `autorizar`, `notas`).

### POST /incidents/import/simulate  (AUTH)
multipart, campo `file` (.xlsx, <= 2 MB, max 500 filas). No guarda nada.
```json
{ "summary": { "total": 8, "ok": 4, "duplicate": 1, "error": 3 },
  "rows": [ { "row": 2, "status": "ok", "errors": [], "warnings": ["Requiere comprobante: ..."],
              "employee": "TEST Empleado Uno (T9001)", "type": "Permiso con goce", "start_date": "2026-10-20", "end_date": "2026-10-21" } ] }
```
`status`: `ok | duplicate | error`. Duplicado = misma llave empleado|tipo|inicio|fin vigente (captured/authorized) o repetida en el archivo.

### POST /incidents/import  (AUTH)
Mismo archivo; revalida e inserta SOLO las filas `ok`, cada una en su transaccion. Si el tipo requiere comprobante la fila queda `captured` aunque diga SI (advertencia). Respuesta:
```json
{ "summary": { "total": 8, "imported": 4, "authorized": 1, "skipped": 4, "failed": 0 },
  "rows": [ { "row": 3, "status": "ok", "errors": [], "warnings": [], "employee": "...", "type": "...", "start_date": "...", "end_date": "...",
              "imported": true, "authorized": true, "incident_id": 35 } ] }
```
Una fila que falla al guardar (p. ej. politica de saldo `block`) vuelve con `status: "error"`, `imported: false` y el motivo en `errors`. Errores 400: no es .xlsx, sin encabezados, mas de 500 filas, archivo sin filas.

## Vacaciones

### GET /vacations/employees/:employeeId  (READ)
```json
{ "employee": { "id": 144, "full_name": "...", "employee_code": "..." }, "hire_date": "2023-03-01",
  "periods": [ { "id": 3, "seniority_year": 3, "period_start_date": "2026-03-01", "period_due_date": "2027-09-01",
                 "days_entitled": 16, "days_adjustment": 0, "adjustment_reason": null, "days_taken": 4, "expired": false, "balance": 12 } ],
  "balance": { "entitled": 16, "adjustment": 0, "taken": 4, "balance": 12, "expiring": { "days": 12, "due_date": "2027-09-01" } } }
```
`balance` suma solo periodos NO vencidos; `expiring` es el primer vigente con saldo > 0 (o `null`).

### POST /vacations/employees/:employeeId/open-periods  (AUTH)
Abre/actualiza los periodos por aniversario y recalcula tomados. Misma forma que el GET mas `periods_touched`. 409 si el colaborador no tiene `hire_date`.

### POST /vacations/adjust  (AUTH)
Body `{ "period_id": 3, "adjustment": -2.5, "reason": "texto >=5" }` (-60..60 en pasos de 0.5; el ajuste REEMPLAZA al anterior). Recalcula el reparto de tomados. Respuesta: igual al GET del colaborador del periodo. 404 si el periodo no existe.

### POST /vacations/preview  (READ)
Body `{ "employee_id", "incident_type_id", "start_date", "end_date" }`.
```json
{ "applies": true, "no_hire_date": false, "working_days": 4, "balance": 16, "pending": 0, "available": 16,
  "exceeds": 0, "policy": "warn", "blocked": false, "message": null, "is_hourly": false, "deducts_vacation": true }
```
`applies=false` si el tipo no descuenta vacaciones (`working_days` sigue siendo el conteo informativo). `pending` = dias de solicitudes capturadas sin autorizar. `blocked` = la politica `block` impediria registrarla. Abre los periodos del colaborador si faltan (idempotente).

### GET /vacations/balances  (READ)
Query `branch_id`, `search`, `page`, `limit`. Colaboradores habilitados:
`{ "data": [ { "employee_id", "full_name", "employee_code", "branch_id", "branch_name", "hire_date", "entitled", "adjustment", "taken", "balance", "expiring": {"days","due_date"}|null } ], "pagination": {...} }`.

## Servicios para otras areas

`src/services/attendance/vacation-periods.service.ts`: `openVacationPeriodsForAll(today): Promise<number>` (UPSERT por aniversario; en conflicto solo actualiza fechas, no pisa `days_entitled`), `recalculateVacationDaysTaken(employeeId)` (reparto del periodo mas antiguo al mas nuevo; vencidos aportan 0; el remanente va al ultimo), `applyPolicyToCurrentPeriods(): Promise<number>` (alinea `days_entitled` de periodos no vencidos a la tabla vigente y recalcula tomados de los afectados), ademas `openVacationPeriodsForEmployee`, `loadVacationPolicy`, `attendanceToday`.
Otros: `working-days.service.ts#getWorkingDays(employeeId, from, to)`, `incidents.service.ts` (`createIncidentTx`, `transitionIncident`, ...).

## Archivos en disco
`DIRECTORY_UPLOAD_ATTENDANCE_INCIDENTS` (default `uploads/attendance-incidents`) / `AAAA-MM/<uuid>.<ext>`. `incident_attachments.file_path` guarda la ruta tal como la devuelve multer. Ante un error se borran solo los archivos recien subidos que no llegaron a tener fila.
