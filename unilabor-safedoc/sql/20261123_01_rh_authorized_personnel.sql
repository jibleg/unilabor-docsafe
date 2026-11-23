-- =============================================================================
-- RH - Listado de personal autorizado (REH-REG-026).
--
-- El listado se arma solo a partir de SafeDoc: una fila por colaborador y
-- puesto activo, con la competencia y la autorizacion de su ultimo REH-REG-003
-- cerrado (Fase 7 / reevaluacion). Aqui solo se agregan los dos datos que el
-- formato pide y el sistema no tenia:
--
--   * rh_organizational_levels                 catalogo de niveles
--                                              organizacionales (G / S / O).
--   * rh_positions.organizational_level_id     nivel del puesto. Todos los
--                                              puestos existentes quedan en
--                                              OPERATIVO; RH ajusta despues.
--   * rh_authorization_levels                  catalogo de niveles de
--                                              autorizacion (1 a 4).
--   * rh_competency_evaluations
--       .authorization_level_id                nivel elegido al autorizar el
--                                              REH-REG-003 de cada puesto (con
--                                              lo que concluye su Fase 7).
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Niveles organizacionales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_organizational_levels (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_organizational_levels_code
  ON public.rh_organizational_levels (UPPER(code));

INSERT INTO public.rh_organizational_levels (code, name, description, sort_order)
SELECT src.code, src.name, src.description, src.sort_order
FROM (
  VALUES
    ('G', 'GERENCIAL',
     'Personal con autoridad para definir estrategias, políticas y objetivos institucionales.', 1),
    ('S', 'SUPERVISIÓN',
     'Personal responsable de coordinar, supervisar, evaluar y asegurar el cumplimiento de actividades y procesos.', 2),
    ('O', 'OPERATIVO',
     'Personal encargado de ejecutar las actividades técnicas, administrativas y de apoyo conforme a procedimientos establecidos.', 3)
) AS src(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_organizational_levels l WHERE UPPER(l.code) = UPPER(src.code)
);

ALTER TABLE public.rh_positions
  ADD COLUMN IF NOT EXISTS organizational_level_id BIGINT NULL
    REFERENCES public.rh_organizational_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_positions_organizational_level
  ON public.rh_positions (organizational_level_id);

-- Punto de partida: todos los puestos en OPERATIVO (solo los que no tienen nivel).
UPDATE public.rh_positions p
   SET organizational_level_id = l.id
  FROM public.rh_organizational_levels l
 WHERE UPPER(l.code) = 'O' AND p.organizational_level_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Niveles de autorizacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_authorization_levels (
  id BIGSERIAL PRIMARY KEY,
  level_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_authorization_levels_level_no CHECK (level_no > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_authorization_levels_level_no
  ON public.rh_authorization_levels (level_no);

INSERT INTO public.rh_authorization_levels (level_no, name, description)
SELECT src.level_no, src.name, src.description
FROM (
  VALUES
    (1, 'Apoyo', 'Trabaja bajo supervisión directa. No valida ni libera resultados.'),
    (2, 'Operación', 'Ejecuta el procedimiento de forma independiente. No valida resultados.'),
    (3, 'Validación', 'Valida resultados técnicos del área.'),
    (4, 'Liberación', 'Libera y firma informes. Requiere ser responsable de disciplina autorizado por la ema.')
) AS src(level_no, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_authorization_levels l WHERE l.level_no = src.level_no
);

ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS authorization_level_id BIGINT NULL
    REFERENCES public.rh_authorization_levels(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.rh_competency_evaluations.authorization_level_id IS
  'Nivel de autorizacion (REH-REG-026) elegido al autorizar el REH-REG-003 de este puesto.';

COMMIT;
