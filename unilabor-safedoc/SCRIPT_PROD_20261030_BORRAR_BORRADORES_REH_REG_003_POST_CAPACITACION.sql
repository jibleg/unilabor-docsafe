-- =============================================================================
-- SCRIPT_PROD_20261030_BORRAR_BORRADORES_REH_REG_003_POST_CAPACITACION.sql
--
-- Decision del usuario (2026-10-30): la Fase 7 abre un REH-REG-003 INICIAL
-- nuevo por puesto; los borradores POST_CAPACITACION creados el 2026-09-30
-- (SCRIPT_PROD_20260930_BORRADORES_COMPETENCIA_LISTADO.sql, 31 pares
-- colaborador-puesto de Hematologia, Quimica Clinica, Uroanalisis e
-- Inmunologia Especial) se eliminan para no tener dos evaluaciones del mismo
-- puesto.
--
-- Un borrador sin firmas no es evidencia. Solo se borran evaluaciones:
--   * evaluation_type = 'POST_CAPACITACION' y status = 'DRAFT'
--   * sin firmas, sin cuestionario de conocimiento, sin documento ni constancia
-- Antes de borrar se respaldan en rh_competency_eval_backup_20261030 (+ items
-- y acciones) y se registra la auditoria RH_COMPETENCY_EVALUATION_DELETED:<id>.
-- Nota: la #49 (Beatriz Izquierdo, RIES) trae 1 item con calificacion copiada
-- de la plantilla al crearla (sin captura posterior); se respalda igual.
--
-- Idempotente. Correr en pgAdmin (o psql -v ON_ERROR_STOP=1 -f).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE target_evaluations ON COMMIT DROP AS
SELECT ce.id
  FROM public.rh_competency_evaluations ce
 WHERE ce.evaluation_type = 'POST_CAPACITACION'
   AND ce.status = 'DRAFT'
   AND ce.collaborator_signature_path IS NULL AND ce.evaluator_signature_path IS NULL
   AND ce.area_signature_path IS NULL AND ce.rh_signature_path IS NULL AND ce.director_signature_path IS NULL
   AND ce.knowledge_assignment_id IS NULL
   AND ce.document_id IS NULL AND ce.certificate_document_id IS NULL;

CREATE TABLE IF NOT EXISTS public.rh_competency_eval_backup_20261030 AS
SELECT ce.*, NOW() AS backed_up_at FROM public.rh_competency_evaluations ce WHERE FALSE;
CREATE TABLE IF NOT EXISTS public.rh_competency_eval_items_backup_20261030 AS
SELECT i.* FROM public.rh_competency_evaluation_items i WHERE FALSE;
CREATE TABLE IF NOT EXISTS public.rh_competency_eval_actions_backup_20261030 AS
SELECT a.* FROM public.rh_competency_evaluation_actions a WHERE FALSE;

INSERT INTO public.rh_competency_eval_backup_20261030
SELECT ce.*, NOW() FROM public.rh_competency_evaluations ce JOIN target_evaluations t ON t.id = ce.id;
INSERT INTO public.rh_competency_eval_items_backup_20261030
SELECT i.* FROM public.rh_competency_evaluation_items i JOIN target_evaluations t ON t.id = i.evaluation_id;
INSERT INTO public.rh_competency_eval_actions_backup_20261030
SELECT a.* FROM public.rh_competency_evaluation_actions a JOIN target_evaluations t ON t.id = a.evaluation_id;

INSERT INTO public.access_logs (user_id, action, module_code, entity_type, entity_id, employee_id, metadata)
SELECT (SELECT id FROM public.users WHERE email = 'admin@unilabor.mx' LIMIT 1),
       'RH_COMPETENCY_EVALUATION_DELETED:' || ce.id, 'RH', 'competency_evaluation', ce.id, ce.employee_id,
       jsonb_build_object('motivo', 'Borrador POST_CAPACITACION sustituido por el REH-REG-003 INICIAL de la Fase 7 (decision 2026-10-30)',
                          'position_id', ce.position_id, 'respaldo', 'rh_competency_eval_backup_20261030')
  FROM public.rh_competency_evaluations ce JOIN target_evaluations t ON t.id = ce.id;

-- Items y acciones se van por ON DELETE CASCADE.
DELETE FROM public.rh_competency_evaluations ce USING target_evaluations t WHERE ce.id = t.id;

COMMIT;

-- Verificacion
SELECT (SELECT count(*) FROM public.rh_competency_eval_backup_20261030) AS respaldadas,
       (SELECT count(*) FROM public.rh_competency_eval_items_backup_20261030) AS items_respaldados,
       (SELECT count(*) FROM public.rh_competency_evaluations WHERE evaluation_type = 'POST_CAPACITACION' AND status = 'DRAFT') AS post_capacitacion_draft_restantes;
