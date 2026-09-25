-- =============================================================================
-- RH/Induccion - Progresion autonoma de las Fases 1-4 (a ritmo del colaborador)
--
-- Antes el avance era por cohorte: RH publicaba una fase e inscribia a mano a
-- cada colaborador. Con esta migracion cada fase institucional tiene el
-- interruptor "Avanzar automaticamente al aprobar": en cuanto el colaborador
-- acredita la evaluacion de la fase N, el sistema lo inscribe en la fase N+1
-- (con su propio limite de lectura y ventana de examen desde ese momento). Si
-- la siguiente fase sigue en borrador, la inscripcion queda en espera y recibe
-- sus lecturas al publicarla (mismo flujo que ya existia).
--
-- La inscripcion registra su origen (MANUAL / BULK / AUTO_ADVANCE / RECONCILE)
-- y, cuando fue automatica, de que inscripcion aprobada proviene, para la
-- trazabilidad del REH-REG-005.
--
-- 100% ADITIVA: 1 columna booleana en fases + 2 columnas en inscripciones.
-- Las Fases 1-3 arrancan encendidas (la Fase 4 no tiene siguiente fase
-- institucional; las Fases 5-7 por puesto no participan de la progresion).
-- =============================================================================
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS auto_advance_on_pass BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.rh_induction_phases
   SET auto_advance_on_pass = TRUE
 WHERE scope = 'INSTITUTIONAL' AND phase_number BETWEEN 1 AND 3;

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS advanced_from_enrollment_id BIGINT NULL
    REFERENCES public.rh_induction_enrollments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rh_induction_enrollments_origin'
  ) THEN
    ALTER TABLE public.rh_induction_enrollments
      ADD CONSTRAINT chk_rh_induction_enrollments_origin
      CHECK (origin IN ('MANUAL', 'BULK', 'AUTO_ADVANCE', 'RECONCILE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_origin
  ON public.rh_induction_enrollments (origin);
