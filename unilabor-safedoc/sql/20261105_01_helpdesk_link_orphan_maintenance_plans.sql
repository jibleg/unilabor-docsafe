-- =============================================================================
-- Help Desk / Programa de Mantenimiento: ligar planes sueltos a un programa
--
-- La pantalla clasica "Planes de mantenimiento" creaba planes sin program_id:
-- generaban ordenes y salian en el calendario, pero el activo aparecia "sin
-- programa" y el plan quedaba fuera del versionado. Desde esta entrega los planes
-- solo se crean desde el programa del activo; esta migracion regulariza los que
-- ya existen, con la misma regla del backfill de 20260922_02:
--   1. Activo con planes sueltos y SIN programa vigente -> se le crea un programa
--      (fuente INTERNAL) con la siguiente version libre.
--   2. Los planes sueltos se ligan al programa vigente de su activo.
--   3. Sus ordenes heredan la version del programa.
--
-- Solo agrega/liga: no borra ni modifica planes, ordenes ni evidencia.
-- Idempotente: una segunda corrida no encuentra planes sueltos y no hace nada.
-- =============================================================================
BEGIN;

-- 1. Programa para activos con planes sueltos y sin programa vigente -----------
INSERT INTO public.helpdesk_asset_maintenance_programs (asset_id, version, status, source_kind, source_notes, effective_from, change_reason)
SELECT orphan.asset_id,
       COALESCE((SELECT MAX(g.version) FROM public.helpdesk_asset_maintenance_programs g WHERE g.asset_id = orphan.asset_id), 0) + 1,
       'ACTIVE', 'INTERNAL',
       'Programa generado automaticamente a partir de planes creados fuera del programa del activo.',
       orphan.starts_on,
       'Migracion 20261105_01: envoltura de planes sin programa.'
  FROM (
    SELECT p.asset_id, COALESCE(MIN(p.starts_on), CURRENT_DATE) AS starts_on
      FROM public.helpdesk_maintenance_plans p
     WHERE p.is_active = TRUE
       AND p.program_id IS NULL
     GROUP BY p.asset_id
  ) orphan
 WHERE NOT EXISTS (
   SELECT 1 FROM public.helpdesk_asset_maintenance_programs g
    WHERE g.asset_id = orphan.asset_id AND g.status = 'ACTIVE'
 );

-- 2. Ordenes de los planes sueltos: heredan la version del programa vigente ----
--    (antes de ligar el plan, mientras program_id IS NULL aun los identifica).
UPDATE public.helpdesk_maintenance_orders o
   SET program_version = g.version
  FROM public.helpdesk_maintenance_plans p
  JOIN public.helpdesk_asset_maintenance_programs g ON g.asset_id = p.asset_id AND g.status = 'ACTIVE'
 WHERE p.id = o.plan_id
   AND p.is_active = TRUE
   AND p.program_id IS NULL
   AND o.program_version IS NULL;

-- 3. Planes sueltos: se ligan al programa vigente de su activo ------------------
UPDATE public.helpdesk_maintenance_plans p
   SET program_id = g.id
  FROM public.helpdesk_asset_maintenance_programs g
 WHERE g.asset_id = p.asset_id
   AND g.status = 'ACTIVE'
   AND p.is_active = TRUE
   AND p.program_id IS NULL;

COMMIT;
