-- MIGRACIONES_DEPLOY_20261123_03.sql
-- Aplicar en xlab-extended (BD de DocSafe) antes de subir el build. Incluye:
--   20261123_03_rh_performance_criteria_defaults.sql
-- Aditiva e idempotente; registra la migracion en schema_migrations. PostgreSQL 10.

-- =============================================================================
-- RH - Criterios de desempeno (REH-REG-003, seccion 2): observacion por defecto
--
-- Cada criterio guarda un texto de observacion predeterminado que se precarga en
-- Observaciones / evidencia al crear una evaluacion (la calificacion NO se
-- precarga: la pone el evaluador). Se cargan los textos y la criticidad que RH
-- definio el 23-nov-2026 (tomados de la evaluacion modelo de Custodio).
-- Aditiva e idempotente: los textos solo se ponen donde no hay uno; la
-- criticidad se alinea una vez (repetirla deja lo mismo). PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_performance_criteria
  ADD COLUMN IF NOT EXISTS default_observations TEXT NULL;

COMMENT ON COLUMN public.rh_performance_criteria.default_observations IS
  'Texto que se precarga en Observaciones / evidencia del criterio al crear una evaluacion REH-REG-003.';

UPDATE public.rh_performance_criteria c
   SET criticality = src.criticality,
       default_observations = COALESCE(c.default_observations, src.default_observations)
  FROM (
    VALUES
      ('Puntualidad y asistencia',    'M', 'Cumple con su jornada de trabajo'),
      ('Trabajo en equipo',           'M', 'colabora con sus compañeros del área en la atención y dudas que pueden surgir durante su jornada'),
      ('Cumplimiento de actividades', 'A', 'termina todas sus tareas asignadas y verifica que no queden pendientes y/o notifica sobre alguna situación en especial'),
      ('Confidencialidad',            'A', 'maneja la información de los pacientes de manera confidencial'),
      ('Responsabilidad',             'M', 'termina todas sus tareas asignadas y verifica que no queden pendientes y/o notifica sobre alguna situación en especial'),
      ('Actitud de servicio',         'A', 'orienta al paciente de manera eficaz y cuando requiere algún apoyo para el paciente lo solicita'),
      ('Apego a procesos',            'A', 'cumple con lo establecido en los procedimientos asignados a su área')
  ) AS src(criterion_text, criticality, default_observations)
 WHERE c.criterion_text = src.criterion_text
   AND (c.criticality IS DISTINCT FROM src.criticality OR c.default_observations IS NULL);

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261123_03_rh_performance_criteria_defaults.sql', '9852af03cb7a931e84f153de86e68cf0ff0b7d575abe7c1cebda0cb1e2c9c456') ON CONFLICT (filename) DO NOTHING;
