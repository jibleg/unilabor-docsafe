-- MIGRACIONES_DEPLOY_20261105.sql - (1) Help Desk: liga a un programa los planes de mantenimiento creados sin el, (2) ANA-REG-060: Buzon de firmas, (3) responsable del area por unidad y suplente, (4) REH-REG-003: evaluador como colaborador e indice unico de INICIAL en proceso (Fase 7 automatica). Aplicar COMPLETO y en este orden por pgAdmin, ANTES de reiniciar el backend nuevo. Requiere MIGRACIONES_DEPLOY_20261030 ya aplicado.
-- ============ 20261105_01_helpdesk_link_orphan_maintenance_plans.sql ============
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
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261105_01_helpdesk_link_orphan_maintenance_plans.sql', 'a52ef6a97b0efe59b42cb499aa9171226ab586e5a5ea6d529ea9dea96e337118') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261105_02_rh_supervision_signature_inbox.sql ============
-- =============================================================================
-- RH/Induccion - ANA-REG-060: firma a distancia desde el "Buzon de firmas".
--
-- Ya no se firma en presencia de RH. "Cerrar y firmar" ENVIA la lista a firma:
-- queda bloqueada (no se editan resultados ni cabecera) y cada firmante
-- (Supervisor / Auditor, Responsable del Area y Colaborador evaluado) firma
-- desde su propia sesion, en cualquier orden. Al reunirse las tres firmas la
-- lista se cierra sola (PDF, expediente, practica de la Fase 6, siguiente puesto).
--
--   DRAFT --(RH o el supervisor envian a firma)--> PENDING_SIGNATURES
--         --(tercera firma: cierre automatico)---> CLOSED
--   PENDING_SIGNATURES --(RH cancela el envio)---> DRAFT  (firmas invalidadas)
--
--   * rh_supervision_checklists           + signature_requested_at / _by_user_id
--                                         (quien envio a firma y cuando). La
--                                         decision "lista final de la Fase 6"
--                                         se guarda en is_final al enviar.
--   * rh_supervision_checklist_signatures una fila por firma y rol. A lo mas
--                                         UNA vigente por (lista, rol): el
--                                         indice unico parcial impide firmar
--                                         dos veces el mismo rol. Si RH cancela
--                                         el envio las firmas NO se borran: se
--                                         marcan con invalidated_at (rastro).
--   * Compatibilidad: las listas del flujo anterior en SUPERVISOR_SIGNED
--     pasan a PENDING_SIGNATURES con la firma del supervisor ya recabada
--     (faltan Responsable del Area y Colaborador). Conservan el criterio previo
--     de "lista final": lo son si estan ligadas a una inscripcion.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_supervision_checklists
  ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS signature_requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 1. Firmas por rol (vigentes e invalidadas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_checklist_signatures (
  id BIGSERIAL PRIMARY KEY,
  -- RESTRICT: una lista que ya recibio firmas no se elimina (se conserva el rastro).
  checklist_id BIGINT NOT NULL REFERENCES public.rh_supervision_checklists(id) ON DELETE RESTRICT,
  signer_role TEXT NOT NULL,
  signer_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  signer_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signature_path TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ NULL,
  invalidated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  invalidated_reason TEXT NULL,

  CONSTRAINT chk_rh_supervision_signatures_role CHECK (signer_role IN ('SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_supervision_signatures_active
  ON public.rh_supervision_checklist_signatures (checklist_id, signer_role) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_supervision_signatures_signer
  ON public.rh_supervision_checklist_signatures (signer_employee_id, signed_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Estados: PENDING_SIGNATURES sustituye a SUPERVISOR_SIGNED
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_supervision_checklists DROP CONSTRAINT IF EXISTS chk_rh_supervision_checklists_status;

-- La firma que el supervisor ya trazo con su cuenta pasa a la tabla de firmas.
INSERT INTO public.rh_supervision_checklist_signatures
  (checklist_id, signer_role, signer_employee_id, signer_user_id, signer_name, signature_path, signed_at)
SELECT c.id, 'SUPERVISOR', c.supervisor_employee_id, c.supervisor_user_id, c.supervisor_name, c.supervisor_signature_path,
       COALESCE(c.supervisor_signed_at, c.updated_at)
  FROM public.rh_supervision_checklists c
 WHERE c.status = 'SUPERVISOR_SIGNED' AND c.supervisor_signature_path IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.rh_supervision_checklist_signatures s
      WHERE s.checklist_id = c.id AND s.signer_role = 'SUPERVISOR' AND s.invalidated_at IS NULL
   );

UPDATE public.rh_supervision_checklists
   SET status = 'PENDING_SIGNATURES',
       signature_requested_at = COALESCE(supervisor_signed_at, updated_at),
       signature_requested_by_user_id = supervisor_user_id,
       is_final = (enrollment_id IS NOT NULL),
       updated_at = NOW()
 WHERE status = 'SUPERVISOR_SIGNED';

ALTER TABLE public.rh_supervision_checklists
  ADD CONSTRAINT chk_rh_supervision_checklists_status CHECK (status IN ('DRAFT', 'PENDING_SIGNATURES', 'CLOSED'));

-- El indice parcial del estado retirado ya no puede contener filas.
DROP INDEX IF EXISTS public.idx_rh_supervision_checklists_area_responsible;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261105_02_rh_supervision_signature_inbox.sql', '4e8b882bdbc2e8519ea8b271d22744ea88237fe2c56fd0074462e2ff5c0a13ea') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261105_03_rh_supervision_unit_area_signatories.sql ============
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
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261105_03_rh_supervision_unit_area_signatories.sql', 'daf16fbac26eeec5b5ccb9b78487c20239f75fa317164d32bd95ce4d1cad939d') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261105_04_rh_competency_evaluator_phase7_auto.sql ============
-- =============================================================================
-- RH/Induccion - Fase 7 automatica y regla del evaluador del REH-REG-003.
--
-- La evaluacion de competencia INICIAL (REH-REG-003) de la Fase 7 ya no la abre
-- RH a mano: se abre sola cuando el colaborador acredita la Fase 6 de TODOS sus
-- puestos y, despues, cada vez que la de un puesto queda autorizada (la del
-- siguiente puesto de su ruta). Regla del evaluador: quien fue supervisor del
-- colaborador en ese puesto durante la Fase 6 NO puede ser su evaluador; el
-- coordinador del area si.
--
--   * rh_competency_evaluations.evaluator_employee_id   QUIEN es el evaluador
--       (hasta hoy solo se guardaba su nombre en texto). Permite comparar por
--       colaborador contra el supervisor de la Fase 6. Se conserva
--       evaluator_name (es lo que imprime el registro). Las evaluaciones
--       anteriores quedan con NULL y NO se rellenan: para ellas la regla compara
--       por nombre normalizado (sin acentos ni mayusculas) como respaldo.
--
--   * ux_rh_comp_eval_inicial_open   a lo mas UNA evaluacion INICIAL en proceso
--       (borrador, o cerrada pendiente de autorizacion) por colaborador y
--       puesto. Es el candado que hace idempotente la apertura automatica ante
--       dos ejecuciones simultaneas (ultima firma de la lista y RH desde la
--       bandeja, doble autorizacion). Una INICIAL ya resuelta (autorizada o no
--       autorizada) no bloquea abrir otra.
--
-- Antes de desplegar conviene comprobar que no existan duplicados (si los hay,
-- esta migracion se detiene sin aplicar nada y hay que resolverlos primero):
--
--   SELECT employee_id, position_id, COUNT(*)
--     FROM public.rh_competency_evaluations
--    WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE')
--    GROUP BY employee_id, position_id HAVING COUNT(*) > 1;
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Quien es el evaluador
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS evaluator_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rh_competency_evaluations.evaluator_employee_id IS
  'Colaborador que evalua (NULL en evaluaciones anteriores a 2026-11-05 o sin evaluador asignado; evaluator_name conserva el nombre impreso).';

-- ---------------------------------------------------------------------------
-- 2. Una sola INICIAL en proceso por colaborador y puesto
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.rh_competency_evaluations
     WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE')
     GROUP BY employee_id, position_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay colaboradores con mas de una evaluacion REH-REG-003 INICIAL en proceso para el mismo puesto; resuelvelas (ver la consulta en la cabecera de esta migracion) antes de aplicarla.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_comp_eval_inicial_open
  ON public.rh_competency_evaluations (employee_id, position_id)
  WHERE evaluation_type = 'INICIAL' AND (status = 'DRAFT' OR authorization_result = 'PENDIENTE');

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261105_04_rh_competency_evaluator_phase7_auto.sql', '4a88a147107d0240de4b0e39ecd25493db2eb38e1356b6a64ec332c7a4b2ecdf') ON CONFLICT (filename) DO NOTHING;
