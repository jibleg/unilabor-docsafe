# Manual Tecnico - Helpdesk, Activos y Mantenimiento

Version: `1.0`

Fecha: `2026-04-22`

## Alcance tecnico

Este documento resume la arquitectura tecnica del modulo `HELPDESK`, sus rutas, migraciones, flujos de datos y validaciones de cierre.

## Archivos principales

Backend:

- `unilabor-safedoc/src/routes/helpdesk.routes.ts`
- `unilabor-safedoc/src/controllers/helpdesk.controller.ts`
- `unilabor-safedoc/src/services/helpdesk-asset.service.ts`
- `unilabor-safedoc/src/services/helpdesk-ticket.service.ts`
- `unilabor-safedoc/src/services/helpdesk-maintenance.service.ts`

Frontend:

- `unilabor-safedoc-ui/src/layouts/HelpdeskLayout.tsx`
- `unilabor-safedoc-ui/src/pages/HelpdeskDashboardPage.tsx`
- `unilabor-safedoc-ui/src/pages/HelpdeskAssetsPage.tsx`
- `unilabor-safedoc-ui/src/pages/HelpdeskTicketsPage.tsx`
- `unilabor-safedoc-ui/src/pages/HelpdeskMaintenancePage.tsx`
- `unilabor-safedoc-ui/src/pages/HelpdeskMyPortalPage.tsx`
- `unilabor-safedoc-ui/src/api/service.ts`
- `unilabor-safedoc-ui/src/types/models.ts`

## Migraciones Helpdesk

Aplicar en este orden:

1. `unilabor-safedoc/sql/20260421_helpdesk_module_seed.sql`
2. `unilabor-safedoc/sql/20260421_helpdesk_base_catalogs.sql`
3. `unilabor-safedoc/sql/20260421_helpdesk_assets_inventory.sql`
4. `unilabor-safedoc/sql/20260421_helpdesk_tickets.sql`
5. `unilabor-safedoc/sql/20260422_helpdesk_ticket_resolution.sql`
6. `unilabor-safedoc/sql/20260422_helpdesk_maintenance_plans.sql`
7. `unilabor-safedoc/sql/20260422_helpdesk_maintenance_execution.sql`
8. `unilabor-safedoc/sql/20260422_helpdesk_iso_risk.sql`

Nota:

Las migraciones de Sprints 18 y 19 agregan columnas usadas por ejecucion de mantenimiento e ISO/riesgo. Si no se aplican, el backend responde con `409` indicando la migracion faltante.

## Endpoints principales

Base: `/api/helpdesk`

Dashboard:

- `GET /summary`
- `GET /dashboard`

Catalogos:

- `GET /catalogs`
- `GET /ticket-catalogs`
- `GET /maintenance-catalogs`

Activos:

- `GET /assets`
- `GET /assets/:id`
- `POST /assets`
- `PATCH /assets/:id`
- `DELETE /assets/:id`

Tickets operativos:

- `GET /tickets`
- `GET /tickets/:id`
- `POST /tickets`
- `PATCH /tickets/:id`
- `POST /tickets/:id/comments`
- `POST /tickets/:id/solve`
- `POST /tickets/:id/validate-return`
- `POST /tickets/:id/iso-risk`
- `POST /tickets/:id/technical-release`

Portal colaborador:

- `GET /me/assets`
- `GET /me/tickets`
- `GET /me/tickets/:id`
- `POST /me/tickets`
- `POST /me/tickets/:id/comments`
- `POST /me/tickets/:id/confirm-functionality`

Mantenimiento:

- `GET /maintenance/plans`
- `POST /maintenance/plans`
- `PATCH /maintenance/plans/:id`
- `GET /maintenance/orders`
- `POST /maintenance/orders/:id/start`
- `POST /maintenance/orders/:id/reschedule`
- `POST /maintenance/orders/:id/close`

## Seguridad

El modulo usa:

- `verifyToken`
- `authorizeModuleAccess('HELPDESK')`
- `authorizeModuleRole('HELPDESK', [...])`

Reglas:

- `ADMIN` y `EDITOR` operan activos, tickets y mantenimiento.
- `VIEWER` usa el portal colaborador.
- Endpoints `/me` validan el colaborador vinculado al usuario desde RH.
- Un colaborador solo puede crear tickets sobre activos asignados o bajo su responsabilidad.
- Un colaborador solo puede consultar y comentar tickets propios.

## Integracion RH

Dependencias:

- tabla `employees`
- campo `employees.user_id`
- areas/puestos de colaborador

Usos:

- asignacion de activos
- solicitante de tickets
- responsable operativo
- portal del colaborador

## Integracion QUALITY

Preparado para:

- `quality_document_id` en planes de mantenimiento
- `quality_document_id` en evaluacion ISO/riesgo de tickets
- evidencia documental referenciada en ordenes y tickets

## Reglas tecnicas clave

Solucion y retorno:

- `solved_at` y `solution_summary` registran solucion tecnica.
- `return_to_operation_at` registra regreso real a operacion.
- `downtime_minutes` se calcula con base en reporte y retorno.

Riesgo ISO:

- riesgo alto, critico, impacto a resultados o bloqueo operativo pueden exigir liberacion tecnica.
- si se requiere liberacion y no existe `technical_released_at`, el retorno a operacion responde `409`.

Mantenimiento:

- al crear plan se genera una orden programada.
- al cerrar orden se registra checklist y resultado.
- si el plan tiene frecuencia, se genera la siguiente orden.

## Validacion tecnica final

Comandos:

```powershell
cd C:\Developer\unilabor-safe\unilabor-safedoc
npm run build
```

```powershell
cd C:\Developer\unilabor-safe\unilabor-safedoc-ui
npm run build
```

```powershell
cd C:\Developer\unilabor-safe
git diff --check
```

## Estado de migraciones en ambiente local

Durante el desarrollo se intento aplicar migraciones con el `DATABASE_URL` del `.env`, pero PostgreSQL rechazo la autenticacion del usuario configurado.

Antes de validar en navegador se debe:

1. Confirmar credenciales de PostgreSQL.
2. Aplicar las migraciones Helpdesk en orden.
3. Reiniciar backend.
4. Validar rutas del modulo.

## Checklist QA funcional

- Crear activo con catalogos normalizados.
- Asignar activo a colaborador RH.
- Entrar con usuario colaborador y ver activo en `Mi portal`.
- Crear ticket desde activo asignado.
- Atender ticket como ADMIN/EDITOR.
- Registrar solucion tecnica.
- Registrar evaluacion ISO/riesgo si afecta resultados.
- Documentar liberacion tecnica si aplica.
- Confirmar funcionamiento desde portal colaborador.
- Crear plan preventivo para activo.
- Iniciar y cerrar orden de mantenimiento.
- Revisar dashboard de KPIs.
