-- =============================================================================
-- Gestion de Activos - Nuevo tipo de documento del expediente: Registro de
-- temperatura.
--
-- Solo agrega una fila al catalogo helpdesk_document_kinds (el dropdown "Tipo
-- de documento" del expediente del activo). Aditivo e idempotente.
-- =============================================================================
BEGIN;

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT 'TEMPERATURE_LOG', 'Registro de temperatura', 'Bitacora o registro de temperatura del equipo.', 140
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_document_kinds WHERE UPPER(code) = 'TEMPERATURE_LOG');

COMMIT;
