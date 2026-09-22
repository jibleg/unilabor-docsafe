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
