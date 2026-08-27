-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-08-27
-- Helpdesk Tickets: roadmap TCK-01..07 (trazabilidad ISO 15189:2022 completa:
-- maquina de estados, firma electronica, evidencia documental, constancia PDF)
-- + mejoras posteriores (proveedor de la bitacora telefonica ligado al
-- catalogo real de proveedores, roles "cuatro ojos" para segregacion de
-- funciones). La paginacion de /me/tickets y el renombre del card de Acuerdos
-- en el selector de modulos NO requieren migracion (solo codigo).
--
-- 100% ADITIVA: columnas NULL-ables / DEFAULT seguro, permisos y roles
-- nuevos, catalogo nuevo. NO borra ni renombra ninguna tabla existente.
--
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate): aplica
--   20260824_01_helpdesk_ticket_closure.sql
--   20260824_02_helpdesk_ticket_signatures.sql
--   20260824_03_helpdesk_ticket_constancia_kind.sql
--   20260825_01_helpdesk_ticket_provider_catalog.sql
--   20260825_02_helpdesk_ticket_four_eyes_roles.sql
--   y las registra en public.schema_migrations con SU checksum SHA-256:
--     20260824_01_helpdesk_ticket_closure.sql
--       117b2ceceb31d9643e0e40ee08d16369866d7d68a42ad48d5b5ac2a72af568b2
--     20260824_02_helpdesk_ticket_signatures.sql
--       d37ef9c185d5859df5839c32a0eb7f13726a8da61270d1569094083a3431ad26
--     20260824_03_helpdesk_ticket_constancia_kind.sql
--       b5fe73352bad53f9d209e5d44f99ddaa5e077a694c74b4ca0465d1ac9e44e629
--     20260825_01_helpdesk_ticket_provider_catalog.sql
--       7e8ebcb41ad5c54bd699a6f2eb7004191f9c723261d3c15bcc0d2d83a7c0920c
--     20260825_02_helpdesk_ticket_four_eyes_roles.sql
--       c22b0f77a684a75e7406af3912556abbe5106df32b05a8daa07e4216040e6045
-- Idempotente: correr el script dos veces no rompe nada (ADD COLUMN IF NOT
--   EXISTS, inserts con guardas / ON CONFLICT). Validado corriendo limpio
--   sobre la BD local (ya migrada) antes de este deploy.
-- ============================================================================


-- ============================================================================
-- 1) 20260824_01_helpdesk_ticket_closure.sql
-- ============================================================================
-- TCK-01: maquina de estados explicita, cierre/cancelacion formales y canal
-- de atencion (incluye variante de soporte 100% telefonico, sin evidencia
-- documental, sustituida por una bitacora de llamada obligatoria).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en helpdesk_tickets
-- ---------------------------------------------------------------------------
ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS closure_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS request_channel TEXT NOT NULL DEFAULT 'PORTAL',
  ADD COLUMN IF NOT EXISTS support_channel TEXT NULL,
  ADD COLUMN IF NOT EXISTS provider_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS provider_contact TEXT NULL,
  ADD COLUMN IF NOT EXISTS onsite_responsible_employee_id BIGINT NULL REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS call_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_helpdesk_tickets_request_channel'
  ) THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT chk_helpdesk_tickets_request_channel
      CHECK (request_channel IN ('PORTAL', 'PHONE', 'EMAIL', 'IN_PERSON'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_helpdesk_tickets_support_channel'
  ) THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT chk_helpdesk_tickets_support_channel
      CHECK (support_channel IS NULL OR support_channel IN ('ON_SITE', 'REMOTE_PHONE', 'REMOTE_OTHER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_onsite_responsible_employee_id
  ON public.helpdesk_tickets (onsite_responsible_employee_id)
  WHERE onsite_responsible_employee_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. RBAC: separa HELPDESK.TICKETS.WRITE en permisos por accion (TCK-01).
--    HELPDESK_EDITOR/HELPDESK_ADMIN reciben el set completo (sin regresion);
--    abre la puerta a roles mas finos (ej. "cuatro ojos") sin crearlos aun.
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
    ('HELPDESK.TICKETS.ASSIGN',            'HELPDESK', 'Asignar responsable y mover el estado operativo de un ticket'),
    ('HELPDESK.TICKETS.SOLVE',             'HELPDESK', 'Registrar la solucion tecnica de un ticket'),
    ('HELPDESK.TICKETS.ISO_RISK',          'HELPDESK', 'Registrar la evaluacion ISO/riesgo de un ticket'),
    ('HELPDESK.TICKETS.TECHNICAL_RELEASE', 'HELPDESK', 'Documentar la liberacion tecnica de un ticket'),
    ('HELPDESK.TICKETS.VALIDATE_RETURN',   'HELPDESK', 'Validar el retorno a operacion de un ticket'),
    ('HELPDESK.TICKETS.CLOSE',             'HELPDESK', 'Cerrar o cancelar formalmente un ticket')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.ASSIGN'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.SOLVE'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.ISO_RISK'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.TECHNICAL_RELEASE'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.VALIDATE_RETURN'),
    ('HELPDESK_EDITOR', 'HELPDESK.TICKETS.CLOSE'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.ASSIGN'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.SOLVE'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.ISO_RISK'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.TECHNICAL_RELEASE'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.VALIDATE_RETURN'),
    ('HELPDESK_ADMIN',  'HELPDESK.TICKETS.CLOSE')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = UPPER(src.role_code)
INNER JOIN public.permissions p ON UPPER(p.code) = UPPER(src.permission_code)
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260824_01_helpdesk_ticket_closure.sql', '117b2ceceb31d9643e0e40ee08d16369866d7d68a42ad48d5b5ac2a72af568b2')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 2) 20260824_02_helpdesk_ticket_signatures.sql
-- ============================================================================
-- TCK-02: firma electronica en la confirmacion de conformidad del solicitante
-- (portal de autoservicio) y en el cierre (responsable que cierra). Mismo
-- mecanismo que Movimientos de activos (SignaturePad -> PNG -> uploads/signatures).
BEGIN;

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS requester_signature_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS closer_signature_path TEXT NULL;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260824_02_helpdesk_ticket_signatures.sql', 'd37ef9c185d5859df5839c32a0eb7f13726a8da61270d1569094083a3431ad26')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 3) 20260824_03_helpdesk_ticket_constancia_kind.sql
-- ============================================================================
-- TCK-04: catalogo de tipo de documento para la constancia PDF generada al
-- cerrar un ticket (se archiva en helpdesk_ticket_documents siempre, y
-- adicionalmente en helpdesk_asset_documents si el ticket tiene asset_id).
BEGIN;

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('TICKET_CONSTANCIA', 'Constancia de atencion de ticket', 'Constancia PDF generada al cerrar una solicitud de soporte.', 16)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260824_03_helpdesk_ticket_constancia_kind.sql', 'b5fe73352bad53f9d209e5d44f99ddaa5e077a694c74b4ca0465d1ac9e44e629')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 4) 20260825_01_helpdesk_ticket_provider_catalog.sql
-- ============================================================================
-- Vincula el proveedor de la bitacora telefonica (support_channel=REMOTE_PHONE)
-- al catalogo real de proveedores (helpdesk_suppliers, el mismo que usa
-- Activos/Proveedores), en vez de texto libre. provider_name se conserva como
-- snapshot de solo lectura (se sigue llenando desde el backend a partir de
-- provider_id, para no tocar los consumidores existentes: constancia PDF, etc).
BEGIN;

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS provider_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_provider_id
  ON public.helpdesk_tickets (provider_id)
  WHERE provider_id IS NOT NULL;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260825_01_helpdesk_ticket_provider_catalog.sql', '7e8ebcb41ad5c54bd699a6f2eb7004191f9c723261d3c15bcc0d2d83a7c0920c')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 5) 20260825_02_helpdesk_ticket_four_eyes_roles.sql
-- ============================================================================
-- Roles "cuatro ojos" (control de segregacion de funciones): 2 roles nuevos
-- que separan quien ejecuta la reparacion de quien la valida/cierra, sin
-- quitarle nada a los roles existentes (100% ADITIVA, sin regresion de acceso).
BEGIN;

INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT src.code, src.name, src.description, m.id, TRUE, TRUE
FROM (
  VALUES
    ('HELPDESK_TICKETS_TECH', 'Mesa de Ayuda · Técnico de soporte',
     'Asigna y resuelve solicitudes de soporte; no evalua riesgo ISO, no libera tecnicamente, no valida el retorno ni cierra', 'HELPDESK'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'Mesa de Ayuda · Supervisor de soporte',
     'Evalua riesgo ISO, libera tecnicamente, valida el retorno a operacion y cierra/cancela solicitudes; no asigna ni resuelve', 'HELPDESK')
) AS src(code, name, description, module_code)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE UPPER(r.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.DASHBOARD.READ'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.ASSETS.READ'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.CATALOGS.READ'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.TICKETS.READ'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.TICKETS.WRITE'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.TICKETS.ASSIGN'),
    ('HELPDESK_TICKETS_TECH', 'HELPDESK.TICKETS.SOLVE'),

    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.DASHBOARD.READ'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.ASSETS.READ'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.CATALOGS.READ'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.READ'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.WRITE'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.ISO_RISK'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.TECHNICAL_RELEASE'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.VALIDATE_RETURN'),
    ('HELPDESK_TICKETS_SUPERVISOR', 'HELPDESK.TICKETS.CLOSE')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = UPPER(src.role_code)
INNER JOIN public.permissions p ON UPPER(p.code) = UPPER(src.permission_code)
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260825_02_helpdesk_ticket_four_eyes_roles.sql', 'c22b0f77a684a75e7406af3912556abbe5106df32b05a8daa07e4216040e6045')
ON CONFLICT (filename) DO NOTHING;


-- =============================================================================
-- Verificacion (ejecutar tras los COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'helpdesk_tickets' AND column_name IN
--     ('closed_at','cancelled_at','request_channel','support_channel',
--      'onsite_responsible_employee_id','requester_signature_path',
--      'closer_signature_path','provider_id');  -- 8 filas
--   SELECT code FROM public.permissions WHERE code LIKE 'HELPDESK.TICKETS.%' ORDER BY code;  -- 8 filas
--   SELECT code FROM public.helpdesk_document_kinds WHERE code = 'TICKET_CONSTANCIA';  -- 1 fila
--   SELECT code, name FROM public.roles WHERE code LIKE 'HELPDESK_TICKETS_%';  -- 2 filas nuevas
--   SELECT filename, checksum FROM public.schema_migrations WHERE filename LIKE '20260824%' OR filename LIKE '20260825%';  -- 5 filas
--
-- Post-deploy pendiente (fuera de este SQL):
--   * HELPDESK_EDITOR/HELPDESK_ADMIN ya quedaron con los 6 permisos granulares
--     de tickets (sin regresion de acceso).
--   * Los roles HELPDESK_TICKETS_TECH/HELPDESK_TICKETS_SUPERVISOR arrancan sin
--     nadie asignado — solo asignarlos desde Administracion -> Roles si se
--     quiere activar la segregacion "cuatro ojos" (opcional, no bloqueante).
-- =============================================================================
