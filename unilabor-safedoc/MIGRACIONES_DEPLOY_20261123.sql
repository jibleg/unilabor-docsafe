-- MIGRACIONES_DEPLOY_20261123.sql - Listado de personal autorizado REH-REG-026 (catalogos de niveles organizacionales y de autorizacion) + pendientes del 19-nov (permiso ADMIN.USER_CATEGORIES.ASSIGN y tipo de documento Registro de temperatura). Aplicar por pgAdmin en xlab-extended (BD de DocSafe) ANTES de reiniciar el backend nuevo. Requiere MIGRACIONES_DEPLOY_20261109 ya aplicado. Aditivo e idempotente; compatible con PostgreSQL 10.
-- ============ 20261119_01_admin_user_categories_assign.sql ============
-- =============================================================================
-- Administracion - Permiso propio para asignar categorias de Calidad a usuarios.
--
-- Hasta ahora PUT /api/users/:id/categories exigia ADMIN.USERS.MANAGE, que solo
-- otorga ADMIN_SUPERUSER. El rol QUALITY_ADMIN ve /admin/users (ADMIN.USERS.READ)
-- pero no podia guardar las categorias. Este permiso separa esa capacidad sin
-- abrir alta/edicion/baja de usuarios ni el reseteo de contrasenas.
--
-- La accion es ASSIGN (no MANAGE/WRITE) a proposito: asi el rol efectivo
-- derivado del modulo ADMIN no cambia para quien solo recibe este permiso.
--
-- 100 % aditivo e idempotente: 1 permiso, concedido a ADMIN_SUPERUSER y
-- QUALITY_ADMIN.
-- =============================================================================
BEGIN;

INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES
    ('ADMIN.USER_CATEGORIES.ASSIGN', 'Asignar categorias de Calidad a los usuarios, sin editar sus datos ni su rol')
) AS src(code, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('ADMIN_SUPERUSER', 'ADMIN.USER_CATEGORIES.ASSIGN'),
    ('QUALITY_ADMIN',   'ADMIN.USER_CATEGORIES.ASSIGN')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261119_01_admin_user_categories_assign.sql', 'eb9f837d13787a1c02e80fcfe0fe151a218cce29769583e4e2eb3af5623fad93') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261119_02_helpdesk_document_kind_temperature_log.sql ============
-- =============================================================================
-- Gestion de Activos - Nuevo tipo de documento del expediente: Registro de
-- temperatura.
--
-- Solo agrega una fila al catalogo helpdesk_document_kinds (el dropdown "Tipo
-- de documento" del expediente del activo). Aditivo e idempotente.
-- =============================================================================
BEGIN;

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT 'TEMPERATURE_LOG', 'Registro de temperatura', 'Bitacora o registro de temperatura del equipo.', 140
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_document_kinds WHERE UPPER(code) = 'TEMPERATURE_LOG');

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261119_02_helpdesk_document_kind_temperature_log.sql', '5185a72956ae70983f3912f3c7f73e897de48b27ed473d1f6efd1361d7356cb8') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261123_01_rh_authorized_personnel.sql ============
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
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261123_01_rh_authorized_personnel.sql', '78e512bc44f979a779c1325ac696b5698b92ace815b990d856e985abd0f8223a') ON CONFLICT (filename) DO NOTHING;
