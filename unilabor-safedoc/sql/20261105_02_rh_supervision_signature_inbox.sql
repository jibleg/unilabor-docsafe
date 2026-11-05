-- =============================================================================
-- RH/Induccion - ANA-REG-060: firma a distancia desde el "Buzon de firmas".
--
-- Ya no se firma en presencia de RH. "Cerrar y firmar" ENVIA la lista a firma:
-- queda bloqueada (no se editan resultados ni cabecera) y cada firmante
-- (Supervisor / Auditor, Responsable del Area y Colaborador evaluado) firma
-- desde su propia sesion, en cualquier orden. Al reunirse las tres firmas la
-- lista se cierra sola (PDF, expediente, practica de la Fase 6, siguiente puesto).
--
--   DRAFT --(RH o el supervisor envian a firma)--> PENDING_SIGNATURES
--         --(tercera firma: cierre automatico)---> CLOSED
--   PENDING_SIGNATURES --(RH cancela el envio)---> DRAFT  (firmas invalidadas)
--
--   * rh_supervision_checklists           + signature_requested_at / _by_user_id
--                                         (quien envio a firma y cuando). La
--                                         decision "lista final de la Fase 6"
--                                         se guarda en is_final al enviar.
--   * rh_supervision_checklist_signatures una fila por firma y rol. A lo mas
--                                         UNA vigente por (lista, rol): el
--                                         indice unico parcial impide firmar
--                                         dos veces el mismo rol. Si RH cancela
--                                         el envio las firmas NO se borran: se
--                                         marcan con invalidated_at (rastro).
--   * Compatibilidad: las listas del flujo anterior en SUPERVISOR_SIGNED
--     pasan a PENDING_SIGNATURES con la firma del supervisor ya recabada
--     (faltan Responsable del Area y Colaborador). Conservan el criterio previo
--     de "lista final": lo son si estan ligadas a una inscripcion.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_supervision_checklists
  ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 1. Firmas por rol (vigentes e invalidadas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_checklist_signatures (
  id BIGSERIAL PRIMARY KEY,
  -- RESTRICT: una lista que ya recibio firmas no se elimina (se conserva el rastro).
  checklist_id BIGINT NOT NULL REFERENCES public.rh_supervision_checklists(id) ON DELETE RESTRICT,
  signer_role TEXT NOT NULL,
  signer_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  signer_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signature_path TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ NULL,
  invalidated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  invalidated_reason TEXT NULL,

  CONSTRAINT chk_rh_supervision_signatures_role CHECK (signer_role IN ('SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_supervision_signatures_active
  ON public.rh_supervision_checklist_signatures (checklist_id, signer_role) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_supervision_signatures_signer
  ON public.rh_supervision_checklist_signatures (signer_employee_id, signed_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Estados: PENDING_SIGNATURES sustituye a SUPERVISOR_SIGNED
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_supervision_checklists DROP CONSTRAINT IF EXISTS chk_rh_supervision_checklists_status;

-- La firma que el supervisor ya trazo con su cuenta pasa a la tabla de firmas.
INSERT INTO public.rh_supervision_checklist_signatures
  (checklist_id, signer_role, signer_employee_id, signer_user_id, signer_name, signature_path, signed_at)
SELECT c.id, 'SUPERVISOR', c.supervisor_employee_id, c.supervisor_user_id, c.supervisor_name, c.supervisor_signature_path,
       COALESCE(c.supervisor_signed_at, c.updated_at)
  FROM public.rh_supervision_checklists c
 WHERE c.status = 'SUPERVISOR_SIGNED' AND c.supervisor_signature_path IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.rh_supervision_checklist_signatures s
      WHERE s.checklist_id = c.id AND s.signer_role = 'SUPERVISOR' AND s.invalidated_at IS NULL
   );

UPDATE public.rh_supervision_checklists
   SET status = 'PENDING_SIGNATURES',
       signature_requested_at = COALESCE(supervisor_signed_at, updated_at),
       signature_requested_by_user_id = supervisor_user_id,
       is_final = (enrollment_id IS NOT NULL),
       updated_at = NOW()
 WHERE status = 'SUPERVISOR_SIGNED';

ALTER TABLE public.rh_supervision_checklists
  ADD CONSTRAINT chk_rh_supervision_checklists_status CHECK (status IN ('DRAFT', 'PENDING_SIGNATURES', 'CLOSED'));

-- El indice parcial del estado retirado ya no puede contener filas.
DROP INDEX IF EXISTS public.idx_rh_supervision_checklists_area_responsible;

COMMIT;
