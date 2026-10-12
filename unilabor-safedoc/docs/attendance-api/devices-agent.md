# Relojes HikVision: API de administracion y API del agente

Respuestas en JSON plano (sin envoltorio `{ok,data}`, igual que el resto de DocSafe). Errores: `{ "message": "...", "details"?: ... }`.
Fechas como texto ISO UTC (`2026-10-12T18:01:00.821Z`).

## A) Administracion (JWT de usuario) — prefijo `/api/attendance`

Permiso `ATTENDANCE.DEVICES.MANAGE`, salvo `GET /devices/overview` (`ATTENDANCE.RECORDS.READ`).
Errores comunes: 400 (validacion Zod: `{message, errors:[{field,message}]}`), 401, 403, 404, 409.

### GET /devices/overview
Todas las sucursales activas de `helpdesk_asset_units`, tengan o no agente.
```json
{ "agent_offline_min": 15,
  "branches": [{
    "branch_id": 1, "branch_code": "A", "branch_name": "UNILABOR CENTRO",
    "agent": { "id": 3, "branch_id": 1, "branch_name": "UNILABOR CENTRO", "name": "Agente Centro",
      "api_key_prefix": "9a53420f", "software_version": "1.0.0", "host_name": "PC-RECEP", "operating_system": "win32 10.0",
      "local_ip": "192.168.1.20", "last_heartbeat_at": "2026-10-12T18:02:38.702Z", "is_online": true,
      "is_active": true, "created_at": "2026-10-12T18:01:00.821Z" },
    "terminals": [{ "id": 2, "agent_id": 3, "serial_number": "SIM320MFWX0001", "name": "Reloj Recepcion",
      "model": "DS-K1T320MFWX-B", "firmware_version": "V3.5.2", "local_ip": "192.168.1.50", "is_active": true,
      "is_online": true, "clock_drift_seconds": -1, "enrolled_people_count": 5,
      "last_event_at": "2026-10-12T18:01:42.000Z", "last_heartbeat_at": "2026-10-12T18:02:38.706Z" }],
    "pending_sync_count": 0, "open_orders_count": 0 }] }
```
`agent` es `null` si la sucursal no tiene agente. En linea = ultimo latido dentro de `agent_offline_min` (terminal: ademas `is_online` reportado). `pending_sync_count` = colaboradores de la sucursal con `device_sync_status` en `pending`/`error`.

### POST /devices/agents
Body `{ "branch_id": 1, "name": "Agente Centro" }`. 201 con la clave **en claro una sola vez** (`Cache-Control: no-store`):
```json
{ "agent": { "...": "como en overview" }, "agent_key": "<64 hex>",
  "config": { "docsafeUrl": "https://sgc.unilabor-app.com", "agentKey": "<64 hex>" } }
```
`docsafeUrl` sale de `ATTENDANCE_PUBLIC_URL`/`PUBLIC_API_URL` o, si no existen, del host del request. Errores: 400 sucursal inexistente/inactiva, 409 la sucursal ya tiene agente. Auditado (`attendance_agent_created`).

### POST /devices/agents/:id/rotate-key
Sin body. Regenera la clave (la anterior deja de servir). Misma respuesta que la alta. 404 si no existe. Auditado.

### PATCH /devices/agents/:id
Body `{ "name"?: string, "is_active"?: boolean }` (al menos uno). Respuesta `{ "agent": {...} }`. Un agente inactivo recibe 403 en su API.

### DELETE /devices/agents/:id
Solo si esta inactivo (409 "Desactiva el agente antes de eliminarlo"). Cascada a terminales y ordenes. **409 si alguna terminal del agente ya tiene checadas** (ver "Desviaciones": el FK `ON DELETE SET NULL` de `punches.terminal_id` choca con el trigger de inmutabilidad y el CHECK `source<>'terminal' OR terminal_id IS NOT NULL`). Respuesta `{ "ok": true }`. Auditado.

### PATCH /devices/terminals/:id
Body `{ "name"?: string, "is_active"?: boolean }`. Respuesta `{ "terminal": { id, agent_id, serial_number, name, is_active } }`.

### GET /devices/orders?agent_id&status&page&limit
`status`: `pending|processing|done|error`; `limit` 1..100 (25). Mas recientes primero.
```json
{ "orders": [{ "id": 5, "agent_id": 3, "terminal_id": null, "terminal_name": null, "terminal_serial": null,
    "employee_id": 2, "employee_name": "Ursula ...", "order_type": "sync_person", "payload": {"employeeNo":"T001","name":"..."},
    "order_status": "done", "result": {"terminals":1}, "error_message": null, "attempt_count": 1,
    "created_at": "...", "picked_up_at": "...", "finished_at": "..." }],
  "total": 10, "page": 1, "limit": 25 }
```

### POST /devices/agents/:id/test
Encola `check_status`. 201 `{ "order_id": 5 }`. 409 si el agente esta inactivo.

### POST /devices/agents/:id/sync
Body `{ "all"?: boolean }`. Para los colaboradores de la **sucursal del agente** con numero de reloj:
- habilitados y activos con estado `pending`, `error` o `not_applicable` (todos si `all=true`) -> orden `sync_person` `{employeeNo, name}`;
- deshabilitados/inactivos con estado `synced` -> orden `remove_person`.
Marca `device_sync_status='pending'`, no duplica ordenes abiertas y omite habilitados sin numero.
```json
{ "queued": 4, "queued_sync": 3, "queued_remove": 1, "skipped_without_number": 0 }
```

### POST /devices/employees/:employeeId/enroll
Body `{ "mode": "fingerprint" | "face" }`. Encola `enroll_fingerprint`/`enroll_face` en la primera terminal activa de la sucursal del empleado. 201 `{ "order_id": 6, "terminal_id": 2 }`.
400 si: sin sucursal, sin numero de reloj, no sincronizado (`device_sync_status != synced`), sin agente activo o sin terminal registrada. 404 si el colaborador no existe.

---

## B) API del agente (sin JWT) — prefijo `/api/attendance/agent`

Auth: `Authorization: Bearer <64 hex>`. 401 clave invalida/ausente; 403 agente inactivo. La sucursal se deduce del agente. Errores del agente: `{ "message": "..." }`.
Nota: el cuerpo JSON global del servidor admite 5 MB; el agente corta los lotes por tamano.

### POST /heartbeat
```json
{ "version": "1.0.0", "pc": "PC-RECEP", "os": "win32 10.0", "ip": "192.168.1.20",
  "terminals": [{ "serial": "SIM320MFWX0001", "model": "DS-K1T320MFWX-B", "firmware": "V3.5.2",
                  "ip": "192.168.1.50", "online": true, "clockDriftSeconds": -1, "people": 5 }] }
```
Maximo 20 terminales (se descartan las que no traen `serial`; 400 si pasan de 20). UPSERT por serie; nombre inicial = modelo o serie.
```json
{ "ok": true, "pendingOrders": 2, "serverTime": "2026-10-12T18:02:25.602Z", "clockDriftMaxMin": 10,
  "terminalErrors": [{ "serial": "XYZ", "status": 409, "message": "La terminal pertenece a otro agente." }] }
```

### GET /orders?limit=10
`limit` 1..20. Toma ordenes `pending` y `processing` con `picked_up_at` > 10 min, con `attempt_count < 5` (`FOR UPDATE SKIP LOCKED`), suma un intento y las marca `processing`. Las que agotaron 5 intentos se cierran con error (y el perfil pasa a `error`).
```json
{ "orders": [{ "id": 6, "type": "sync_person", "terminalSerial": null, "payload": { "employeeNo": "T001", "name": "Martha ..." } }] }
```
Tipos: `sync_person`, `remove_person`, `enroll_fingerprint` (`payload.finger`), `enroll_face`, `fetch_events` (`payload.from/to` ISO), `check_status`. `terminalSerial` null = todas las terminales del agente.

### POST /orders/:id/result
Body `{ "ok": true, "result"?: {...}, "error"?: "texto (se recorta a 500)" }`. Solo cierra ordenes `processing` del mismo agente (404 si no). Respuesta `{ "ok": true }`.
Efecto en `employee_profiles`: `sync_person` ok -> `synced` + `device_synced_at`; error -> `error` + `device_sync_error`. `remove_person` ok -> `not_applicable`; error -> `error`.

### POST /punches
```json
{ "terminalSerial": "SIM320MFWX0001",
  "events": [{ "serial": "1001", "employeeNo": "T001", "deviceTime": "2026-10-12T12:01:42-06:00",
               "attendanceStatus": "checkIn", "method": "face", "photoBase64": "<JPEG/PNG/WebP, max 2 MB>" }] }
```
Lote 1..500, idempotente por `(terminal, serial)`. 404 si la terminal no pertenece al agente ("manda primero un latido").
- `attendanceStatus`: checkIn/overtimeIn -> `in`; checkOut/overtimeOut -> `out`; breakOut -> `break_start`; breakIn -> `break_end`; otro -> NULL.
- `method`: face|fingerprint|card|pin|other (acepta rostro/huella/tarjeta). `deviceTime` sin zona se interpreta en la zona del modulo.
- Numero sin colaborador (`device_employee_number`, sin distinguir mayusculas) -> `employee_id` NULL, `review_status='pending'`, motivo "Numero de empleado sin colaborador".
- Desfase > `clock_drift_max_min` y < 1 h respecto del servidor -> `pending` con motivo; mas de 1 h = historico, no se marca.
- Foto invalida: la checada se guarda sin foto. Evento invalido: se cuenta en `invalid`.
- Fotos en `DIRECTORY_UPLOAD_ATTENDANCE` (default `uploads/attendance-punches`); `photo_path` es **relativo** a ese directorio (`AAAA-MM/<uuid>.<ext>`). Helper: `resolvePunchPhotoPath()` en `services/attendance/attendance-photos.ts`.
- No recalcula dias.
```json
{ "ok": true, "inserted": 5, "duplicated": 1, "invalid": 1, "invalidSerials": ["2001"] }
```

## Desviaciones / notas
- `remove_person` correcto deja el perfil en `not_applicable` (no `synced`), para que `sync` no lo reencole indefinidamente.
- `sync` tambien reencola habilitados con estado `not_applicable` que tienen numero de reloj.
- `enroll` exige que el colaborador este `synced`.
- Eliminar un agente con checadas no es posible por el esquema (ver DELETE).
