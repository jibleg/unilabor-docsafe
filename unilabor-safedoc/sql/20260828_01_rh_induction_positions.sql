-- =============================================================================
-- RH - Induccion por puesto (ISO 15189:2022 6.2): Bloque 0, catalogo de puestos
--
-- Base para el modulo de induccion (7 fases, REH-MAN-002): catalogo minimo de
-- puesto/categoria (nombre + documentos obligatorios + competencias tecnicas,
-- SIN replicar la ficha completa de REH-MAN-001) y la relacion real
-- colaborador<->puesto, que es M:N (un colaborador puede tener 2+ puestos
-- activos a la vez). `employees.position` (texto libre) NO se toca: sigue
-- mostrandose donde ya se muestra, solo deja de ser el insumo de induccion.
--
-- 100% ADITIVA: 4 tablas nuevas + 1 columna NULL-able en `documents` + 2
-- permisos + otorgamiento a roles RH existentes. No modifica ninguna tabla
-- existente salvo el ADD COLUMN aditivo.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de puestos/categorias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_positions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_positions_code
  ON public.rh_positions (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_rh_positions_active
  ON public.rh_positions (is_active);

-- ---------------------------------------------------------------------------
-- 2. Competencias tecnicas del puesto (alimenta la seleccion aleatoria de
--    Fase 7 / REH-REG-003, columna COMPETENCIA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_position_competencies (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  competency_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_position_competencies_position
  ON public.rh_position_competencies (position_id);

-- ---------------------------------------------------------------------------
-- 3. Documentos obligatorios del puesto (Fase 5: "los documentos de la
--    categoria son los documentos del puesto que debe si o si leer")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_position_documents (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_position_documents
  ON public.rh_position_documents (position_id, document_id);

-- ---------------------------------------------------------------------------
-- 4. Colaborador <-> puesto (M:N real, decision confirmada por el usuario)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_employee_positions (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ended_at TIMESTAMPTZ NULL,
  assigned_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_employee_positions_ended
    CHECK (is_active OR ended_at IS NOT NULL)
);

-- A lo sumo un puesto ACTIVO por (colaborador, puesto) — evita duplicar el
-- mismo puesto dos veces vigente, sin impedir que se reasigne tras terminarlo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_employee_positions_active
  ON public.rh_employee_positions (employee_id, position_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_rh_employee_positions_employee
  ON public.rh_employee_positions (employee_id);

CREATE INDEX IF NOT EXISTS idx_rh_employee_positions_position
  ON public.rh_employee_positions (position_id);

-- ---------------------------------------------------------------------------
-- 5. Codigo de documento SGC (ej. "REH-INS-001"), columna NULL-able en
--    `documents`. Sin unicidad forzada: versiones historicas superseded
--    podrian compartir codigo con la vigente. Se etiqueta manualmente desde
--    la UI de Calidad al implementar (sin importador automatico).
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_code
  ON public.documents (UPPER(code))
  WHERE code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. RBAC
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT
  src.code,
  m.id,
  split_part(src.code, '.', 2),
  split_part(src.code, '.', 3),
  src.description
FROM (
  VALUES
    ('RH.INDUCTION.MANAGE', 'RH',
     'Administrar puestos, competencias, documentos por puesto e inducciones de colaboradores'),
    ('RH.SELF.INDUCTION',   'RH',
     'Ver mi propio progreso de induccion por puesto')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('RH_VIEWER', 'RH.SELF.INDUCTION'),
    ('RH_EDITOR', 'RH.INDUCTION.MANAGE'),
    ('RH_EDITOR', 'RH.SELF.INDUCTION'),
    ('RH_ADMIN',  'RH.INDUCTION.MANAGE'),
    ('RH_ADMIN',  'RH.SELF.INDUCTION')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_positions'), to_regclass('public.rh_position_competencies'),
--          to_regclass('public.rh_position_documents'), to_regclass('public.rh_employee_positions');
--   SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name='code';
--   SELECT code FROM public.permissions WHERE code LIKE 'RH.INDUCTION%' OR code = 'RH.SELF.INDUCTION';
-- =============================================================================
