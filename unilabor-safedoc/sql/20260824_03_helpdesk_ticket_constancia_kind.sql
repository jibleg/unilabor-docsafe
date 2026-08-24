BEGIN;

-- =============================================================================
-- Helpdesk Tickets - TCK-04: catalogo de tipo de documento para la constancia
-- PDF generada al cerrar un ticket (se archiva en helpdesk_ticket_documents
-- siempre, y adicionalmente en helpdesk_asset_documents si el ticket tiene
-- asset_id, para que quede en el expediente del equipo).
-- =============================================================================

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('TICKET_CONSTANCIA', 'Constancia de atencion de ticket', 'Constancia PDF generada al cerrar una solicitud de soporte.', 16)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
