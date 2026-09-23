# Roadmap — Programa de Mantenimiento de Activos (Help Desk)

Calendario a contenedor completo, filtrable por unidad, área y responsable, con un
programa de mantenimiento **personalizado por activo** a partir del plan del fabricante
o de la empresa que da el servicio, alineado a **ISO 15189:2022 (6.4.5 mantenimiento y
reparación, 6.4.6 incidentes, 6.4.7 registros, 6.5 metrología)**, ISO/IEC 27001:2022
(A.7.13 mantenimiento de equipos, A.8.9 configuración, A.8.13 respaldos) e IEC 62353
(seguridad eléctrica de equipo médico).

Estado: **MP-01..MP-06 COMPLETOS, verificados end-to-end en local** (suite de recurrencia,
prueba backend de 29 comprobaciones contra la BD local y recorrido completo en navegador
con Playwright). Fecha: 2026-09-22. **Pendiente: deploy a producción** (migración
consolidada `MIGRACIONES_DEPLOY_20260922.sql` + backend + frontend), solo con
autorización explícita.

---

## 1. Decisiones confirmadas

1. Las **plantillas por categoría** las mantiene Help Desk (`HELPDESK.CATALOGS.MANAGE`).
2. La **verificación post-reparación** es obligatoria solo para activos **CRÍTICA/ALTA**.
3. El calendario nuevo **convive** con la página clásica de Mantenimiento (que gana
   "Ver en calendario"); no la reemplaza.
4. El programa de cada activo se **personaliza** con la fuente documentada (manual del
   fabricante, programa del proveedor, contrato o criterio interno) y es **versionado**.
5. Recurrencia: mensual, bimestral, trimestral, semestral, anual y **personalizada**
   (valor + unidad), con **ventana desde/hasta**, anclaje fijo/flotante, fin y pausa.
6. Defaults aceptados: proyección 12 meses ajustable por activo; costo en fase posterior;
   firma del responsable solo en rutinas externas y en activos crítica/alta; escalamiento
   a responsables de área + coordinación de Help Desk.

## 2. Modelo de datos (migración `sql/20260922_02_helpdesk_maintenance_program.sql`)

- `helpdesk_maintenance_templates` / `_template_routines` / `_template_tasks`.
- `helpdesk_asset_maintenance_programs` (versión, estado ACTIVE/SUPERSEDED, fuente,
  documento, vigencia, motivo de cambio, desviación, horizonte de proyección).
- `helpdesk_maintenance_plans` (rutina): `program_id`, `service_kind`, intervalo
  personalizado, `anchor_mode`, fin de recurrencia, pausa, `executor_kind`, `supplier_id`.
- `helpdesk_maintenance_orders`: `plan_id` NULL-able (verificación post-reparación),
  `is_projected`, `program_version`, `service_kind`, `ticket_id`, `derived_ticket_id`,
  ejecución real (ejecutor, proveedor, downtime, firmas, validación), constancia y evento
  del expediente, avisos de vencida/escalamiento; estado nuevo `PENDING_VALIDATION`.
- `helpdesk_asset_documents.maintenance_order_id` (evidencia por orden).
- Frecuencia `BIMONTHLY`; tipos de documento `MAINTENANCE_CONSTANCIA` y
  `MAINTENANCE_EVIDENCE`. Backfill: programa v1 para activos con planes activos.

## 3. Backend

| Servicio | Responsabilidad |
|---|---|
| `helpdesk-maintenance-recurrence.ts` (+ test) | Reglas puras: intervalos, proyección, ventana con tope por criticidad (crítica 0 d, alta 7, media 15, baja 30), firma y verificación. |
| `helpdesk-maintenance-projection.service.ts` | Órdenes proyectadas al horizonte; regeneración que nunca borra órdenes iniciadas, con recordatorio o con evidencia. |
| `helpdesk-maintenance-template.service.ts` | CRUD de plantillas. |
| `helpdesk-asset-program.service.ts` | Programa por activo: versiones, rutinas, pausa/reanudar, propuesta desde plantilla. |
| `helpdesk-maintenance-execution.service.ts` | Cierre con checklist obligatorio, evidencia, firmas, ticket correctivo por hallazgo, validación del responsable, anclaje flotante. |
| `helpdesk-maintenance-constancia.service.ts` | Constancia PDF + evento MAINTENANCE + documento en el expediente. |
| `helpdesk-maintenance-verification.service.ts` | Verificación post-reparación desde tickets (crítica/alta), bloquea validar el retorno. |
| `helpdesk-service-calendar.service.ts` | Calendario unificado (mantenimiento, calibración, correctivos) con filtros y cobertura. |
| `helpdesk-program-kpi.service.ts` / `helpdesk-program-report.pdf.ts` | Indicadores y programa del periodo en PDF. |
| `helpdesk-service-scheduler.service.ts` | Aviso antes del "desde", vencida tras el "hasta", escalamiento de críticos. |

Endpoints: `/helpdesk/maintenance-templates*`, `/helpdesk/maintenance-program/{calendar,
coverage,kpis,report.pdf,assets/:id,programs/:id/projection,routines/:id[/pause|/resume],
tickets/:id/verification}` y `/helpdesk/maintenance/orders/:id/{execute,validate,evidence}`.

## 4. Frontend

- `/helpdesk/maintenance-program`: calendario mes/semana/agenda/año, filtros en cascada,
  KPIs, "Mi calendario", arrastrar para reprogramar con justificación, panel lateral con
  acciones, cobertura, indicadores, ICS, PDF e impresión.
- `/helpdesk/assets/:id/program`: programa del activo (versiones, rutinas, historial).
- `/helpdesk/maintenance-templates`: plantillas por categoría.
- Ficha del ticket: aviso de verificación post-reparación pendiente.

## 5. Deploy

1. pgAdmin: `MIGRACIONES_DEPLOY_20260922.sql` (requiere 20260914_01 aplicada antes).
2. Backend + frontend (tar por ssh, ver `redeploy-scripts`). Sin `npm ci` (sin deps nuevas).
3. Env opcionales: `HELPDESK_ESCALATION_EMAIL`, `SERVICE_ESCALATION_DAYS`,
   `DIRECTORY_UPLOAD_MAINTENANCE_DOCUMENTS`.
4. Operativo: capturar **criticidad** de los activos (hoy vacía en prod) para que apliquen
   los topes de ventana, la firma obligatoria y la verificación post-reparación.

## 6. Fuera de alcance (siguiente iteración)

Costo del servicio, contratos/pólizas del proveedor ligados a la rutina, rutinas por
componente con vista bajo el padre, notificaciones push.
