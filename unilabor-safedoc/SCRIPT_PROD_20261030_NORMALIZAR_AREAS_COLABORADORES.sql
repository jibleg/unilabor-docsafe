-- =============================================================================
-- SCRIPT_PROD_20261030_NORMALIZAR_AREAS_COLABORADORES.sql
--
-- Unifica employees.area (texto libre) a un nombre oficial por area:
-- MAYUSCULAS con acentos correctos. Corrige variantes de acentos, mayusculas,
-- genero y errores de captura (ej. Validacion/VALIDACIÓN -> VALIDACIÓN).
--
-- Criterio acordado con el usuario (2026-10-30):
--   * Recepcion queda en TRES areas: RECEPCIÓN (incluye "Recepcionista"),
--     RECEPCIÓN - FLEBOTOMÍA y FLEBOTOMÍA.
--   * NO se tocan (pendiente de que RH indique el area real de cada persona):
--     'Analista', 'RESPONSABLE SANITARIO', 'ADMINISTRATIVA', 'ADMINISTRATIVO'.
--   * 'Asesor' y 'Colaborador' (cuentas inactivas) se dejan igual.
--
-- Solo cambia valores que coinciden EXACTAMENTE con la tabla de mapeo; lo
-- demas queda intacto. Respaldo de valores anteriores en
-- employees_area_backup_20261030 (trazabilidad). Idempotente.
-- Correr en pgAdmin (o psql -v ON_ERROR_STOP=1 -f).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employees_area_backup_20261030 (
  employee_id bigint PRIMARY KEY,
  old_area    text,
  new_area    text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE area_map (old_area text PRIMARY KEY, new_area text NOT NULL) ON COMMIT DROP;
INSERT INTO area_map (old_area, new_area) VALUES
  ('ALMACEN',                      'ALMACÉN'),
  ('ANALITÍCA',                    'ANALÍTICA'),
  ('FLEBOTOMISTA',                 'FLEBOTOMÍA'),
  ('HEMATOLOGIA',                  'HEMATOLOGÍA'),
  ('INMUNOLOGIA ESPECIAL',         'INMUNOLOGÍA ESPECIAL'),
  ('MICROBIOLOGIA',                'MICROBIOLOGÍA'),
  ('Pre analiticos',               'PREANALÍTICOS'),
  ('PREANALITICOS',                'PREANALÍTICOS'),
  ('QUIMICA CLINICA',              'QUÍMICA CLÍNICA'),
  ('Recepcion',                    'RECEPCIÓN'),
  ('RECEPCION',                    'RECEPCIÓN'),
  ('Recepción',                    'RECEPCIÓN'),
  ('Recepcionista',                'RECEPCIÓN'),
  ('RECEPCION- FLEBOTIOMISTA',     'RECEPCIÓN - FLEBOTOMÍA'),
  ('RECEPCION - FLEBOTOMISTA',     'RECEPCIÓN - FLEBOTOMÍA'),
  ('Recursos Humanos',             'RECURSOS HUMANOS'),
  ('Seguridad e Higiene',          'SEGURIDAD E HIGIENE'),
  ('SERVCIOS GENERALES',           'SERVICIOS GENERALES'),
  ('Subrogación',                  'SUBROGACIÓN'),
  ('Tecnología de la información', 'TECNOLOGÍA DE LA INFORMACIÓN'),
  ('Toxicología',                  'TOXICOLOGÍA'),
  ('UROANALISIS',                  'UROANÁLISIS'),
  ('VALIDACION',                   'VALIDACIÓN'),
  ('Ventas',                       'VENTAS');

-- Respaldo (solo la primera vez por colaborador).
INSERT INTO public.employees_area_backup_20261030 (employee_id, old_area, new_area)
SELECT e.id, e.area, m.new_area
  FROM public.employees e
  JOIN area_map m ON m.old_area = e.area
ON CONFLICT (employee_id) DO NOTHING;

UPDATE public.employees e
   SET area = m.new_area, updated_at = now()
  FROM area_map m
 WHERE e.area = m.old_area;

COMMIT;

-- Verificacion: areas resultantes.
SELECT area, count(*) AS total, count(*) FILTER (WHERE is_active) AS activos
  FROM public.employees
 GROUP BY area
 ORDER BY area;
