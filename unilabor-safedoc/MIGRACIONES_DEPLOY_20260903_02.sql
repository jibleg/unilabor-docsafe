-- MIGRACIONES_DEPLOY_20260903_02.sql — aplicar por pgAdmin en prod (sgc.unilabor-app.com)
-- Contiene 20260903_01 (backfill de documents.code desde el prefijo del titulo) y la registra en
-- schema_migrations con el checksum del runner (sha256 del contenido crudo del archivo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260902_03:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- DIAGNOSTICO (opcional, antes): cuantos documentos activos siguen sin codigo:
--   SELECT count(*) FILTER (WHERE code IS NULL) AS sin_codigo, count(*) AS activos
--     FROM public.documents WHERE status = 'active';
BEGIN;

-- ============ 20260903_01_documents_code_backfill_from_title.sql ============
-- Backfill de documents.code a partir del prefijo literal del titulo.
--
-- Bloque 0 de Induccion agrego la columna `documents.code` (20260828_01) pero
-- en prod nadie la ha capturado: el 100% de los documentos vigentes del SGC
-- llevan el codigo como prefijo del titulo ("REH-INS-001 Reglamento Interno-V.2").
-- Sin `code`, la busqueda por codigo al ligar documentos a una fase/puesto de
-- Induccion respondia "No existe un documento vigente con ese codigo".
--
-- Idempotente: solo toca filas activas con code NULL cuyo titulo empieza con un
-- codigo con formato AAA-AAA-999 (2-4 letras, 2-4 letras, 2-4 digitos). Deja
-- intactos los codigos ya capturados a mano.
UPDATE public.documents
   SET code = substring(title FROM '^([A-Z]{2,4}-[A-Z]{2,4}-[0-9]{2,4})')
 WHERE status = 'active'
   AND code IS NULL
   AND title ~ '^[A-Z]{2,4}-[A-Z]{2,4}-[0-9]{2,4}([^A-Za-z0-9]|$)';

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260903_01_documents_code_backfill_from_title.sql', 'c300464b44ff6558698e437ba15279b008ffbda59c47375ebdf05d9707324f14');

COMMIT;

-- POST-CHEQUEO: debe quedar 0 (o solo los titulos que no siguen la convencion AAA-AAA-999):
--   SELECT code, title FROM public.documents WHERE status = 'active' AND code IS NULL ORDER BY title;
