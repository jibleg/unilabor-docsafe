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
