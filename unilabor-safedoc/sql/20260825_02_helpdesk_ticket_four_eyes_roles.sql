BEGIN;

-- =============================================================================
-- Helpdesk Tickets - roles "cuatro ojos" (control de segregacion de funciones)
--
-- TCK-01 (2026-08-24) separo HELPDESK.TICKETS.WRITE en 6 permisos granulares
-- por accion (ASSIGN/SOLVE/ISO_RISK/TECHNICAL_RELEASE/VALIDATE_RETURN/CLOSE)
-- pero los otorgo en bloque, identicos, a HELPDESK_EDITOR/HELPDESK_ADMIN.
-- Esta migracion crea 2 roles opcionales que separan quien ejecuta la
-- reparacion de quien la valida/cierra, sin quitarle nada a los roles
-- existentes (100% ADITIVA, sin regresion de acceso).
--
-- - HELPDESK_TICKETS_TECH: asigna y resuelve tickets (trabajo tecnico).
-- - HELPDESK_TICKETS_SUPERVISOR: evalua riesgo ISO, libera tecnicamente,
--   valida el retorno a operacion y cierra/cancela (control de calidad).
--
-- Asignar ambos roles a usuarios distintos impide que la misma persona
-- resuelva y cierre su propio ticket.
-- =============================================================================

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

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT r.code, p.code FROM public.role_permissions rp
--     INNER JOIN public.roles r ON r.id = rp.role_id
--     INNER JOIN public.permissions p ON p.id = rp.permission_id
--     WHERE r.code IN ('HELPDESK_TICKETS_TECH', 'HELPDESK_TICKETS_SUPERVISOR')
--     ORDER BY r.code, p.code;
-- =============================================================================
