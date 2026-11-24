-- MIGRACIONES_DEPLOY_20261123_05.sql
-- Aplicar en xlab-extended (BD de DocSafe) antes de subir el build. Incluye:
--   20261123_05_rh_assignment_letter_superseded.sql
-- Aditiva e idempotente; registra la migracion en schema_migrations. PostgreSQL 10.

-- =============================================================================
-- RH - Carta de asignacion de puesto REH-REG-008: carta sustituida
--
-- Cuando se emite una carta nueva en lugar de una ya cerrada, la anterior deja
-- de mostrarse (listado, detalle y PDF) pero NO se borra: queda en la base como
-- antecedente, con la referencia a la carta que la sustituye. Si la carta nueva
-- se elimina estando en borrador, la anterior vuelve a ser la visible.
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_assignment_letters
  ADD COLUMN IF NOT EXISTS superseded_by_letter_id BIGINT NULL
    REFERENCES public.rh_assignment_letters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.rh_assignment_letters.superseded_by_letter_id IS
  'Carta que sustituye a esta. Con valor, la carta ya no se muestra ni se puede consultar.';

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261123_05_rh_assignment_letter_superseded.sql', '27e123909006f3d7ed8f639bd6a2cdf668124633e1291185f0437385d6fb9d1b') ON CONFLICT (filename) DO NOTHING;
