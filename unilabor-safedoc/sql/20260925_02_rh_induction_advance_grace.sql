-- =============================================================================
-- RH/Induccion - Periodo de descanso entre fases (progresion autonoma)
--
-- Por fase (2-4), opcional e independiente: "Periodo de descanso antes de
-- iniciar esta fase (horas)". Cuando un colaborador AVANZA a la fase (avance
-- automatico al aprobar, sincronizacion o avance manual desde el tablero) la
-- inscripcion se crea de inmediato, pero sus lecturas, el limite de lectura y
-- el SMS se activan hasta que termina el descanso (readings_start_at). NULL o
-- 0 = sin descanso (arranque inmediato, comportamiento previo). No aplica a la
-- inscripcion manual directa de RH.
--
-- 100% ADITIVA: 1 columna en fases + 1 columna e indice en inscripciones; el
-- CHECK de origin admite el valor ADVANCE (avance manual desde el tablero).
-- =============================================================================
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS advance_grace_hours INT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rh_induction_phases_advance_grace') THEN
    ALTER TABLE public.rh_induction_phases
      ADD CONSTRAINT chk_rh_induction_phases_advance_grace
      CHECK (advance_grace_hours IS NULL OR (advance_grace_hours >= 0 AND advance_grace_hours <= 720));
  END IF;
END $$;

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS readings_start_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_readings_start
  ON public.rh_induction_enrollments (readings_start_at)
  WHERE readings_start_at IS NOT NULL;

ALTER TABLE public.rh_induction_enrollments DROP CONSTRAINT IF EXISTS chk_rh_induction_enrollments_origin;
ALTER TABLE public.rh_induction_enrollments
  ADD CONSTRAINT chk_rh_induction_enrollments_origin
  CHECK (origin IN ('MANUAL', 'BULK', 'AUTO_ADVANCE', 'RECONCILE', 'ADVANCE'));
