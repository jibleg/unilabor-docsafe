-- =============================================================================
-- RH/Induccion - ANA-REG-060: Responsable del Area POR UNIDAD (sucursal).
--
-- Hasta hoy habia UN responsable por area del proceso (PRE, ANA, POS, ADM) para
-- todo el laboratorio. En cada unidad (Centro, CIDE, Intermedica, Lomas, San
-- Jose, Salto de Agua) no son las mismas personas, asi que el responsable por
-- unidad se agrega como una EXCEPCION OPCIONAL sobre el responsable general:
--
--   1. UNIT       responsable propio de (unidad de la ficha del evaluado, area)
--   2. GENERAL    responsable general del area (la configuracion de hoy)
--   3. ALTERNATE  suplente general del area (cuando el evaluado es el general)
--   4. ninguno    la lista queda sin responsable y no se puede enviar a firma
--
-- Candidato valido = colaborador activo y distinto del evaluado. Aplica a la
-- Fase 6 (lista ANA-REG-060) y a la Fase 7 (REH-REG-003 y carta REH-REG-008).
--
--   * rh_supervision_unit_area_signatories  responsable propio por (unidad,
--       area). Una fila con responsable NULL significa "hereda del general"
--       (la fila se conserva como rastro de que se configuro y se retiro).
--   * rh_supervision_area_signatories       + alternate_employee_id (suplente).
--   * rh_supervision_checklists             + branch_id (unidad con la que se
--       resolvio el responsable) y area_responsible_source (de que nivel
--       salio: UNIT, GENERAL, ALTERNATE, o MANUAL si se eligio en la lista de
--       una supervision de area).
--
-- La configuracion actual NO se mueve ni se copia: queda como responsable
-- general, de modo que ningun borrador cambia de responsable al desplegar.
-- Las listas en firma o cerradas solo reciben branch_id (dato derivado de su
-- branch_name), y las de supervision de area en firma, la marca MANUAL de su
-- responsable; sus firmantes no se tocan.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Responsable propio por unidad y area
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_unit_area_signatories (
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id),
  area_key TEXT NOT NULL,
  area_responsible_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (unit_id, area_key)
);

-- ---------------------------------------------------------------------------
-- 2. Suplente general del area
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_supervision_area_signatories
  ADD COLUMN IF NOT EXISTS alternate_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Unidad y origen del responsable en cada lista
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_supervision_checklists
  ADD COLUMN IF NOT EXISTS branch_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_responsible_source TEXT NULL;

ALTER TABLE public.rh_supervision_checklists DROP CONSTRAINT IF EXISTS chk_rh_supervision_checklists_responsible_source;
ALTER TABLE public.rh_supervision_checklists
  ADD CONSTRAINT chk_rh_supervision_checklists_responsible_source
  CHECK (area_responsible_source IS NULL OR area_responsible_source IN ('UNIT', 'GENERAL', 'ALTERNATE', 'MANUAL'));

-- ---------------------------------------------------------------------------
-- 4. Relleno de branch_id (solo donde falta)
-- ---------------------------------------------------------------------------
-- Borradores: la unidad vigente de la ficha del colaborador evaluado.
UPDATE public.rh_supervision_checklists c
   SET branch_id = emp.branch_id
  FROM public.employees emp
 WHERE emp.id = c.employee_id AND c.status = 'DRAFT' AND c.branch_id IS NULL AND emp.branch_id IS NOT NULL;

-- En firma o cerradas: la unidad cuyo nombre quedo copiado en la lista (solo si
-- el nombre identifica a una unica unidad). No se toca nada mas de esas listas.
UPDATE public.rh_supervision_checklists c
   SET branch_id = u.id
  FROM public.helpdesk_asset_units u
 WHERE c.branch_id IS NULL AND c.status <> 'DRAFT' AND c.branch_name IS NOT NULL
   AND lower(btrim(u.name)) = lower(btrim(c.branch_name))
   AND NOT EXISTS (
     SELECT 1 FROM public.helpdesk_asset_units other
      WHERE other.id <> u.id AND lower(btrim(other.name)) = lower(btrim(c.branch_name))
   );

-- ---------------------------------------------------------------------------
-- 5. Origen del responsable de los borradores existentes (solo donde falta)
-- ---------------------------------------------------------------------------
-- El responsable que ya coincide con el general del area del puesto salio de ahi.
UPDATE public.rh_supervision_checklists c
   SET area_responsible_source = 'GENERAL'
  FROM public.rh_positions rp
  JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
  JOIN public.rh_supervision_area_signatories s ON s.area_key = pa.code
 WHERE rp.id = c.position_id AND c.status = 'DRAFT' AND c.area_responsible_source IS NULL
   AND c.area_responsible_employee_id IS NOT NULL
   AND c.area_responsible_employee_id = s.area_responsible_employee_id;

-- Supervision de area (sin inscripcion) con otro responsable: se eligio a mano
-- en la lista y la sincronizacion debe respetarlo (tambien si esta en firma y
-- RH cancela despues su envio: vuelve a borrador con el mismo responsable).
UPDATE public.rh_supervision_checklists c
   SET area_responsible_source = 'MANUAL'
 WHERE c.status IN ('DRAFT', 'PENDING_SIGNATURES') AND c.enrollment_id IS NULL AND c.area_responsible_source IS NULL
   AND c.area_responsible_employee_id IS NOT NULL;

COMMIT;
