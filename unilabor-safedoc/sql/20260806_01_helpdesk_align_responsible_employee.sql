-- =============================================================================
-- Alineacion de datos: helpdesk_assets.responsible_employee_id ("Responsable
-- tecnico" del activo) vs helpdesk_area_responsibles (responsables del area,
-- configurados en Estructura organizacional).
--
-- Contexto: el campo "Responsable tecnico" del modal Nuevo/Editar activo solo
-- permite elegir, al momento de guardar, a alguien que YA es responsable del
-- area en ese instante. Pero si despues cambian los responsables del area en
-- Estructura (se agrega o se quita a alguien), los activos que ya tenian un
-- responsable guardado NO se actualizan solos: el dato queda "congelado" con
-- la persona que era responsable cuando se guardo por ultima vez.
--
-- Esta migracion:
--   1) Corrige automaticamente los activos cuya area tiene EXACTAMENTE un
--      responsable vigente y el activo no lo tiene asignado (o tiene a
--      alguien que ya no es responsable de esa area). Caso no ambiguo.
--   2) Dejar sin tocar (para revision manual) los activos cuya area no tiene
--      ningun responsable configurado, o tiene 2+ y no es posible saber cual
--      corresponde. El SELECT final los lista.
--
-- 100% de datos, NO cambia estructura (no crea columnas ni tablas). Segura de
-- re-correr: la segunda vez no encuentra nada que corregir (idempotente).
--
-- Efecto colateral en produccion: el mismo backend ya sincroniza este campo
-- automaticamente desde ahora en cada Movimiento de activo con responsable
-- (ver helpdesk-asset-movement.service.ts). Esta migracion es el backfill
-- unico para lo que ya estaba desalineado ANTES de ese cambio.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Correccion automatica: solo areas con un unico responsable vigente.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Reporte de lo que NO se pudo alinear solo (revisar manualmente en
--    Estructura organizacional -> Responsables por area, o en la ficha del
--    activo). Al correr esto en pgAdmin, revisa la pestana de resultados.
-- ---------------------------------------------------------------------------
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

COMMIT;
