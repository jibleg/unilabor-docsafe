-- =====================================================================
-- SafeDoc — script para correr MANUALMENTE en pgAdmin4 sobre produccion.
-- Alinea helpdesk_assets.responsible_employee_id ("Responsable tecnico")
-- con los responsables vigentes de cada area (Estructura organizacional).
--
-- Es el mismo contenido de sql/20260806_01_helpdesk_align_responsible_employee.sql,
-- mas el registro en schema_migrations (mismo checksum que usa el runner) para
-- que `npm run migrate:status` la vea como aplicada despues de correr esto.
--
-- Seguro de correr completo: una sola transaccion (BEGIN/COMMIT), idempotente
-- (re-aplicarlo no cambia nada si ya se aplico). Si algo falla, hace ROLLBACK
-- automatico y no deja nada a medias.
--
-- Como usarlo: pegar completo en el Query Tool de pgAdmin4 contra la BD de
-- produccion y ejecutar. Al final revisa la pestaña "Data Output": lista los
-- activos que NO se pudieron alinear solos (requieren configurar su area en
-- Estructura organizacional -> Responsables por area).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

BEGIN;

-- ---------------------------------------------------------------------
-- 20260806_01_helpdesk_align_responsible_employee.sql
-- ---------------------------------------------------------------------

-- 1) Correccion automatica: solo areas con un unico responsable vigente.
WITH area_single_responsible AS (
  SELECT
    rp.area_id,
    MIN(e.id) AS employee_id,
    COUNT(DISTINCT e.id) AS responsible_count
  FROM public.helpdesk_area_responsibles rp
  JOIN public.employees e ON e.user_id = rp.user_id AND e.is_active = TRUE
  GROUP BY rp.area_id
  HAVING COUNT(DISTINCT e.id) = 1
)
UPDATE public.helpdesk_assets a
SET responsible_employee_id = s.employee_id,
    updated_at = NOW()
FROM area_single_responsible s
WHERE a.area_id = s.area_id
  AND a.is_active = TRUE
  AND (
    a.responsible_employee_id IS NULL
    OR a.responsible_employee_id <> s.employee_id
  );

-- 2) Reporte de lo que NO se pudo alinear solo (revisar manualmente).
SELECT
  a.id AS asset_id,
  a.asset_code,
  a.name AS asset_name,
  un.name AS unit_name,
  ar.name AS area_name,
  e.full_name AS current_responsible_technical,
  (
    SELECT COUNT(DISTINCT e2.id)
    FROM public.helpdesk_area_responsibles rp2
    JOIN public.employees e2 ON e2.user_id = rp2.user_id AND e2.is_active = TRUE
    WHERE rp2.area_id = a.area_id
  ) AS area_responsible_count,
  CASE
    WHEN (
      SELECT COUNT(DISTINCT e2.id)
      FROM public.helpdesk_area_responsibles rp2
      JOIN public.employees e2 ON e2.user_id = rp2.user_id AND e2.is_active = TRUE
      WHERE rp2.area_id = a.area_id
    ) = 0 THEN 'Area sin responsables configurados en Estructura'
    ELSE 'Area con 2+ responsables: elige manualmente cual corresponde'
  END AS motivo
FROM public.helpdesk_assets a
LEFT JOIN public.employees e ON e.id = a.responsible_employee_id
LEFT JOIN public.helpdesk_asset_units un ON un.id = a.unit_id
LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
WHERE a.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.helpdesk_area_responsibles rp3
    JOIN public.employees e3 ON e3.user_id = rp3.user_id AND e3.is_active = TRUE
    WHERE rp3.area_id = a.area_id AND e3.id = a.responsible_employee_id
  )
ORDER BY ar.name NULLS LAST, a.asset_code;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES (
  '20260806_01_helpdesk_align_responsible_employee.sql',
  'bf59870d536b084a069bf9a262bd8fbbebb5c0729824147aefa9d336f45abe0f'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
