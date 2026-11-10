-- MIGRACIONES_DEPLOY_20261109.sql - Fase 7 (REH-REG-003 y REH-REG-008) al Buzon de firmas + firma en lote. Aplicar por pgAdmin en xlab-extended (BD de DocSafe) ANTES de reiniciar el backend nuevo. Requiere MIGRACIONES_DEPLOY_20261106 ya aplicado. Aditivo e idempotente; compatible con PostgreSQL 10.
-- ============ 20261109_01_rh_phase7_signature_inbox.sql ============
-- =============================================================================
-- RH/Induccion Fase 7 - REH-REG-003 y REH-REG-008 al "Buzon de firmas".
--
-- Antes RH recababa todas las firmas en su pantalla, en persona, al cerrar. Ahora
-- "Enviar a firma" bloquea el registro y cada firmante firma desde su propia
-- sesion, en cualquier orden (con firma en lote para quien tiene varios). Con
-- la ultima firma el registro se cierra solo (PDF, expediente), igual que el
-- ANA-REG-060 de la Fase 6.
--
--   DRAFT (editable) --(RH envia a firma)--> DRAFT + signature_requested_at (bloqueado)
--                    --(ultima firma: cierre automatico)--> CLOSED
--   en firma --(RH cancela el envio)--> DRAFT editable, firmas invalidadas
--
-- "En firma" NO es un estado nuevo: el registro sigue en DRAFT con
-- signature_requested_at lleno. Asi todo lo que hoy lee DRAFT como "en proceso"
-- (tablero de competencia, Fase 7 automatica, indice de INICIAL abierta) sigue
-- igual.
--
--   * rh_competency_evaluations   + area/rh/director_signatory_employee_id
--                                 (los firmantes institucionales dejan de ser
--                                 solo un nombre: el Buzon necesita a la persona)
--                                 + signature_requested_at / _by_user_id.
--   * rh_assignment_letters       + director_signatory_employee_id
--                                 + signature_requested_at / _by_user_id.
--   * rh_document_signatures      una fila por firma y rol de los dos registros.
--                                 A lo mas UNA vigente por (registro, rol). Si RH
--                                 cancela el envio las firmas NO se borran: se
--                                 marcan con invalidated_at (rastro).
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS area_signatory_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rh_signatory_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS director_signatory_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.rh_assignment_letters
  ADD COLUMN IF NOT EXISTS director_signatory_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

-- Cartas en borrador: el Director General sugerido solo se guardo como nombre. Se
-- liga al colaborador activo con ese nombre exacto cuando hay uno solo.
UPDATE public.rh_assignment_letters l
   SET director_signatory_employee_id = m.employee_id
  FROM (
    SELECT l2.id AS letter_id, min(e.id) AS employee_id
      FROM public.rh_assignment_letters l2
      JOIN public.employees e ON e.is_active = TRUE AND lower(trim(e.full_name)) = lower(trim(l2.director_signatory_name))
     WHERE l2.status = 'DRAFT' AND l2.director_signatory_employee_id IS NULL AND trim(l2.director_signatory_name) <> ''
     GROUP BY l2.id
    HAVING count(*) = 1
  ) m
 WHERE l.id = m.letter_id;

CREATE TABLE IF NOT EXISTS public.rh_document_signatures (
  id BIGSERIAL PRIMARY KEY,
  document_kind TEXT NOT NULL,
  -- Sin FK (dos tablas posibles). Un registro con firmas no se elimina: lo impide el servicio.
  document_id BIGINT NOT NULL,
  signer_role TEXT NOT NULL,
  signer_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  signer_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signature_path TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ NULL,
  invalidated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  invalidated_reason TEXT NULL,

  CONSTRAINT chk_rh_document_signatures_kind CHECK (document_kind IN ('COMPETENCY_EVALUATION', 'ASSIGNMENT_LETTER')),
  CONSTRAINT chk_rh_document_signatures_role CHECK (signer_role IN ('EMPLOYEE', 'EVALUATOR', 'AREA', 'RH', 'DIRECTOR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_document_signatures_active
  ON public.rh_document_signatures (document_kind, document_id, signer_role) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_document_signatures_signer
  ON public.rh_document_signatures (signer_employee_id, signed_at DESC);

-- Busqueda del Buzon: registros en firma.
CREATE INDEX IF NOT EXISTS idx_rh_comp_eval_in_signature
  ON public.rh_competency_evaluations (signature_requested_at) WHERE status = 'DRAFT' AND signature_requested_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_assignment_letters_in_signature
  ON public.rh_assignment_letters (signature_requested_at) WHERE status = 'DRAFT' AND signature_requested_at IS NOT NULL;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261109_01_rh_phase7_signature_inbox.sql', 'bbcca8d0002cdedfcb3b7584e7f9d1771f7b7ef951ed55004749ce3fb24434d3') ON CONFLICT (filename) DO NOTHING;
