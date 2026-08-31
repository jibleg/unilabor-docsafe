-- =============================================================================
-- RH - Sucursal del colaborador (campo "SUCURSAL" de la constancia de
-- Induccion, ver 20260831_04_certificate_induction_notes.sql)
--
-- Reusa el catalogo YA EXISTENTE de unidades de Helpdesk (helpdesk_asset_units,
-- "unidad de diagnostico") en vez de crear un catalogo nuevo duplicado. No se
-- toca esa tabla, solo se referencia desde employees.
--
-- 100% ADITIVA: 1 columna NULL-able en `employees`. No modifica ninguna
-- tabla existente salvo el ADD COLUMN aditivo.
-- =============================================================================
BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS branch_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id);

CREATE INDEX IF NOT EXISTS idx_employees_branch_id
  ON public.employees (branch_id)
  WHERE branch_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'employees' AND column_name = 'branch_id';
-- =============================================================================
