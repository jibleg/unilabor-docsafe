-- =============================================================================
-- Control de Asistencias - Ventanas de checada por turno.
--
-- Cada turno (bloque laboral) define en que ventana se acepta la checada de
-- entrada y la de salida, en minutos respecto a su hora de entrada / salida:
--   entrada valida: [inicio - entry_before_min, inicio + entry_after_min]
--   salida valida:  [fin - exit_before_min,    fin + exit_after_min]
-- La primera checada en la ventana de entrada es la entrada; la ultima en la
-- ventana de salida es la salida. Aditivo e idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE attendance.shifts
  ADD COLUMN IF NOT EXISTS entry_before_min SMALLINT NOT NULL DEFAULT 20
    CHECK (entry_before_min BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS entry_after_min SMALLINT NOT NULL DEFAULT 30
    CHECK (entry_after_min BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS exit_before_min SMALLINT NOT NULL DEFAULT 1
    CHECK (exit_before_min BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS exit_after_min SMALLINT NOT NULL DEFAULT 20
    CHECK (exit_after_min BETWEEN 0 AND 720);

COMMIT;
