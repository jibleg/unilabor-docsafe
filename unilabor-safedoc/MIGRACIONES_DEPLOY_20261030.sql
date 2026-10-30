-- MIGRACIONES_DEPLOY_20261030.sql - (1) Catalogo de secciones del colaborador, (2) areas del proceso por puesto, (3) ANA-REG-060: supervisor por inscripcion, responsable como colaborador y firma en dos pasos. Correr DESPUES de SCRIPT_PROD_20261030_NORMALIZAR_AREAS_COLABORADORES.sql (pgAdmin)
-- ============ 20261030_01_rh_employee_areas.sql ============
-- =============================================================================
-- RH - Catalogo de areas del colaborador.
--
-- employees.area era texto libre y acumulo variantes de la misma area
-- (Validacion / VALIDACIÓN, ADMINISTRATIVA / ADMINISTRATIVO, SERVCIOS...).
-- Desde ahora el expediente elige el area de este catalogo (lista con
-- buscador) y el backend rechaza areas fuera de el. employees.area sigue
-- siendo texto (lo leen muchos modulos) pero solo guarda nombres del catalogo.
--
--   name_key: nombre sin mayusculas, acentos ni espacios dobles; impide dar de
--             alta "Validacion" si ya existe "VALIDACIÓN".
--
-- Siembra: las areas distintas que hoy tienen los colaboradores ACTIVOS. Correr DESPUES
-- de SCRIPT_PROD_20261030_NORMALIZAR_AREAS_COLABORADORES.sql para no sembrar
-- variantes. Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_employee_areas (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_employee_areas_name_key ON public.rh_employee_areas (name_key);

INSERT INTO public.rh_employee_areas (name, name_key)
SELECT DISTINCT ON (k.name_key) k.name, k.name_key
  FROM (
    SELECT regexp_replace(trim(e.area), '\s+', ' ', 'g') AS name,
           translate(lower(regexp_replace(trim(e.area), '\s+', ' ', 'g')), 'áéíóúü', 'aeiouu') AS name_key
      FROM public.employees e
     WHERE e.is_active = TRUE AND e.area IS NOT NULL AND trim(e.area) <> ''
  ) k
 ORDER BY k.name_key, k.name
ON CONFLICT (name_key) DO NOTHING;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_01_rh_employee_areas.sql', '5dea30722f9f0d8c864c34e8d49773b6cf4a97c37260fb245840d0408d33530f') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261030_02_rh_process_areas.sql ============
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
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_02_rh_process_areas.sql', '1b2c8193733f8dd26c92bfc2950397a96970794abe8f31b189ae7efbe9e26c5a') ON CONFLICT (filename) DO NOTHING;

-- ============ 20261030_03_rh_supervision_assigned_signers.sql ============
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
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_03_rh_supervision_assigned_signers.sql', '54ed4cae4bcdf2069bb0444af9c36ad2cf63b1880f0c91405a9245525a0af413') ON CONFLICT (filename) DO NOTHING;
