-- MIGRACIONES_DEPLOY_20260922.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260922_01 (interruptor por fase "Completar checklist al aprobar")
-- y la registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260914_01
-- (si aun no se aplico MIGRACIONES_DEPLOY_20260914.sql, aplicar ese primero):
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: agrega 1 columna booleana (default FALSE) y enciende el interruptor
-- SOLO en la Fase 1 (su historico ya se aplico con SCRIPT_PROD_20260922_CHECKLIST_FASE1_APROBADOS.sql).
-- Aplicar ANTES del deploy del backend: el codigo nuevo lee la columna al listar fases.
BEGIN;

-- ============ 20260922_01_rh_induction_phase_auto_checklist.sql ============
-- =============================================================================
-- RH/Induccion - Interruptor por fase "Completar checklist al aprobar"
--
-- El Checklist de contenidos de cada fase (REH-REG-005, "marque conforme se
-- imparta") se marcaba a mano por RH inscrito por inscrito. Con este
-- interruptor encendido, en cuanto la evaluacion de la fase queda en 'passed'
-- el sistema marca automaticamente TODOS los contenidos de la inscripcion, con
-- la cuenta recursos.humanos@unilabor.mx como autora de las marcas. RH conserva
-- el desmarcado manual (el gancho solo corre al emitir la constancia).
--
-- 100% ADITIVA: 1 columna booleana. Fase 1 arranca encendida porque su
-- historico ya se aplico con el script SCRIPT_PROD_20260922_CHECKLIST_FASE1_APROBADOS.sql;
-- el resto de fases arranca apagado y RH decide.
-- =============================================================================
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS auto_complete_checklist_on_pass BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.rh_induction_phases
   SET auto_complete_checklist_on_pass = TRUE
 WHERE phase_number = 1;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260922_01_rh_induction_phase_auto_checklist.sql', '05b1ae448bdbb3d1e5a592c504bc05de6ac3260b3bd0aaf5c268e019f6bfa748');

COMMIT;

-- POST-CHEQUEO:
--   SELECT phase_number, auto_complete_checklist_on_pass FROM public.rh_induction_phases ORDER BY 1;
--   (debe mostrar Fase 1 = true y el resto = false)
