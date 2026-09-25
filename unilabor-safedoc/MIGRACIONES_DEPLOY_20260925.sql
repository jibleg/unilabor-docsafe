-- MIGRACIONES_DEPLOY_20260925.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260925_01 (progresion autonoma de Induccion Fases 1-4: interruptor por fase
-- auto_advance_on_pass + origen/trazabilidad de la inscripcion) y 20260925_02 (periodo de descanso
-- entre fases: advance_grace_hours por fase + readings_start_at por inscripcion), y las registra en
-- schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260924_03 (si los
-- consolidados 20260924_02/_03 aun no se aplicaron, aplicarlos primero):
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: columnas nuevas en rh_induction_phases (auto_advance_on_pass TRUE en Fases 1-3,
-- advance_grace_hours NULL) y en rh_induction_enrollments (origin 'MANUAL', advanced_from_enrollment_id,
-- readings_start_at NULL) + CHECKs e indices. No modifica inscripciones ni evaluaciones existentes.
-- Aplicar ANTES del deploy del backend. Es idempotente (IF NOT EXISTS / ON CONFLICT).
-- DESPUES del deploy: en el Tablero de induccion, "Sincronizar avances" hacia la Fase 3 (o
-- publicar la Fase 3) inscribe a los aprobados de la Fase 2 que aun no estan en ella.
BEGIN;

-- ============ 20260925_01_rh_induction_self_paced.sql ============
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

-- ============ 20260925_02_rh_induction_advance_grace.sql ============
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

INSERT INTO public.schema_migrations (filename, checksum) VALUES
  ('20260925_01_rh_induction_self_paced.sql', 'ffeb90a2eb3fda650f871a6247060d10816db5a7cb3cd18ceea79b21c3ea889f'),
  ('20260925_02_rh_induction_advance_grace.sql', '64fae6175bfb254406e538f0bc17bdbca82dc26aa0e6b195367a6fcd723d280b')
ON CONFLICT DO NOTHING;

COMMIT;
