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
