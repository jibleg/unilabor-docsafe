-- =============================================================================
-- RH/Induccion - Firmantes por area de la Lista de verificacion ANA-REG-060.
--
-- El generador automatico de borradores (una lista por cada inscripcion activa
-- de la Fase 6 sin lista) prellena "Supervisor / Auditor" y "Responsable del
-- Area" con lo configurado aqui para el area del colaborador (employees.area,
-- comparada sin mayusculas ni espacios sobrantes). Editable desde la UI.
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_supervision_area_signatories (
  area_key TEXT PRIMARY KEY,
  area_name TEXT NOT NULL,
  supervisor_name TEXT NOT NULL DEFAULT '',
  supervisor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  area_responsible_name TEXT NOT NULL DEFAULT '',
  updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
