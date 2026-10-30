-- =============================================================================
-- SCRIPT_PROD_20261030_CONSTANCIA_F6_FIRMA_RH.sql
--
-- Constancia de la Fase 6 (una por puesto acreditado): tres firmas
--   1. Coordinacion de Recursos Humanos: TLC. Ursula Guadalupe Mendez Cuevas
--      (firma de la plantilla de constancia del curso del puesto).
--   2. Supervisor / Auditor y 3. Responsable del Area: salen de la lista
--      ANA-REG-060 final que acredito el puesto (codigo, no plantilla).
--
-- Este script solo ajusta nombre y cargo de la firma de RH en las plantillas
-- de constancia de los cursos de la Fase 6 (conserva la imagen de la firma).
-- No toca las plantillas de las demas fases. Idempotente.
-- Correr en pgAdmin (o psql -v ON_ERROR_STOP=1 -f).
-- =============================================================================

BEGIN;

UPDATE public.certificate_template_signatures s
   SET signatory_name = 'TLC. Ursula Guadalupe Méndez Cuevas',
       role = 'Coordinación de Recursos Humanos'
  FROM public.certificate_templates ct
 WHERE s.certificate_template_id = ct.id
   AND (s.role ILIKE '%recursos humanos%' OR s.signatory_name ILIKE '%ursula%')
   AND ct.training_course_id IN (
         SELECT pp.training_course_id
           FROM public.rh_induction_phase_positions pp
           JOIN public.rh_induction_phases p ON p.id = pp.phase_id AND p.phase_number = 6
         UNION
         SELECT p.training_course_id FROM public.rh_induction_phases p WHERE p.phase_number = 6 AND p.training_course_id IS NOT NULL
       );

COMMIT;

-- Verificacion: firmas de RH en las plantillas de la Fase 6.
SELECT s.signatory_name, s.role, count(*) AS plantillas, count(*) FILTER (WHERE s.signature_image_path IS NOT NULL) AS con_imagen
  FROM public.certificate_template_signatures s
  JOIN public.certificate_templates ct ON ct.id = s.certificate_template_id
  JOIN public.rh_induction_phase_positions pp ON pp.training_course_id = ct.training_course_id
  JOIN public.rh_induction_phases p ON p.id = pp.phase_id AND p.phase_number = 6
 GROUP BY 1, 2
 ORDER BY 1;
