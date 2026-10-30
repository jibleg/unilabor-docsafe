-- =============================================================================
-- RH - Areas del proceso (Preanalitica, Analitica, Posanalitica, Administracion).
--
-- En UNILABOR el AREA la rige el PUESTO: cada puesto pertenece a una de estas
-- cuatro areas. Un colaborador con varios puestos puede estar en varias areas.
-- El campo employees.area pasa a ser la "Seccion / Departamento" del
-- colaborador (VALIDACIÓN, HEMATOLOGÍA, RECEPCIÓN...; catalogo
-- rh_employee_areas) y no cambia.
--
--   * rh_process_areas                 catalogo de las 4 areas.
--   * rh_positions.process_area_id     area a la que pertenece el puesto
--                                      (NULL = pendiente de clasificar).
--   * rh_supervision_area_signatories  los firmantes del ANA-REG-060 pasan a
--                                      configurarse por area del proceso:
--                                      area_key = codigo del area (PRE, ANA,
--                                      POS, ADM). Se descartan las filas por
--                                      seccion (configuracion previa, sin
--                                      evidencia; en prod la tabla esta vacia).
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_process_areas (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_process_areas_code ON public.rh_process_areas (code);

INSERT INTO public.rh_process_areas (code, name, sort_order) VALUES
  ('PRE', 'PREANALÍTICA', 1),
  ('ANA', 'ANALÍTICA', 2),
  ('POS', 'POSANALÍTICA', 3),
  ('ADM', 'ADMINISTRACIÓN', 4)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.rh_positions
  ADD COLUMN IF NOT EXISTS process_area_id BIGINT NULL REFERENCES public.rh_process_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_positions_process_area ON public.rh_positions (process_area_id);

DELETE FROM public.rh_supervision_area_signatories s
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_process_areas pa WHERE pa.code = s.area_key);

COMMIT;
