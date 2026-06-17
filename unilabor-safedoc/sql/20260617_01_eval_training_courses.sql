-- Sprint 31 (EVAL-01) - Capacitaciones (training_courses).
-- Entidad ancla de las evaluaciones de capacitacion exigidas por ISO 15189:2022.
-- Idempotente: segura de re-correr; el migration runner la aplica una sola vez.
BEGIN;

CREATE TABLE IF NOT EXISTS public.training_courses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NULL,
  -- Vigencia de la constancia generada (meses). 0 = sin vencimiento. Default 12 (anual, ISO).
  certificate_validity_months INTEGER NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_training_courses_validity CHECK (certificate_validity_months >= 0)
);

CREATE INDEX IF NOT EXISTS idx_training_courses_is_active
  ON public.training_courses (is_active);

COMMIT;
