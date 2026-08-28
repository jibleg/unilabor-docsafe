-- =============================================================================
-- RH - Induccion por puesto: Formato de Induccion consolidado (REH-REG-005)
--
-- Agrega, sobre lo ya construido en Bloque 1 (Fases 1-4), las 3 piezas que la
-- hoja INDUCCION de REH-REG-005 pide y que todavia no existian: checklist de
-- contenidos por fase, columna SUPERVISOR por inscripcion, y el bloque de
-- EFICACIA DEL PROGRAMA DE INDUCCION que la ema exige y el manual REH-MAN-002
-- no contempla. El reporte consolidado en si (que agrega esto + lo que ya
-- calculan getEmployeeInductionProgress/listPhaseEnrollments) vive en codigo,
-- no en SQL.
--
-- 100% ADITIVA: 2 tablas nuevas + 1 columna nueva en rh_induction_enrollments.
-- No modifica ninguna otra tabla existente.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de contenidos por fase ("CONTENIDO DE CADA FASE, marque conforme
--    se imparta" - hoja INDUCCION filas 35-78 de REH-REG-005). Se siembra
--    exacto para las Fases 1-4 (las unicas construidas hoy); editable despues
--    por RH, mismo patron que rh_induction_phase_documents.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_phase_checklist_items (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_induction_checklist_items_phase
  ON public.rh_induction_phase_checklist_items (phase_id);

-- ---------------------------------------------------------------------------
-- 2. Progreso del checklist por inscripcion (quien lo marco y cuando).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_checklist_progress (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES public.rh_induction_enrollments(id) ON DELETE CASCADE,
  checklist_item_id BIGINT NOT NULL REFERENCES public.rh_induction_phase_checklist_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_checklist_progress
  ON public.rh_induction_checklist_progress (enrollment_id, checklist_item_id);

-- ---------------------------------------------------------------------------
-- 3. Columna SUPERVISOR de la tabla de 7 fases (la ema exige "personal en
--    induccion supervisado en todo momento"; el manual solo lo preveia en
--    Fases 5-6). Campo libre, no obligatorio.
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS supervisor_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. EFICACIA DEL PROGRAMA DE INDUCCION (hoja INDUCCION filas 101-110). La ema
--    la exige expresamente y el manual no la tiene; RH la captura cuando
--    corresponde (no hay gate automatico todavia, Fase 7 no existe).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_effectiveness_reviews (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  method TEXT NOT NULL,
  result_percentage NUMERIC(5, 2) NULL,
  performs_as_expected BOOLEAN NULL,
  evidence_notes TEXT NULL,
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_induction_effectiveness_employee
  ON public.rh_induction_effectiveness_reviews (employee_id);

-- ---------------------------------------------------------------------------
-- 5. Siembra del checklist de contenidos, exacto de la hoja INDUCCION.
-- ---------------------------------------------------------------------------
INSERT INTO public.rh_induction_phase_checklist_items (phase_id, item_text, sort_order)
SELECT p.id, src.item_text, src.sort_order
FROM public.rh_induction_phases p
INNER JOIN (
  VALUES
    (1, 'Recepción del colaborador', 1),
    (1, 'Alta en reloj biométrico', 2),
    (1, 'Bienvenida formal', 3),
    (1, 'Presentación del jefe inmediato', 4),
    (1, 'Presentación del equipo de trabajo', 5),
    (1, 'Entrega de documentos internos', 6),
    (1, 'Recorrido por instalaciones', 7),
    (1, 'Organigrama y líneas de autoridad', 8),
    (1, 'Normas internas y disciplinarias', 9),
    (1, 'Código de vestimenta', 10),
    (1, 'Confidencialidad y aviso de privacidad', 11),
    (2, 'Historia de UNILABOR®', 1),
    (2, 'Misión, visión y valores', 2),
    (2, 'Política de calidad', 3),
    (2, 'Objetivos de calidad', 4),
    (2, 'Introducción a la ISO 15189:2022', 5),
    (2, 'Mapa de procesos', 6),
    (2, 'Indicadores de calidad', 7),
    (2, 'Control de documentos', 8),
    (2, 'Control de registros', 9),
    (2, 'Gestión de riesgos', 10),
    (2, 'Trabajo no conforme', 11),
    (3, 'Identificación de riesgos', 1),
    (3, 'Uso de equipo de protección personal (EPP)', 2),
    (3, 'Higiene y control de infecciones', 3),
    (3, 'Manejo de residuos peligrosos biológico-infecciosos (RPBI)', 4),
    (3, 'Servicios de salud laboral, manejo de accidentes y emergencias', 5),
    (4, 'Acceso al sistema LIS', 1),
    (4, 'Seguridad informática', 2),
    (4, 'Registro de pacientes', 3),
    (4, 'Gestión del proceso analítico', 4),
    (4, 'Validación y liberación de resultados', 5),
    (4, 'Control de calidad en el sistema', 6),
    (4, 'Gestión documental y reportes', 7),
    (4, 'Continuidad operativa', 8),
    (4, 'Inducción básica al módulo de almacén (inventarios)', 9)
) AS src(phase_number, item_text, sort_order) ON src.phase_number = p.phase_number
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_induction_phase_checklist_items existing
   WHERE existing.phase_id = p.id AND existing.item_text = src.item_text
);

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT p.phase_number, COUNT(*) FROM public.rh_induction_phase_checklist_items c
--     INNER JOIN public.rh_induction_phases p ON p.id = c.phase_id
--    GROUP BY p.phase_number ORDER BY p.phase_number;
--   -- Esperado: 1=11, 2=11, 3=5, 4=9
--   SELECT to_regclass('public.rh_induction_checklist_progress'),
--          to_regclass('public.rh_induction_effectiveness_reviews');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'rh_induction_enrollments' AND column_name = 'supervisor_employee_id';
-- =============================================================================
