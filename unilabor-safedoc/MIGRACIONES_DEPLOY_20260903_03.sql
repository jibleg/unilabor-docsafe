-- MIGRACIONES_DEPLOY_20260903_03.sql — aplicar por pgAdmin en prod (sgc.unilabor-app.com)
-- Contiene 20260903_02 (interruptor "Publicar fase" en rh_induction_phases) y la registra en
-- schema_migrations con el checksum del runner (sha256 del contenido crudo del archivo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260903_01:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: todas las fases quedan en BORRADOR. Los inscritos de la Fase 1 conservan sus
-- lecturas (y sus firmas) pero NO las ven en "Mis lecturas" hasta que RH pulse "Publicar fase"
-- (requiere documentos + cuestionario publicado). Al publicar reaparecen tal cual.
BEGIN;

-- ============ 20260903_02_rh_induction_phase_publish.sql ============
-- Publicacion explicita de la fase de Induccion ("Publicar fase").
--
-- Antes, inscribir a un colaborador asignaba de inmediato las lecturas en Sala
-- de Lectura aunque el cuestionario siguiera en borrador. Ahora la fase tiene
-- su propio interruptor: mientras published_at sea NULL, las inscripciones se
-- crean SIN lecturas y las ya asignadas no se muestran al colaborador; al
-- publicar (requiere documentos + cuestionario publicado) se asignan las
-- lecturas a todos los inscritos y desde ahi corre su limite de lectura.
--
-- Sin backfill a proposito: las fases arrancan en borrador y RH decide cuando
-- publicarlas (las lecturas ya asignadas en prod se conservan y reaparecen al
-- publicar).
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS published_by_user_id uuid NULL;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260903_02_rh_induction_phase_publish.sql', '3b6c8fec3295049a138b6e9c935f8facc3b3c0c9c7f8fceafaf68cbca0cd75e9');

COMMIT;

-- POST-CHEQUEO: las 7 fases con published_at NULL:
--   SELECT phase_number, name, published_at FROM public.rh_induction_phases ORDER BY phase_number;
