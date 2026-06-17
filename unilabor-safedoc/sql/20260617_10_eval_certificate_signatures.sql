-- Sprint 35 (EVAL-49) - Firmas de la constancia (certificate_template_signatures).
-- 1..N firmas por plantilla (nombre, cargo y opcional imagen de firma).
BEGIN;

CREATE TABLE IF NOT EXISTS public.certificate_template_signatures (
  id BIGSERIAL PRIMARY KEY,
  certificate_template_id BIGINT NOT NULL REFERENCES public.certificate_templates(id) ON DELETE CASCADE,
  signatory_name TEXT NOT NULL,
  role TEXT NULL,
  signature_image_path TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificate_signatures_template
  ON public.certificate_template_signatures (certificate_template_id);

COMMIT;
