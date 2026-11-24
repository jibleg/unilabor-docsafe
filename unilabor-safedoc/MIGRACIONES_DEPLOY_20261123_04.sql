-- MIGRACIONES_DEPLOY_20261123_04.sql
-- Aplicar en xlab-extended (BD de DocSafe) antes de subir el build. Incluye:
--   20261123_04_rh_position_assignment_other_authorizations.sql
-- Aditiva e idempotente; registra la migracion en schema_migrations. PostgreSQL 10.

-- =============================================================================
-- RH - Carta de asignacion de puesto REH-REG-008: texto de "Otras" por puesto
--
-- El puesto ya guarda que autorizaciones le aplican
-- (rh_position_assignment_authorizations). Faltaba el texto de la autorizacion
-- 82 "Otras", que cada carta capturaba a mano y salia distinto entre
-- colaboradores del mismo puesto. Se guarda en el puesto y se precarga en la
-- carta al emitirla; RH puede ajustarlo por persona antes de firmar.
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_positions
  ADD COLUMN IF NOT EXISTS assignment_other_authorizations TEXT NULL;

COMMENT ON COLUMN public.rh_positions.assignment_other_authorizations IS
  'Texto predeterminado de la autorizacion 82 "Otras" de la carta REH-REG-008 para este puesto.';

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261123_04_rh_position_assignment_other_authorizations.sql', 'eed245eeeefeb179432d013bcd48baccb6a7a31fa3b9afdb6152f7bb1c4d16be') ON CONFLICT (filename) DO NOTHING;
