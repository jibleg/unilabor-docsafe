BEGIN;

-- =============================================================================
-- Helpdesk Tickets - TCK-01: maquina de estados explicita, cierre/cancelacion
-- formales y canal de atencion (incluye variante de soporte 100% telefonico,
-- sin evidencia documental, sustituida por una bitacora de llamada obligatoria).
-- =============================================================================

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

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'helpdesk_tickets' AND column_name IN
--     ('closed_at','cancelled_at','request_channel','support_channel','onsite_responsible_employee_id');
--   SELECT code FROM public.permissions WHERE code LIKE 'HELPDESK.TICKETS.%' ORDER BY code;
-- =============================================================================
