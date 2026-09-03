-- Publicacion explicita de la fase de Induccion ("Publicar fase").
--
-- Antes, inscribir a un colaborador asignaba de inmediato las lecturas en Sala
-- de Lectura aunque el cuestionario siguiera en borrador. Ahora la fase tiene
-- su propio interruptor: mientras published_at sea NULL, las inscripciones se
-- crean SIN lecturas y las ya asignadas no se muestran al colaborador; al
-- publicar (requiere documentos + cuestionario publicado) se asignan las
-- lecturas a todos los inscritos y desde ahi corre su limite de lectura.
--
-- Sin backfill a proposito: las fases arrancan en borrador y RH decide cuando
-- publicarlas (las lecturas ya asignadas en prod se conservan y reaparecen al
-- publicar).
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS published_by_user_id uuid NULL;
