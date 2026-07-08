-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-07-07
-- Estructura organizacional del inventario Help Desk (Unidad <-> Area <-> Responsables)
-- ============================================================================
--
-- Corresponde a la migracion versionada:
--   sql/20260707_01_helpdesk_org_structure.sql
--
-- Este script replica lo que hace el runner (node dist/scripts/migrate.js migrate):
--   1) Ejecuta el DDL dentro de UNA transaccion.
--   2) Registra la migracion en public.schema_migrations con EL MISMO checksum
--      que calcula el runner (SHA-256 del contenido del archivo .sql), para que
--      un `migrate`/`migrate:status` posterior la vea como YA aplicada y NO
--      advierta "checksum distinto".
--
-- Checksum del archivo (SHA-256): a2102e3ade5cfe5bda0edd8d25254c7aaee9e593567830464a71882f15929940
--
-- Es idempotente: CREATE TABLE/INDEX IF NOT EXISTS + INSERT ... ON CONFLICT DO
-- NOTHING. Correrlo dos veces no rompe nada.
-- Aditivo y NO destructivo: no toca datos ni columnas existentes.
-- Prerrequisito: deben existir public.helpdesk_asset_units, public.helpdesk_asset_areas
-- y public.users (id UUID) — todas ya en prod.
-- ============================================================================

BEGIN;

-- Tabla de control (por si no existiera; en prod ya existe).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unidad <-> Area (M:N): una unidad agrupa varias areas y un area puede
-- pertenecer a varias unidades.
CREATE TABLE IF NOT EXISTS public.helpdesk_unit_areas (
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unit_id, area_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_unit_areas_area ON public.helpdesk_unit_areas (area_id);

-- Area <-> Responsable (users): un area tiene uno o mas usuarios responsables y
-- un usuario puede ser responsable de varias areas. El responsable es un usuario
-- del sistema (public.users, id UUID), no un empleado.
CREATE TABLE IF NOT EXISTS public.helpdesk_area_responsibles (
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_area_responsibles_user ON public.helpdesk_area_responsibles (user_id);

-- Registro en el control de migraciones con el checksum del runner.
INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260707_01_helpdesk_org_structure.sql', 'a2102e3ade5cfe5bda0edd8d25254c7aaee9e593567830464a71882f15929940')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Verificacion (opcional): debe listar la fila registrada.
-- SELECT filename, checksum, applied_at FROM public.schema_migrations
--  WHERE filename = '20260707_01_helpdesk_org_structure.sql';
