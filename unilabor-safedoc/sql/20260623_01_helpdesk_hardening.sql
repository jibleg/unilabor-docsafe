BEGIN;

-- =====================================================================
-- Endurecimiento Help Desk MVP (2a capa):
--  1) Indice parcial de SLA para el reporte de tickets "vencidos"
--     (consulta `due_at < NOW()` en helpdesk-ticket.read).
--  2) CHECK de estado de ordenes de mantenimiento. Los valores de `status`
--     son 100% controlados por codigo (start/reschedule/close), por lo que
--     restringirlos a nivel BD es seguro y atrapa estados invalidos.
--
-- NOTA: NO se agrega CHECK sobre `risk_level` ni `order_checklist.result`:
-- el schema (helpdesk.schema.ts) deja esos campos como texto libre a proposito,
-- y un CHECK los romperia. Decision documentada, no omision.
-- =====================================================================

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_due_at
  ON public.helpdesk_tickets (due_at)
  WHERE due_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_helpdesk_maintenance_orders_status'
  ) THEN
    ALTER TABLE public.helpdesk_maintenance_orders
      ADD CONSTRAINT chk_helpdesk_maintenance_orders_status
      CHECK (status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'CLOSED'));
  END IF;
END $$;

COMMIT;
