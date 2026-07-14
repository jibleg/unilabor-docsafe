-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-07-14 (RBAC)
-- Roles, permisos por accion (RBAC), asignacion usuario<->roles (M:N) y
-- descripciones de permisos en espanol.
-- ============================================================================
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate):
--   cada migracion se aplica y se registra en public.schema_migrations con SU
--   checksum SHA-256, de modo que un migrate/migrate:status posterior las vea
--   YA aplicadas.
-- Ambas son IDEMPOTENTES (IF NOT EXISTS / WHERE NOT EXISTS / ON CONFLICT /
--   UPDATE por codigo): correr el script dos veces no rompe nada.
-- Orden de aplicacion (respetar): 01 luego 02.
-- ============================================================================

-- Tabla de control (en prod ya existe; se crea por seguridad).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- [1/2] 20260714_01_rbac_roles_permissions.sql
-- SHA-256: 6bece79d1df451168a003092d04e68c292632cb523302d083171e58e6a5868df
-- ----------------------------------------------------------------------------
-- =============================================================================
-- RBAC Fase 0 - Modelo de roles, permisos y asignaciones (usuario <-> roles M:N)
-- =============================================================================
-- Crea el catalogo de roles/permisos por accion y migra el modelo actual
-- (user_module_roles: 1 rol por modulo) a roles de sistema, SIN pérdida de
-- acceso el dia 1. No modifica el enforcement de la app: las tablas nuevas aun
-- no se leen en runtime (eso llega en Fase 1). Idempotente: se puede re-ejecutar.
--
-- Decisiones aplicadas:
--   1. Auditoria cerrada a permiso propio (ADMIN.AUDIT.READ).
--   2. Administracion de usuarios/roles promovida a modulo propio "ADMIN".
--   3. DELETE separado de WRITE solo donde hoy ya es admin-only (activos).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Modulo "Administracion" (para agrupar usuarios/roles/auditoria)
-- ---------------------------------------------------------------------------
INSERT INTO public.modules (code, name, description, icon, is_active, sort_order)
SELECT source.code, source.name, source.description, source.icon, source.is_active, source.sort_order
FROM (
  VALUES
    (
      'ADMIN',
      'Administración',
      'Modulo para administracion del sistema: usuarios, roles, permisos y auditoria.',
      'settings',
      TRUE,
      90
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.modules existing WHERE UPPER(existing.code) = source.code
);

-- ---------------------------------------------------------------------------
-- 2. Tablas RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  module_id BIGINT NULL REFERENCES public.modules(id) ON DELETE SET NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_code ON public.roles (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_roles_is_active ON public.roles (is_active);
CREATE INDEX IF NOT EXISTS idx_roles_module_id ON public.roles (module_id);

CREATE TABLE IF NOT EXISTS public.permissions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  module_id BIGINT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_permissions_code ON public.permissions (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_permissions_module_id ON public.permissions (module_id);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id BIGINT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
  ON public.role_permissions (permission_id);

-- user_roles: user_id hereda el tipo real de users.id (patron del repo)
DO $$
DECLARE
  user_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO user_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF user_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar users.id para crear user_roles';
  END IF;

  IF to_regclass('public.user_roles') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.user_roles (
         id BIGSERIAL PRIMARY KEY,
         user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
         role_id BIGINT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
         is_active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );',
      user_id_type
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role
  ON public.user_roles (user_id, role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON public.user_roles (is_active);

-- ---------------------------------------------------------------------------
-- 3. Seed de permisos (accion granular). module_id resuelto por codigo.
--    resource/action derivados del codigo (MODULO.RECURSO.ACCION).
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
    -- QUALITY
    ('QUALITY.DOCUMENTS.READ',    'QUALITY', 'Ver documentos y estadisticas de calidad'),
    ('QUALITY.DOCUMENTS.WRITE',   'QUALITY', 'Subir, editar, cambiar estado y eliminar documentos'),
    ('QUALITY.CATEGORIES.READ',   'QUALITY', 'Ver categorias documentales'),
    ('QUALITY.CATEGORIES.WRITE',  'QUALITY', 'Crear, editar y eliminar categorias'),
    -- RH
    ('RH.EMPLOYEES.READ',         'RH', 'Ver y exportar empleados'),
    ('RH.EMPLOYEES.WRITE',        'RH', 'Crear, editar y eliminar empleados'),
    ('RH.EMPLOYEE_DOCS.READ',     'RH', 'Ver expediente documental de empleados'),
    ('RH.EMPLOYEE_DOCS.WRITE',    'RH', 'Subir y gestionar documentos de empleados'),
    ('RH.DOC_STRUCTURE.MANAGE',   'RH', 'Gestionar secciones y tipos de documento'),
    ('RH.ALERTS.READ',            'RH', 'Ver alertas de RH'),
    ('RH.TRAINING.MANAGE',        'RH', 'Gestionar cursos, plantillas de evaluacion, certificados y asignaciones'),
    ('RH.EVAL_GRADING.READ',      'RH', 'Ver cola de calificacion, tablero y reportes de evaluacion'),
    ('RH.EVAL_GRADING.WRITE',     'RH', 'Calificar evaluaciones y autorizar tardias'),
    ('RH.SELF.EXPEDIENT',         'RH', 'Ver y subir documentos del expediente propio'),
    ('RH.SELF.EVALUATIONS',       'RH', 'Presentar evaluaciones propias'),
    -- HELPDESK (Gestion de Activos)
    ('HELPDESK.DASHBOARD.READ',   'HELPDESK', 'Ver resumen y tablero'),
    ('HELPDESK.ASSETS.READ',      'HELPDESK', 'Ver activos, expediente, componentes y documentos'),
    ('HELPDESK.ASSETS.WRITE',     'HELPDESK', 'Crear/editar activos, revisar, componentes, eventos y documentos'),
    ('HELPDESK.ASSETS.DELETE',    'HELPDESK', 'Eliminar activos'),
    ('HELPDESK.TICKETS.READ',     'HELPDESK', 'Ver tickets de soporte'),
    ('HELPDESK.TICKETS.WRITE',    'HELPDESK', 'Gestionar tickets: crear, resolver, riesgo ISO, liberacion tecnica'),
    ('HELPDESK.HANDOVERS.READ',   'HELPDESK', 'Ver actas de entrega-recepcion'),
    ('HELPDESK.HANDOVERS.WRITE',  'HELPDESK', 'Crear, firmar, anular y eliminar actas'),
    ('HELPDESK.MOVEMENTS.READ',   'HELPDESK', 'Ver movimientos de activos'),
    ('HELPDESK.MOVEMENTS.WRITE',  'HELPDESK', 'Registrar movimientos de activos'),
    ('HELPDESK.MAINTENANCE.READ', 'HELPDESK', 'Ver planes y ordenes de mantenimiento'),
    ('HELPDESK.MAINTENANCE.WRITE','HELPDESK', 'Gestionar planes y ordenes de mantenimiento'),
    ('HELPDESK.CALIBRATION.READ', 'HELPDESK', 'Ver planes y ordenes de calibracion'),
    ('HELPDESK.CALIBRATION.WRITE','HELPDESK', 'Gestionar planes y ordenes de calibracion'),
    ('HELPDESK.ORG.READ',         'HELPDESK', 'Ver estructura organizacional (unidades/areas/responsables)'),
    ('HELPDESK.ORG.MANAGE',       'HELPDESK', 'Gestionar estructura organizacional'),
    ('HELPDESK.CATALOGS.READ',    'HELPDESK', 'Ver catalogos de activos, tickets, mantenimiento y calibracion'),
    ('HELPDESK.CATALOGS.MANAGE',  'HELPDESK', 'Administrar catalogos'),
    ('HELPDESK.SELF.TICKETS',     'HELPDESK', 'Crear y seguir tickets propios'),
    ('HELPDESK.SELF.ASSETS',      'HELPDESK', 'Ver activos propios asignados'),
    -- ADMIN (Administracion del sistema)
    ('ADMIN.USERS.READ',          'ADMIN', 'Ver usuarios y catalogo de modulos'),
    ('ADMIN.USERS.MANAGE',        'ADMIN', 'Crear, editar, eliminar usuarios y resetear contrasenas'),
    ('ADMIN.ROLES.MANAGE',        'ADMIN', 'Gestionar roles, permisos y asignaciones'),
    ('ADMIN.AUDIT.READ',          'ADMIN', 'Consultar la bitacora de auditoria')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 4. Seed de roles de sistema (3 por modulo + superusuario de administracion)
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT src.code, src.name, src.description, m.id, TRUE, TRUE
FROM (
  VALUES
    ('QUALITY_ADMIN',   'Calidad · Administrador', 'Acceso total al modulo de Calidad',       'QUALITY'),
    ('QUALITY_EDITOR',  'Calidad · Editor',        'Lectura y edicion en Calidad',            'QUALITY'),
    ('QUALITY_VIEWER',  'Calidad · Consulta',      'Solo lectura en Calidad',                 'QUALITY'),
    ('RH_ADMIN',        'RH · Administrador',      'Acceso total al modulo de RH',            'RH'),
    ('RH_EDITOR',       'RH · Editor',             'Lectura y edicion en RH',                 'RH'),
    ('RH_VIEWER',       'RH · Consulta',           'Autoservicio: expediente y evaluaciones propias', 'RH'),
    ('HELPDESK_ADMIN',  'Activos · Administrador', 'Acceso total a Gestion de Activos',       'HELPDESK'),
    ('HELPDESK_EDITOR', 'Activos · Editor',        'Lectura y edicion en Gestion de Activos', 'HELPDESK'),
    ('HELPDESK_VIEWER', 'Activos · Consulta',      'Consulta y autoservicio en Gestion de Activos', 'HELPDESK'),
    ('ADMIN_SUPERUSER', 'Administración del Sistema', 'Gestion de usuarios, roles, permisos y auditoria', 'ADMIN')
) AS src(code, name, description, module_code)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE UPPER(r.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 5. Seed de role_permissions (reproduce el comportamiento actual por rol)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    -- QUALITY
    ('QUALITY_VIEWER',  'QUALITY.DOCUMENTS.READ'),
    ('QUALITY_VIEWER',  'QUALITY.CATEGORIES.READ'),
    ('QUALITY_EDITOR',  'QUALITY.DOCUMENTS.READ'),
    ('QUALITY_EDITOR',  'QUALITY.DOCUMENTS.WRITE'),
    ('QUALITY_EDITOR',  'QUALITY.CATEGORIES.READ'),
    ('QUALITY_EDITOR',  'QUALITY.CATEGORIES.WRITE'),
    ('QUALITY_ADMIN',   'QUALITY.DOCUMENTS.READ'),
    ('QUALITY_ADMIN',   'QUALITY.DOCUMENTS.WRITE'),
    ('QUALITY_ADMIN',   'QUALITY.CATEGORIES.READ'),
    ('QUALITY_ADMIN',   'QUALITY.CATEGORIES.WRITE'),
    -- RH viewer (solo autoservicio)
    ('RH_VIEWER',       'RH.SELF.EXPEDIENT'),
    ('RH_VIEWER',       'RH.SELF.EVALUATIONS'),
    -- RH editor
    ('RH_EDITOR',       'RH.EMPLOYEES.READ'),
    ('RH_EDITOR',       'RH.EMPLOYEES.WRITE'),
    ('RH_EDITOR',       'RH.EMPLOYEE_DOCS.READ'),
    ('RH_EDITOR',       'RH.EMPLOYEE_DOCS.WRITE'),
    ('RH_EDITOR',       'RH.DOC_STRUCTURE.MANAGE'),
    ('RH_EDITOR',       'RH.ALERTS.READ'),
    ('RH_EDITOR',       'RH.TRAINING.MANAGE'),
    ('RH_EDITOR',       'RH.EVAL_GRADING.READ'),
    ('RH_EDITOR',       'RH.EVAL_GRADING.WRITE'),
    ('RH_EDITOR',       'RH.SELF.EXPEDIENT'),
    ('RH_EDITOR',       'RH.SELF.EVALUATIONS'),
    -- RH admin (mismo alcance que editor en RH)
    ('RH_ADMIN',        'RH.EMPLOYEES.READ'),
    ('RH_ADMIN',        'RH.EMPLOYEES.WRITE'),
    ('RH_ADMIN',        'RH.EMPLOYEE_DOCS.READ'),
    ('RH_ADMIN',        'RH.EMPLOYEE_DOCS.WRITE'),
    ('RH_ADMIN',        'RH.DOC_STRUCTURE.MANAGE'),
    ('RH_ADMIN',        'RH.ALERTS.READ'),
    ('RH_ADMIN',        'RH.TRAINING.MANAGE'),
    ('RH_ADMIN',        'RH.EVAL_GRADING.READ'),
    ('RH_ADMIN',        'RH.EVAL_GRADING.WRITE'),
    ('RH_ADMIN',        'RH.SELF.EXPEDIENT'),
    ('RH_ADMIN',        'RH.SELF.EVALUATIONS'),
    -- HELPDESK viewer
    ('HELPDESK_VIEWER', 'HELPDESK.DASHBOARD.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.ASSETS.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.MOVEMENTS.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.MAINTENANCE.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.CALIBRATION.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.ORG.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.CATALOGS.READ'),
    ('HELPDESK_VIEWER', 'HELPDESK.SELF.TICKETS'),
    ('HELPDESK_VIEWER', 'HELPDESK.SELF.ASSETS'),
    -- HELPDESK editor (viewer + escritura, sin admin-only)
    ('HELPDESK_EDITOR', 'HELPDESK.DASHBOARD.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.ASSETS.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.ASSETS.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.HANDOVERS.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.HANDOVERS.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.MOVEMENTS.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.MOVEMENTS.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.MAINTENANCE.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.MAINTENANCE.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.CALIBRATION.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.CALIBRATION.WRITE'),
    ('HELPDESK_EDITOR', 'HELPDESK.ORG.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.CATALOGS.READ'),
    ('HELPDESK_EDITOR', 'HELPDESK.SELF.TICKETS'),
    ('HELPDESK_EDITOR', 'HELPDESK.SELF.ASSETS'),
    -- HELPDESK admin (editor + admin-only: delete activos, org, catalogos)
    ('HELPDESK_ADMIN',  'HELPDESK.DASHBOARD.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.ASSETS.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.ASSETS.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.ASSETS.DELETE'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.HANDOVERS.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.HANDOVERS.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.MOVEMENTS.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.MOVEMENTS.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.MAINTENANCE.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.MAINTENANCE.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.CALIBRATION.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.CALIBRATION.WRITE'),
    ('HELPDESK_ADMIN',  'HELPDESK.ORG.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.ORG.MANAGE'),
    ('HELPDESK_ADMIN',  'HELPDESK.CATALOGS.READ'),
    ('HELPDESK_ADMIN',  'HELPDESK.CATALOGS.MANAGE'),
    ('HELPDESK_ADMIN',  'HELPDESK.SELF.TICKETS'),
    ('HELPDESK_ADMIN',  'HELPDESK.SELF.ASSETS'),
    -- Administracion del sistema
    ('ADMIN_SUPERUSER', 'ADMIN.USERS.READ'),
    ('ADMIN_SUPERUSER', 'ADMIN.USERS.MANAGE'),
    ('ADMIN_SUPERUSER', 'ADMIN.ROLES.MANAGE'),
    ('ADMIN_SUPERUSER', 'ADMIN.AUDIT.READ')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = UPPER(src.role_code)
INNER JOIN public.permissions p ON UPPER(p.code) = UPPER(src.permission_code)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Migracion de datos: user_module_roles -> user_roles (cero perdida)
--    Cada fila (usuario, modulo, rol) se mapea al rol de sistema equivalente
--    "{MODULO}_{ROL}" (ej. HELPDESK + EDITOR -> HELPDESK_EDITOR).
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT umr.user_id, r.id, TRUE
FROM public.user_module_roles umr
INNER JOIN public.modules m ON m.id = umr.module_id
INNER JOIN public.roles r
  ON UPPER(r.code) = UPPER(m.code) || '_' || UPPER(umr.role)
WHERE COALESCE(umr.is_active, TRUE) = TRUE
  AND UPPER(umr.role) IN ('ADMIN', 'EDITOR', 'VIEWER')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Los antiguos ADMIN de Calidad administraban usuarios: se les asigna ademas
-- el rol de Administracion del Sistema para no perder esa capacidad al
-- promover la gestion de usuarios/roles a su modulo propio.
INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT umr.user_id, r.id, TRUE
FROM public.user_module_roles umr
INNER JOIN public.modules m ON m.id = umr.module_id AND UPPER(m.code) = 'QUALITY'
INNER JOIN public.roles r ON UPPER(r.code) = 'ADMIN_SUPERUSER'
WHERE COALESCE(umr.is_active, TRUE) = TRUE
  AND UPPER(umr.role) = 'ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT code, name FROM public.roles ORDER BY code;
--   SELECT COUNT(*) FROM public.permissions;            -- esperado: 39
--   SELECT r.code, COUNT(*) FROM public.role_permissions rp
--     JOIN public.roles r ON r.id = rp.role_id GROUP BY r.code ORDER BY r.code;
--   SELECT u.email, r.code FROM public.user_roles ur
--     JOIN public.users u ON u.id = ur.user_id
--     JOIN public.roles r ON r.id = ur.role_id ORDER BY u.email, r.code;
-- =============================================================================

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260714_01_rbac_roles_permissions.sql', '6bece79d1df451168a003092d04e68c292632cb523302d083171e58e6a5868df')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [2/2] 20260714_02_rbac_permission_descriptions.sql
-- SHA-256: 86cc7d879bcb01e3c3ccbec92073c2a7c88ff7caddd60db67cbc6d15e7a9b5af
-- ----------------------------------------------------------------------------
-- =============================================================================
-- RBAC - Descripciones de permisos en espanol, mas claras (refina el seed de
-- 20260714_01). Idempotente: solo actualiza el texto por codigo de permiso.
-- =============================================================================
BEGIN;

UPDATE public.permissions AS p
SET description = v.description, updated_at = NOW()
FROM (
  VALUES
    -- QUALITY
    ('QUALITY.DOCUMENTS.READ',    'Consultar documentos de calidad, hacer busquedas y ver estadisticas'),
    ('QUALITY.DOCUMENTS.WRITE',   'Subir, editar, versionar, cambiar de estado y eliminar documentos de calidad'),
    ('QUALITY.CATEGORIES.READ',   'Consultar el catalogo de categorias documentales'),
    ('QUALITY.CATEGORIES.WRITE',  'Crear, editar y eliminar categorias documentales'),
    -- RH
    ('RH.EMPLOYEES.READ',         'Consultar y exportar el listado de colaboradores'),
    ('RH.EMPLOYEES.WRITE',        'Crear, editar y dar de baja colaboradores'),
    ('RH.EMPLOYEE_DOCS.READ',     'Consultar el expediente documental de los colaboradores'),
    ('RH.EMPLOYEE_DOCS.WRITE',    'Subir y administrar documentos del expediente de los colaboradores'),
    ('RH.DOC_STRUCTURE.MANAGE',   'Administrar la estructura del expediente: secciones y tipos de documento'),
    ('RH.ALERTS.READ',            'Consultar alertas de documentos por vencer o faltantes'),
    ('RH.TRAINING.MANAGE',        'Administrar capacitaciones, evaluaciones, asignaciones y constancias'),
    ('RH.EVAL_GRADING.READ',      'Consultar la cola de calificacion, tableros y reportes de evaluaciones'),
    ('RH.EVAL_GRADING.WRITE',     'Calificar evaluaciones y autorizar presentaciones extemporaneas'),
    ('RH.SELF.EXPEDIENT',         'Consultar y subir documentos de mi propio expediente'),
    ('RH.SELF.EVALUATIONS',       'Presentar mis evaluaciones de capacitacion asignadas'),
    -- HELPDESK (Gestion de Activos)
    ('HELPDESK.DASHBOARD.READ',   'Ver el resumen y el tablero de gestion de activos'),
    ('HELPDESK.ASSETS.READ',      'Consultar activos, su expediente, componentes y documentos'),
    ('HELPDESK.ASSETS.WRITE',     'Crear y editar activos, revisar la carga, gestionar componentes, eventos y evidencias'),
    ('HELPDESK.ASSETS.DELETE',    'Eliminar activos del inventario'),
    ('HELPDESK.TICKETS.READ',     'Consultar los tickets de soporte del area'),
    ('HELPDESK.TICKETS.WRITE',    'Gestionar tickets: crear, resolver, evaluar riesgo ISO y liberar tecnicamente'),
    ('HELPDESK.HANDOVERS.READ',   'Consultar las actas de entrega-recepcion de activos'),
    ('HELPDESK.HANDOVERS.WRITE',  'Crear, firmar, anular y eliminar actas de entrega-recepcion'),
    ('HELPDESK.MOVEMENTS.READ',   'Consultar los movimientos de activos'),
    ('HELPDESK.MOVEMENTS.WRITE',  'Registrar movimientos de activos (cambio de unidad, area, categoria o responsable)'),
    ('HELPDESK.MAINTENANCE.READ', 'Consultar planes y ordenes de mantenimiento'),
    ('HELPDESK.MAINTENANCE.WRITE','Administrar planes y ordenes de mantenimiento preventivo'),
    ('HELPDESK.CALIBRATION.READ', 'Consultar planes y ordenes de calibracion'),
    ('HELPDESK.CALIBRATION.WRITE','Administrar planes y ordenes de calibracion metrologica'),
    ('HELPDESK.ORG.READ',         'Consultar la estructura organizacional (unidades, areas y responsables)'),
    ('HELPDESK.ORG.MANAGE',       'Administrar la estructura organizacional (unidades, areas y responsables)'),
    ('HELPDESK.CATALOGS.READ',    'Consultar los catalogos de activos, tickets, mantenimiento y calibracion'),
    ('HELPDESK.CATALOGS.MANAGE',  'Administrar los catalogos del modulo de activos'),
    ('HELPDESK.SELF.TICKETS',     'Crear y dar seguimiento a mis propios tickets de soporte'),
    ('HELPDESK.SELF.ASSETS',      'Consultar los activos que tengo asignados'),
    -- ADMIN (Administracion del sistema)
    ('ADMIN.USERS.READ',          'Consultar los usuarios del sistema y el catalogo de modulos'),
    ('ADMIN.USERS.MANAGE',        'Crear, editar y eliminar usuarios, y restablecer contrasenas'),
    ('ADMIN.ROLES.MANAGE',        'Administrar roles, permisos y la asignacion de roles a usuarios'),
    ('ADMIN.AUDIT.READ',          'Consultar la bitacora de auditoria del sistema')
) AS v(code, description)
WHERE UPPER(p.code) = v.code;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260714_02_rbac_permission_descriptions.sql', '86cc7d879bcb01e3c3ccbec92073c2a7c88ff7caddd60db67cbc6d15e7a9b5af')
ON CONFLICT (filename) DO NOTHING;
