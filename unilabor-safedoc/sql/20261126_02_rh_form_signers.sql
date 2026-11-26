-- =============================================================================
-- RH - Firmantes de los formatos controlados (ELABORO / REVISO / AUTORIZO)
--
-- Los PDF de los formatos de RH (primero el Listado de personal autorizado
-- REH-REG-026) llevan al pie quien elaboro, reviso y autorizo. Aqui se guarda
-- por formato y por puesto de firma: nombre, cargo y la imagen de la firma
-- (PNG recortado + sha256). Cada cambio retira el registro anterior con
-- retired_at: nunca se borra, para que un PDF emitido antes siga explicable.
--
-- Sin permiso nuevo: edita quien autoriza la competencia
-- (RH.COMPETENCY.AUTHORIZE); consulta quien gestiona (RH.COMPETENCY.MANAGE).
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_form_signers (
  id BIGSERIAL PRIMARY KEY,
  form_code TEXT NOT NULL,
  slot TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signer_title TEXT NOT NULL,
  signature_path TEXT NULL,
  sha256 TEXT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ NULL,
  retired_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_rh_form_signers_slot CHECK (slot IN ('ELABORO', 'REVISO', 'AUTORIZO'))
);

-- Un solo firmante vigente por formato y puesto; los retirados se conservan.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_form_signers_active
  ON public.rh_form_signers (form_code, slot) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_form_signers_form
  ON public.rh_form_signers (form_code, registered_at DESC);

COMMENT ON TABLE public.rh_form_signers IS
  'Firmantes (nombre, cargo y firma) que imprimen los PDF de los formatos de RH. No se borra: se retira con retired_at.';

COMMIT;
