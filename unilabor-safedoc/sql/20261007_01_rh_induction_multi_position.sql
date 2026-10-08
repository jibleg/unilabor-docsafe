-- =============================================================================
-- RH/Induccion - Fases por puesto (5-7) para colaboradores con VARIOS puestos.
--
-- Decision RH (2026-10-07): las Fases 5, 6 y 7 se cursan POR CADA puesto
-- activo del colaborador, un puesto tras otro; solo se avanza a la fase
-- siguiente cuando TODOS los puestos aprobaron la anterior. Cada puesto
-- genera su propia constancia vigente en el expediente.
--
-- Cambios (100 % aditivos sobre los datos existentes):
--   * position_id        -> puesto de la inscripcion (fases POSITION); NULL en 1-4.
--   * position_sequence  -> orden del puesto dentro de la ruta de la fase.
--   * queue_status       -> QUEUED (en cola, sin lecturas), ACTIVE, CANCELLED
--                           (baja logica: el puesto se dio de baja; se conserva
--                           toda su evidencia).
--   * La unicidad pasa de (colaborador, fase) a (colaborador, fase, puesto)
--     ignorando las canceladas.
--
-- Backfill: las inscripciones existentes quedan ACTIVE; en Fases 5/6 se les
-- asigna el puesto de su curso (puente rh_induction_phase_positions) y la
-- secuencia 1 (su puesto actual es el primero de su ruta). No se borra ni se
-- modifica ninguna lectura, evaluacion, constancia ni checklist.
-- =============================================================================

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS position_id BIGINT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS position_sequence INTEGER NULL,
  ADD COLUMN IF NOT EXISTS queue_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT NULL;

ALTER TABLE public.rh_induction_enrollments
  DROP CONSTRAINT IF EXISTS chk_rh_induction_enrollments_queue_status;
ALTER TABLE public.rh_induction_enrollments
  ADD CONSTRAINT chk_rh_induction_enrollments_queue_status
  CHECK (queue_status IN ('QUEUED', 'ACTIVE', 'CANCELLED'));

ALTER TABLE public.rh_induction_enrollments
  DROP CONSTRAINT IF EXISTS chk_rh_induction_enrollments_cancelled;
ALTER TABLE public.rh_induction_enrollments
  ADD CONSTRAINT chk_rh_induction_enrollments_cancelled
  CHECK (queue_status <> 'CANCELLED' OR cancelled_at IS NOT NULL);

-- Backfill del puesto de las inscripciones por puesto existentes.
UPDATE public.rh_induction_enrollments e
   SET position_id = pp.position_id,
       position_sequence = 1
  FROM public.rh_induction_phase_positions pp
 WHERE pp.phase_id = e.phase_id
   AND pp.training_course_id = e.training_course_id
   AND e.position_id IS NULL;

UPDATE public.rh_induction_enrollments
   SET activated_at = created_at
 WHERE activated_at IS NULL AND queue_status = 'ACTIVE';

-- Unicidad por puesto (las canceladas no cuentan: un puesto que se dio de baja
-- y se vuelve a asignar abre una inscripcion nueva).
DROP INDEX IF EXISTS public.ux_rh_induction_enrollments;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_enrollments_position
  ON public.rh_induction_enrollments (employee_id, phase_id, COALESCE(position_id, 0))
  WHERE queue_status <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_queue
  ON public.rh_induction_enrollments (employee_id, phase_id, position_sequence)
  WHERE queue_status = 'QUEUED';
