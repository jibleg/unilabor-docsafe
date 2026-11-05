-- =============================================================================
-- RH/Induccion - Fase 7 automatica y regla del evaluador del REH-REG-003.
--
-- La evaluacion de competencia INICIAL (REH-REG-003) de la Fase 7 ya no la abre
-- RH a mano: se abre sola cuando el colaborador acredita la Fase 6 de TODOS sus
-- puestos y, despues, cada vez que la de un puesto queda autorizada (la del
-- siguiente puesto de su ruta). Regla del evaluador: quien fue supervisor del
-- colaborador en ese puesto durante la Fase 6 NO puede ser su evaluador; el
-- coordinador del area si.
--
--   * rh_competency_evaluations.evaluator_employee_id   QUIEN es el evaluador
--       (hasta hoy solo se guardaba su nombre en texto). Permite comparar por
--       colaborador contra el supervisor de la Fase 6. Se conserva
--       evaluator_name (es lo que imprime el registro). Las evaluaciones
--       anteriores quedan con NULL y NO se rellenan: para ellas la regla compara
--       por nombre normalizado (sin acentos ni mayusculas) como respaldo.
--
--   * ux_rh_comp_eval_inicial_open   a lo mas UNA evaluacion INICIAL en proceso
--       (borrador, o cerrada pendiente de autorizacion) por colaborador y
--       puesto. Es el candado que hace idempotente la apertura automatica ante
--       dos ejecuciones simultaneas (ultima firma de la lista y RH desde la
--       bandeja, doble autorizacion). Una INICIAL ya resuelta (autorizada o no
--       autorizada) no bloquea abrir otra.
--
-- Antes de desplegar conviene comprobar que no existan duplicados (si los hay,
-- esta migracion se detiene sin aplicar nada y hay que resolverlos primero):
--
--   SELECT employee_id, position_id, COUNT(*)
--     FROM public.rh_competency_evaluations
--    WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE')
--    GROUP BY employee_id, position_id HAVING COUNT(*) > 1;
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Quien es el evaluador
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS evaluator_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rh_competency_evaluations.evaluator_employee_id IS
  'Colaborador que evalua (NULL en evaluaciones anteriores a 2026-11-05 o sin evaluador asignado; evaluator_name conserva el nombre impreso).';

-- ---------------------------------------------------------------------------
-- 2. Una sola INICIAL en proceso por colaborador y puesto
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.rh_competency_evaluations
     WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE')
     GROUP BY employee_id, position_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay colaboradores con mas de una evaluacion REH-REG-003 INICIAL en proceso para el mismo puesto; resuelvelas (ver la consulta en la cabecera de esta migracion) antes de aplicarla.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_comp_eval_inicial_open
  ON public.rh_competency_evaluations (employee_id, position_id)
  WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE');

COMMIT;
