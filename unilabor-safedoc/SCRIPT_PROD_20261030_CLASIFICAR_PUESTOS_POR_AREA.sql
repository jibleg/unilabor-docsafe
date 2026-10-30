-- =============================================================================
-- SCRIPT_PROD_20261030_CLASIFICAR_PUESTOS_POR_AREA.sql
--
-- Clasificacion inicial de los puestos en las 4 areas del proceso
-- (requiere la migracion 20261030_02_rh_process_areas.sql).
--
-- Borrador propuesto 2026-10-30; confirmado por el usuario: son 4 areas,
-- AN-C (Analista "C") es Posanalitica y CUST (Custodio) y CHOF (Choferes) son
-- Preanaliticos. El resto es PROPUESTA pendiente de validacion de RH; se
-- corrige despues desde Puestos (induccion).
-- Quedan SIN area (RH decide): LAV, RSUB, SBIO, CSE.
--
-- Solo asigna puestos que aun no tienen area (no pisa lo que RH ya capturo).
-- Idempotente. Correr en pgAdmin (o psql -v ON_ERROR_STOP=1 -f).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE position_area_map (position_code text PRIMARY KEY, area_code text NOT NULL) ON COMMIT DROP;
INSERT INTO position_area_map (position_code, area_code) VALUES
  -- Preanalitica
  ('AP', 'PRE'), ('RA', 'PRE'), ('REE', 'PRE'), ('FLEB', 'PRE'), ('ASDM', 'PRE'), ('ACEN', 'PRE'), ('CPP', 'PRE'),
  ('CUST', 'PRE'), ('CHOF', 'PRE'),
  -- Analitica
  ('AN-A', 'ANA'), ('AN-B', 'ANA'), ('AUXA', 'ANA'), ('CPA', 'ANA'), ('RHEM', 'ANA'), ('RIES', 'ANA'), ('RIRU', 'ANA'),
  ('RMIC', 'ANA'), ('RPAR', 'ANA'), ('RQC', 'ANA'), ('RTOX', 'ANA'), ('RURO', 'ANA'), ('RAND', 'ANA'),
  -- Posanalitica
  ('AN-C', 'POS'),
  -- Administracion
  ('DG', 'ADM'), ('CAF', 'ADM'), ('ACON', 'ADM'), ('CRH', 'ADM'), ('CSGC', 'ADM'), ('CSI', 'ADM'), ('CCM', 'ADM'),
  ('VTA', 'ADM'), ('ALM', 'ADM'), ('MNT', 'ADM'), ('SGEN', 'ADM');

UPDATE public.rh_positions rp
   SET process_area_id = pa.id, updated_at = NOW()
  FROM position_area_map m
  JOIN public.rh_process_areas pa ON pa.code = m.area_code
 WHERE upper(rp.code) = upper(m.position_code)
   AND rp.process_area_id IS NULL;

COMMIT;

-- Verificacion: puestos por area (NULL = pendiente de clasificar).
SELECT COALESCE(pa.name, '— SIN ÁREA —') AS area, string_agg(rp.code, ', ' ORDER BY rp.code) AS puestos, count(*) AS total
  FROM public.rh_positions rp
  LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
 WHERE rp.is_active
 GROUP BY pa.name, pa.sort_order
 ORDER BY COALESCE(pa.sort_order, 99);
