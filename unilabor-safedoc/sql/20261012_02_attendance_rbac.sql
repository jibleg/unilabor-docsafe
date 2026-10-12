-- =============================================================================
-- Control de Asistencias - Modulo, permisos y roles RBAC.
--
-- Requiere 20261012_01_attendance_schema.sql. 100 % aditivo e idempotente:
-- crea 1 modulo (ATTENDANCE), 5 permisos y 3 roles de sistema, y concede los
-- permisos al rol ADMIN_SUPERUSER (igual que el resto de los modulos).
-- =============================================================================
BEGIN;

INSERT INTO public.modules (code, name, description, icon, is_active, sort_order)
SELECT src.code, src.name, src.description, src.icon, src.is_active, src.sort_order
FROM (
  VALUES (
    'ATTENDANCE',
    'Control de Asistencias',
    'Asistencia del personal por sucursal: horarios, checadas de relojes HikVision, incidencias y vacaciones.',
    'clock',
    TRUE,
    50
  )
) AS src(code, name, description, icon, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.modules m WHERE UPPER(m.code) = src.code);

INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES
    ('ATTENDANCE.RECORDS.READ',        'Consultar tableros, dias, checadas, incidencias, horarios y reportes de asistencia'),
    ('ATTENDANCE.SCHEDULES.WRITE',     'Gestionar turnos y horarios; habilitar colaboradores, asignar numero de reloj y copiar horarios'),
    ('ATTENDANCE.INCIDENTS.AUTHORIZE', 'Capturar y autorizar incidencias, justificar faltas, checadas manuales, revisar checadas, ajustar vacaciones y recalcular'),
    ('ATTENDANCE.SETTINGS.MANAGE',     'Configurar parametros de asistencia, festivos, tipos de incidencia y tabla de vacaciones'),
    ('ATTENDANCE.DEVICES.MANAGE',      'Gestionar agentes y relojes HikVision: claves, terminales, sincronizacion y enrolamiento')
) AS src(code, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'ATTENDANCE'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT src.code, src.name, src.description, m.id, TRUE, TRUE
FROM (
  VALUES
    ('ATTENDANCE_ADMIN',  'Asistencias · Administrador',
     'Control total: horarios, incidencias, configuracion y relojes'),
    ('ATTENDANCE_EDITOR', 'Asistencias · Operador',
     'Gestiona horarios y autoriza incidencias y checadas, sin configurar ni administrar relojes'),
    ('ATTENDANCE_VIEWER', 'Asistencias · Consulta',
     'Solo consulta tableros, dias, checadas, incidencias y reportes')
) AS src(code, name, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'ATTENDANCE'
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE UPPER(r.code) = UPPER(src.code));

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('ATTENDANCE_ADMIN',  'ATTENDANCE.RECORDS.READ'),
    ('ATTENDANCE_ADMIN',  'ATTENDANCE.SCHEDULES.WRITE'),
    ('ATTENDANCE_ADMIN',  'ATTENDANCE.INCIDENTS.AUTHORIZE'),
    ('ATTENDANCE_ADMIN',  'ATTENDANCE.SETTINGS.MANAGE'),
    ('ATTENDANCE_ADMIN',  'ATTENDANCE.DEVICES.MANAGE'),
    ('ATTENDANCE_EDITOR', 'ATTENDANCE.RECORDS.READ'),
    ('ATTENDANCE_EDITOR', 'ATTENDANCE.SCHEDULES.WRITE'),
    ('ATTENDANCE_EDITOR', 'ATTENDANCE.INCIDENTS.AUTHORIZE'),
    ('ATTENDANCE_VIEWER', 'ATTENDANCE.RECORDS.READ'),
    ('ADMIN_SUPERUSER',   'ATTENDANCE.RECORDS.READ'),
    ('ADMIN_SUPERUSER',   'ATTENDANCE.SCHEDULES.WRITE'),
    ('ADMIN_SUPERUSER',   'ATTENDANCE.INCIDENTS.AUTHORIZE'),
    ('ADMIN_SUPERUSER',   'ATTENDANCE.SETTINGS.MANAGE'),
    ('ADMIN_SUPERUSER',   'ATTENDANCE.DEVICES.MANAGE')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
