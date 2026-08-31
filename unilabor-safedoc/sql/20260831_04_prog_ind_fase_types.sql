-- =============================================================================
-- RH - Tipos documentales por fase de Induccion en la seccion PROG_IND
--
-- Las constancias de cada fase de Induccion se archivan en el expediente del
-- colaborador dentro de la seccion "Programa de Induccion" (PROG_IND), un tipo
-- documental por fase (IND_FASE_1..7), en orden de fase y con el nombre de la
-- fase — en vez del tipo generico COURSE_CERTIFICATE de la seccion Constancias
-- (que sigue usandose para las capacitaciones normales).
--
-- En prod la seccion PROG_IND ya existe (creada por RH desde la UI) junto con
-- un tipo placeholder BI_INST ("Fase 1 - Bienvenida...") sin documentos: se
-- renombra a IND_FASE_1 (conserva su id, no hay filas que lo referencien) para
-- no duplicar "Fase 1". En una BD sin esa seccion, se crea todo desde cero.
--
-- is_required = FALSE en los tipos sembrados: son constancias auto-generadas
-- al acreditar la fase, no cargas obligatorias — marcarlos requeridos haria
-- que el sistema de alertas de expediente los reclamara a todo colaborador.
-- =============================================================================
BEGIN;

-- 1. Seccion PROG_IND (idempotente; en prod ya existe).
INSERT INTO public.document_sections (code, name, description, is_active, sort_order)
SELECT 'PROG_IND', 'Programa de Inducción',
       'Constancias y formatos del programa de induccion por fases (ISO 15189:2022 6.2).',
       TRUE, 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_sections WHERE UPPER(code) = 'PROG_IND'
);

-- 2. El placeholder BI_INST creado a mano en prod ES la Fase 1: se renombra a
--    IND_FASE_1 (mismo id, cero documentos lo usan) para no sembrar un duplicado.
UPDATE public.document_types
   SET code = 'IND_FASE_1', is_required = FALSE, updated_at = NOW()
 WHERE UPPER(code) = 'BI_INST'
   AND section_id = (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND')
   AND NOT EXISTS (SELECT 1 FROM public.document_types WHERE UPPER(code) = 'IND_FASE_1');

-- 3. Un tipo por fase (nombre y orden tomados del catalogo rh_induction_phases).
--    sort_order = 10 * numero de fase, para que FORMA_INDUCC (sort 1) siga primero
--    y las fases queden en orden 1..7 entre si.
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT
  s.id,
  'IND_FASE_' || p.phase_number,
  'Fase ' || p.phase_number || ' - ' || p.name,
  'Constancia de aprobacion de la fase ' || p.phase_number || ' del programa de induccion (generada automaticamente).',
  FALSE, FALSE, FALSE, TRUE,
  10 * p.phase_number
FROM public.rh_induction_phases p
CROSS JOIN (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types dt WHERE UPPER(dt.code) = 'IND_FASE_' || p.phase_number
);

-- 4. Normaliza nombre/orden del tipo de Fase 1 renombrado en el paso 2 (quedo
--    con el nombre manual de RH y sort 2).
UPDATE public.document_types dt
   SET name = 'Fase ' || p.phase_number || ' - ' || p.name,
       sort_order = 10 * p.phase_number,
       updated_at = NOW()
  FROM public.rh_induction_phases p
 WHERE UPPER(dt.code) = 'IND_FASE_' || p.phase_number
   AND (dt.name <> 'Fase ' || p.phase_number || ' - ' || p.name OR dt.sort_order <> 10 * p.phase_number);

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT dt.code, dt.name, dt.sort_order, dt.is_required
--     FROM public.document_types dt
--     JOIN public.document_sections s ON s.id = dt.section_id
--    WHERE UPPER(s.code) = 'PROG_IND' ORDER BY dt.sort_order;
-- =============================================================================
