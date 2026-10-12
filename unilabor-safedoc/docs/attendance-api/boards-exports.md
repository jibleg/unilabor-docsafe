# API de Asistencias: tableros, exportaciones y reporte

Prefijo `/api/attendance`. Todos los endpoints requieren JWT (`Authorization: Bearer`) y el permiso
`ATTENDANCE.RECORDS.READ`. Respuestas JSON sin envoltorio. Errores: `{ "message": string, "details"?: ... }`.

Errores comunes:

| HTTP | Cuando | Cuerpo |
|---|---|---|
| 400 | Parametro de consulta invalido | `{ "message": "Parametros de consulta invalidos", "details": { "errors": [{ "field": "date", "message": "Fecha invalida (usa AAAA-MM-DD)" }] } }` |
| 400 | Exportacion de dias con mas de 5000 filas | `{ "message": "La exportación excede 5000 filas. Acota el rango o aplica filtros." }` |
| 401 | Sin token / token invalido | `{ "message": "Token de acceso no proporcionado" }` |
| 403 | Sin el permiso | `{ "message": "No tienes el permiso necesario para realizar esta accion" }` |
| 404 | `employee_id` inexistente, no habilitado o fuera de la sucursal elegida (compromiso) | `{ "message": "Colaborador no encontrado o sin control de asistencia habilitado" }` |
| 500 | Error inesperado | `{ "message": "No se pudo obtener el tablero en vivo" }` |

Convenciones: fechas `YYYY-MM-DD`; horas `HH:MM` en la zona `settings.timezone`; instantes ISO 8601 UTC;
parametros vacios (`?branch_id=`) se tratan como ausentes. Solo se consideran colaboradores **habilitados** y activos.
Una sola regla de falta en todo el modulo: `falta = absent + is_late_accumulation_absence`.

---

## GET /board/live

Query: `date` (opcional, default hoy en la zona horaria del modulo), `branch_id` (opcional).

Para hoy el estado se calcula en el momento (no se persiste); para fechas pasadas se lee `attendance.daily_results`
(sin fila = `no_schedule`); fechas futuras: todos `upcoming`/`rest`/etc., sin checadas.

Estados (`status`): `present` (entro, aun no sale) · `left` (ya salio) · `late` (entro con retardo > tolerancia) ·
`upcoming` (por llegar) · `missing` (sin checar pasado `late_until_min`) · `incident` · `rest` (descanso/festivo) · `no_schedule`.
`expected_start/end` = tramo en curso (o el proximo). `people` ordenado por estado
(late, missing, present, upcoming, left, incident, rest, no_schedule) y nombre.

KPIs: `expected` = personas con horario ese dia y sin incidencia (present+left+late+upcoming+missing);
`present` = quienes ya checaron entrada (present+left+late); `late`, `missing`, `incident` por estado;
`pending_review` = personas con checadas pendientes de revision. `progress_percent = round(present/expected*100)` (0 si no hay esperados).

`absences_next_7_days`: incidencias autorizadas (no de horas) que inician o cubren de manana a +7 dias; maximo 8 items, `total` es el conteo real.
`devices`: por sucursal con agente, relojes o colaboradores; `online` = latido dentro de `agent_offline_min`.
`trend_14_days`: 14 dias cerrados anteriores a la fecha (hasta ayer), siempre 14 elementos (ceros si no hay datos).
`month_ranking`: top 10 del mes de `date` (dias cerrados, solo con dias esperados).
`alerts`: `without_schedule` (sin turno vigente), `without_device_number`, `pending_sync` (sincronizacion `pending` o `error`).

```json
{
  "date": "2026-10-12",
  "is_today": true,
  "kpis": { "expected": 4, "present": 3, "late": 1, "missing": 1, "incident": 0, "pending_review": 0 },
  "progress_percent": 75,
  "by_status": [{ "status": "late", "count": 1 }, { "status": "missing", "count": 1 }, { "status": "present", "count": 2 }],
  "people": [{
    "employee_id": 165, "code": "TEST-B002", "full_name": "TEST Colaborador 2 Zeta", "area": "Laboratorio",
    "branch_id": 5, "branch_name": "UNILABOR SALTO DE AGUA", "status": "late",
    "expected_start": "08:00", "expected_end": "17:00",
    "clock_in_at": "2026-10-12T14:25:00.000Z", "clock_out_at": null, "late_minutes": 25
  }],
  "absences_next_7_days": {
    "total": 1,
    "items": [{ "incident_id": 23, "employee_id": 165, "full_name": "TEST Colaborador 2 Zeta", "type_code": "vacation",
                "type_name": "Vacaciones", "start_date": "2026-10-18", "end_date": "2026-10-19", "days": 1 }]
  },
  "devices": [{
    "branch_id": 5, "branch_name": "UNILABOR SALTO DE AGUA",
    "agent": { "id": 5, "name": "Agente Salto", "online": true, "last_heartbeat_at": "2026-10-12T18:02:24.142Z" },
    "terminals_total": 1, "terminals_online": 1, "last_event_at": "2026-10-12T17:57:24.142Z"
  }],
  "trend_14_days": [{ "date": "2026-09-28", "attendances": 3, "incidents": 0, "lates": 0, "absences": 1 }],
  "month_ranking": [{ "employee_id": 164, "code": "TEST-B001", "full_name": "TEST Colaborador 1",
                      "branch_name": "UNILABOR SALTO DE AGUA", "index": 100, "lates": 0, "absences": 0, "streak": 7 }],
  "alerts": { "without_schedule": 0, "without_device_number": 0, "pending_sync": 0 }
}
```
`agent` es `null` si la sucursal no tiene agente. `area`, `branch_id`, `branch_name`, `expected_*`, `clock_*` pueden ser `null`.

---

## GET /board/commitment

Query: `period` (`day|week|fortnight|month|bimester|quarter|semester|year|custom`, default `month`), `anchor` (fecha dentro del periodo, default hoy),
`from`/`to` (solo `custom`; maximo 366 dias, si vienen invertidos se acomodan), `branch_id`, `employee_id`.

Solo dias **cerrados** (hasta ayer): `closed_through` es el ultimo dia considerado (`null` si el periodo aun no cierra su primer dia).
Los periodos de varios meses se alinean al multiplo (bimestre ene-feb, mar-abr...; trimestre; semestre). Inicio de semana segun `settings.week_start`.

Reglas (roadmap 7.7): esperados = dias con horario sin incidencia; asistencias = presentes + 0.5 x faltas parciales; puntual = `present`/`early_departure`
sin falta por retardos; `pct_attendance = asistencias/esperados`, `pct_punctuality = punctual/esperados`, `pct_exits = salidas completas/presentes`;
`index = round(ponderado por weights)`; niveles `exemplary|committed|regular|attention|no_data` con los umbrales de `weights`.
Ranking: indice desc (null al final), faltas asc, retardos asc, racha desc, nombre. `team` no incluye rachas.
`recognitions`: top 3 con nivel `exemplary|committed` y >= 3 dias esperados. `attention`: hasta 6 con nivel `attention|regular` por indice ascendente.
`trend.granularity`: `day|week|month` (day: day/week/fortnight/month y custom <= 31 dias; week: bimester/quarter y custom <= 120; month: semester/year y custom mayor).
`detail` es `null` salvo que se pida `employee_id`. Logros: "Cero faltas", "Cero retardos", "Todas sus salidas registradas", "N días puntuales seguidos" (mejor racha >= 10), "N h extra".
`days_to_review`: dias con checadas pendientes (`pending_review`) o presente/retardo sin salida (`missing_exit`).

```json
{
  "period": "quarter", "from": "2026-07-01", "to": "2026-09-30", "label": "jul - sep 2026", "closed_through": "2026-09-30",
  "previous": { "from": "2026-04-01", "to": "2026-06-30", "label": "abr - jun 2026" },
  "next": { "from": "2026-10-01", "to": "2026-12-31", "label": "oct - dic 2026" },
  "weights": { "attendance": 40, "punctuality": 40, "exits": 20, "exemplary": 95, "attention": 70 },
  "team": { "employees": 5, "expected": 126, "attendances": 119.5, "punctual": 104, "lates": 14, "late_minutes": 310, "absences": 11,
            "partial_absences": 3, "early_departures": 6, "missing_exit": 4, "complete_exits": 108, "present": 118, "incidents": 2,
            "hours": 1015, "overtime_hours": 16.5, "pct_attendance": 95, "pct_punctuality": 83, "pct_exits": 92,
            "index": 90, "level": "committed" },
  "people": [{
    "place": 1, "employee_id": 168, "code": "TEST-B006", "full_name": "TEST Colaborador 6", "area": "Laboratorio",
    "branch_id": 6, "branch_name": "UNILABOR INTERMEDICA", "index": 91, "level": "committed",
    "summary": { "expected": 22, "attendances": 21.5, "punctual": 18, "lates": 4, "late_minutes": 90, "absences": 2, "partial_absences": 1,
                 "early_departures": 1, "missing_exit": 0, "complete_exits": 20, "present": 21, "incidents": 1, "hours": 170,
                 "overtime_hours": 3, "pct_attendance": 98, "pct_punctuality": 82, "pct_exits": 95, "index": 91,
                 "level": "committed", "current_streak": 1, "best_streak": 9 }
  }],
  "trend": { "granularity": "week", "blocks": [{ "date": "2026-08-16", "label": "16/8", "attendances": 14, "lates": 2, "absences": 4, "incidents": 0 }] },
  "recognitions": [ /* mismo formato que people[] */ ],
  "attention": [ /* mismo formato que people[] */ ],
  "detail": {
    "employee_id": 170, "full_name": "TEST Colaborador 7", "code": "TEST-B007",
    "summary": { /* igual que people[].summary */ },
    "streak": { "current": 4, "best": 4 },
    "achievements": [{ "code": "zero_lates", "label": "Cero retardos" }],
    "comparison": {
      "attendance": { "person": 83, "team": 83, "difference": 0 },
      "punctuality": { "person": 83, "team": 83, "difference": 0 },
      "exits": { "person": 80, "team": 80, "difference": 0 }
    },
    "days": [{ "date": "2026-10-01", "day_result": "present", "expected_start": "08:00", "expected_end": "17:00",
               "clock_in": "08:00", "clock_out": "17:02", "late_minutes": 0, "early_departure_minutes": 0,
               "worked_hours": 8.5, "overtime_hours": 0, "is_late_accumulation_absence": false,
               "has_pending_review": false, "incident": null }],
    "days_to_review": [{ "date": "2026-10-05", "day_result": "present", "reason": "pending_review" }]
  },
  "employees": [{ "id": 168, "code": "TEST-B006", "full_name": "TEST Colaborador 6", "branch_id": 6 }],
  "branches": [{ "id": 6, "name": "UNILABOR INTERMEDICA" }]
}
```
`achievements[].code`: `zero_absences | zero_lates | all_exits | punctual_streak | overtime`.
`day_result`: `present|late|absent|partial_absence|early_departure|incident|rest_day|holiday|no_schedule`.
`employees` respeta `branch_id`; `branches` son las sucursales con colaboradores habilitados. Con `employee_id`, `people` trae solo esa persona.

---

## Exportaciones Excel

Respuesta: `200`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="..."`. Mismos filtros y validaciones que las pantallas (400 igual que arriba).

| Ruta | Query | Contenido | Nombre |
|---|---|---|---|
| `GET /export/commitment.xlsx` | `period, anchor, from, to, branch_id, employee_id` (igual que `/board/commitment`) | Hojas `Resumen`, `Colaboradores`, `Días` (solo con `employee_id`), `Tendencia` | `compromiso-asistencia_<desde>_<hasta>[_colaborador-<id>].xlsx` |
| `GET /export/days.xlsx` | `from`, `to` (obligatorios, <= 366 dias), `result`, `branch_id`, `employee_id`; maximo 5000 filas (400 si excede) | Hoja `Días` | `dias-asistencia_<desde>_<hasta>.xlsx` |
| `GET /export/overtime.xlsx` | `from`, `to` (obligatorios, <= 366 dias), `branch_id` | Hojas `Resumen` (por colaborador + fila TOTAL) y `Detalle` | `horas-extra_<desde>_<hasta>.xlsx` |

`days.xlsx` incluye todo colaborador con fila en `daily_results` (no filtra por habilitado), sucursal = la del dia (o la actual del colaborador).
Fechas son celdas de fecha (`dd/mm/yyyy`); porcentajes son celdas con formato `0%`.

## GET /report/commitment.pdf

Query: igual que `/board/commitment`. Respuesta `200`, `application/pdf`, `attachment; filename="compromiso-asistencia_<desde>_<hasta>[_colaborador-<id>].pdf"`.
Carta horizontal: membrete, titulo y periodo, 8 KPIs (indice, asistencia, puntualidad, salidas, retardos, faltas, incidencias, horas extra),
ranking de 12 columnas (o detalle dia por dia si hay `employee_id`), nota metodologica con pesos y umbrales, pie con fecha y paginas. Sin tendencia.
