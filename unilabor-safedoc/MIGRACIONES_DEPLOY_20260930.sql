-- MIGRACIONES_DEPLOY_20260930.sql — aplicar por psql desde el VPS (o pgAdmin) en prod (sgc.unilabor-app.com)
-- Contiene 20260930_01 (autorizacion del REH-REG-003 como paso propio: CHECK con PENDIENTE, columnas
-- authorized_by_user_id/authorization_note, permiso RH.COMPETENCY.AUTHORIZE, rol RH_DIRECTOR).
-- PRE-CHEQUEO: la ultima aplicada en prod debe ser 20260929_03. No modifica datos existentes.
-- Aplicar ANTES del deploy del backend.
BEGIN;

-- ============ 20260930_01_rh_competency_authorization_step.sql ============
-- =============================================================================
-- RH/Evaluacion de competencia (REH-REG-003) - Autorizacion como paso propio.
-- Antes: al cerrar, la autorizacion se derivaba del dictamen (competente =>
-- autorizado). Ahora: el cierre deja la evaluacion competente en PENDIENTE y
-- la autorizacion la ejecuta RH o Direccion General (permiso
-- RH.COMPETENCY.AUTHORIZE), registrando quien, cuando y una nota; la vigencia
-- de 12 meses y la constancia nacen al autorizar. "No competente" sigue
-- resolviendose como NO AUTORIZADO al cerrar. Sin firma autografa (decision RH).
-- Prod no tiene evaluaciones cerradas al aplicar esta migracion.
-- =============================================================================

ALTER TABLE public.rh_competency_evaluations
  DROP CONSTRAINT IF EXISTS chk_rh_comp_eval_authorization;
ALTER TABLE public.rh_competency_evaluations
  ADD CONSTRAINT chk_rh_comp_eval_authorization
  CHECK (authorization_result IS NULL
         OR authorization_result IN ('PENDIENTE', 'AUTORIZADO', 'AUTORIZADO_CON_SEGUIMIENTO', 'NO_AUTORIZADO'));

ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS authorized_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorization_note TEXT NULL;

COMMENT ON COLUMN public.rh_competency_evaluations.authorized_by_user_id IS
  'Usuario (RH o Direccion General) que ejecuto la autorizacion del REH-REG-003.';
COMMENT ON COLUMN public.rh_competency_evaluations.authorization_note IS
  'Observacion capturada al autorizar / no autorizar.';

-- Permiso: autorizar evaluaciones de competencia.
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES ('RH.COMPETENCY.AUTHORIZE', 'RH',
          'Autorizar (o no) evaluaciones de competencia cerradas con dictamen competente (REH-REG-003)')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

-- Rol: Direccion General (consulta el modulo de competencia y autoriza).
INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT 'RH_DIRECTOR', 'RH · Dirección General',
       'Autoriza evaluaciones de competencia (REH-REG-003) y consulta el módulo de competencia',
       m.id, TRUE, TRUE
FROM public.modules m
WHERE UPPER(m.code) = 'RH'
  AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE UPPER(r.code) = 'RH_DIRECTOR');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES ('RH_ADMIN', 'RH.COMPETENCY.AUTHORIZE'),
             ('RH_DIRECTOR', 'RH.COMPETENCY.AUTHORIZE'),
             ('RH_DIRECTOR', 'RH.COMPETENCY.MANAGE')) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260930_01_rh_competency_authorization_step.sql', '7f592323b8c2c84a2fc1576cf726a2c80e98260bdf7dbb149f55578ebee0ba0c')
ON CONFLICT DO NOTHING;

COMMIT;
