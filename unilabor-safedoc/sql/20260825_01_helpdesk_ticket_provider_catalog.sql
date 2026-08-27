BEGIN;

-- =============================================================================
-- Helpdesk Tickets - vincula el proveedor de la bitacora telefonica (TCK-01,
-- support_channel = REMOTE_PHONE) al catalogo real de proveedores
-- (helpdesk_suppliers, el mismo que usa Activos/Proveedores), en vez de texto
-- libre. provider_name se conserva como snapshot de solo lectura (se sigue
-- llenando desde el backend a partir de provider_id, para no tocar los
-- consumidores existentes: constancia PDF, timeline, etc.)
-- =============================================================================

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS provider_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_provider_id
  ON public.helpdesk_tickets (provider_id)
  WHERE provider_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'helpdesk_tickets' AND column_name = 'provider_id';
-- =============================================================================
