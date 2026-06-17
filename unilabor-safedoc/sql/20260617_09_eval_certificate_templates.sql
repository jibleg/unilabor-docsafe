-- Sprint 35 (EVAL-48) - Plantilla de constancia (certificate_templates).
-- Una plantilla disenable por capacitacion: textos con placeholders, logo y
-- orientacion. El mismo motor de render produce el preliminar (datos de muestra)
-- y la constancia real (Sprint 36).
BEGIN;

CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id BIGSERIAL PRIMARY KEY,
  training_course_id BIGINT NOT NULL UNIQUE REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title_text TEXT NOT NULL DEFAULT 'Constancia de capacitacion',
  body_text TEXT NOT NULL DEFAULT 'Se otorga la presente constancia a {{nombre}} por acreditar la capacitacion "{{capacitacion}}" con una calificacion de {{calificacion}} el {{fecha}}.',
  logo_path TEXT NULL,
  orientation TEXT NOT NULL DEFAULT 'landscape',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_certificate_orientation CHECK (orientation IN ('landscape', 'portrait'))
);

COMMIT;
