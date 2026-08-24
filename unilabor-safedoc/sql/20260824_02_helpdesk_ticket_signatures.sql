BEGIN;

-- =============================================================================
-- Helpdesk Tickets - TCK-02: firma electronica en la confirmacion de
-- conformidad del solicitante (portal de autoservicio) y en el cierre
-- (responsable que cierra). Mismo mecanismo que Movimientos de activos
-- (SignaturePad -> PNG -> uploads/signatures), servido por endpoint dedicado.
-- =============================================================================

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS requester_signature_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS closer_signature_path TEXT NULL;

COMMIT;
