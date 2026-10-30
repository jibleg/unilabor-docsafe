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
