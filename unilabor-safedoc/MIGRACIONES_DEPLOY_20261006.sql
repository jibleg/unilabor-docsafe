-- MIGRACIONES_DEPLOY_20261006.sql — aplicar por psql desde el VPS (o pgAdmin) en prod (sgc.unilabor-app.com)
-- Contiene 20261006_01 (permanencia minima por pagina de lectura 7 s -> 1 s: DEFAULT en 3 tablas y
-- publicaciones abiertas + lecturas pending/in_progress). No toca lecturas read/signed/expired/cancelled.
-- PRE-CHEQUEO: la ultima aplicada en prod debe ser 20260930_01.
BEGIN;

-- ============ 20261006_01_reading_min_seconds_1s.sql ============
-- =============================================================================
-- Lectura con firma (acuses RH + Sala de Lectura de Calidad + Induccion):
-- la permanencia minima por pagina baja de 7 s a 1 s. El criterio de lectura
-- queda en: scroll completo de la pagina + pestania visible/con foco + 1 s.
--
-- * Nuevos registros: DEFAULT 1 en las tres tablas.
-- * Vigentes: publicaciones abiertas y lecturas aun no leidas (pending /
--   in_progress) pasan a 1 s, para que las nuevas asignaciones de Induccion
--   (heredan el valor de la publicacion) y las pendientes usen el criterio nuevo.
-- * NO se tocan lecturas 'read' / 'signed' / 'expired' / 'cancelled': su valor
--   es evidencia de la regla con la que se leyo y firmo (hoja anexa).
-- =============================================================================

ALTER TABLE public.rh_document_acknowledgements    ALTER COLUMN min_seconds_per_page SET DEFAULT 1;
ALTER TABLE public.quality_reading_publications    ALTER COLUMN min_seconds_per_page SET DEFAULT 1;
ALTER TABLE public.quality_reading_acknowledgements ALTER COLUMN min_seconds_per_page SET DEFAULT 1;

UPDATE public.quality_reading_publications
   SET min_seconds_per_page = 1, updated_at = NOW()
 WHERE status = 'open' AND min_seconds_per_page <> 1;

UPDATE public.quality_reading_acknowledgements
   SET min_seconds_per_page = 1, updated_at = NOW()
 WHERE status IN ('pending', 'in_progress') AND min_seconds_per_page <> 1;

UPDATE public.rh_document_acknowledgements
   SET min_seconds_per_page = 1, updated_at = NOW()
 WHERE status IN ('pending', 'in_progress') AND min_seconds_per_page <> 1;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20261006_01_reading_min_seconds_1s.sql', 'e0c39007726d13846ffbd8a14101bd713b21c34f54abe7a0c133c9e614b49dbe')
ON CONFLICT DO NOTHING;

COMMIT;
