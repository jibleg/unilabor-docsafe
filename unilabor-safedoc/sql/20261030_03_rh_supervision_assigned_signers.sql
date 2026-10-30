-- =============================================================================
-- RH/Induccion - ANA-REG-060: supervisor asignado por colaborador y puesto,
-- responsable del area como colaborador y firma en dos pasos.
--
--   * El Supervisor / Auditor de la Fase 6 es el SUPERVISOR DE LA INSCRIPCION
--     (rh_induction_enrollments.supervisor_employee_id, colaborador x puesto;
--     el mismo dato que imprime el REH-REG-005). La lista guarda una copia
--     (supervisor_employee_id) que se sincroniza mientras esta en borrador.
--   * El Responsable del Area se configura por area del proceso como
--     colaborador (rh_supervision_area_signatories.area_responsible_employee_id).
--   * Firma en dos pasos desde "Mis supervisiones" (cada quien con su cuenta):
--       DRAFT --(supervisor califica y firma)--> SUPERVISOR_SIGNED
--             --(responsable del area avala y firma)--> CLOSED
--     RH puede seguir cerrando en una sola sesion cuando ambos estan presentes.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_supervision_area_signatories
  ADD COLUMN IF NOT EXISTS area_responsible_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.rh_supervision_checklists
  ADD COLUMN IF NOT EXISTS supervisor_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_responsible_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_signed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS area_responsible_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.rh_supervision_checklists DROP CONSTRAINT IF EXISTS chk_rh_supervision_checklists_status;
ALTER TABLE public.rh_supervision_checklists
  ADD CONSTRAINT chk_rh_supervision_checklists_status CHECK (status IN ('DRAFT', 'SUPERVISOR_SIGNED', 'CLOSED'));

CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_supervisor
  ON public.rh_supervision_checklists (supervisor_employee_id) WHERE status = 'DRAFT';
CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_area_responsible
  ON public.rh_supervision_checklists (area_responsible_employee_id) WHERE status = 'SUPERVISOR_SIGNED';

-- Borradores existentes: toman el supervisor ya asignado en su inscripcion.
UPDATE public.rh_supervision_checklists c
   SET supervisor_employee_id = e.supervisor_employee_id,
       supervisor_name = emp.full_name,
       updated_at = NOW()
  FROM public.rh_induction_enrollments e
  JOIN public.employees emp ON emp.id = e.supervisor_employee_id
 WHERE c.enrollment_id = e.id AND c.status = 'DRAFT' AND c.supervisor_employee_id IS NULL;

COMMIT;
