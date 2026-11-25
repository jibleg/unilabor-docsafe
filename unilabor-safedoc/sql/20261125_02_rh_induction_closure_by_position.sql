-- =============================================================================
-- RH - Cierre del Formato de Induccion (REH-REG-005) por puesto
--
-- Cerrada la Carta de asignacion de puesto (REH-REG-008) de un puesto, RH
-- puede cerrar el Formato de Induccion de ESE puesto (Fases 1-4 + Fases 5-7
-- del puesto). Un colaborador con varios puestos tiene un cierre por puesto.
--
--   * position_id NULL      -> cierre general del colaborador (el de siempre).
--   * position_id con valor -> cierre del puesto, ligado a la carta cerrada.
--
-- Un cierre vigente por colaborador (general) y uno por colaborador x puesto.
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_induction_record_closures
  ADD COLUMN IF NOT EXISTS position_id BIGINT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS assignment_letter_id BIGINT NULL REFERENCES public.rh_assignment_letters(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rh_induction_record_closures.position_id IS
  'Puesto del cierre. NULL = cierre general del colaborador.';
COMMENT ON COLUMN public.rh_induction_record_closures.assignment_letter_id IS
  'Carta REH-REG-008 cerrada que habilito el cierre del puesto.';

-- El indice anterior permitia un solo cierre vigente por colaborador.
DROP INDEX IF EXISTS public.ux_rh_induction_closures_current;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_closures_current_general
  ON public.rh_induction_record_closures (employee_id)
  WHERE is_current = TRUE AND position_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_closures_current_position
  ON public.rh_induction_record_closures (employee_id, position_id)
  WHERE is_current = TRUE AND position_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'rh_induction_record_closures';
-- =============================================================================
