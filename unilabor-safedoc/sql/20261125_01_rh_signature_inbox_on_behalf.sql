-- =============================================================================
-- RH - Buzon de firmas: colocar la firma de otro firmante desde una imagen
--
-- Recursos Humanos resguarda la firma de todo el personal en archivos de imagen.
-- Con este permiso, quien lo tenga puede abrir el buzon de cualquier firmante y
-- colocar su firma (ANA-REG-060, REH-REG-003 y REH-REG-008) cargando ese archivo,
-- de uno en uno o varios registros a la vez.
--
--   * Permiso RH.SIGNATURE_INBOX.SIGN_ON_BEHALF. La accion no es MANAGE ni WRITE
--     a proposito: no cambia el rol efectivo del modulo RH de quien lo recibe.
--   * Rol RH_SIGNATURE_PROXY, que solo otorga ese permiso. De entrada se asigna
--     a recursos.humanos@unilabor.mx y sistemas@unilabor.mx; despues se administra
--     desde Usuarios como cualquier otro rol.
--   * Columna on_behalf en las dos tablas de firmas: TRUE cuando la firma la
--     coloco otra persona (signer_user_id) a nombre del firmante
--     (signer_employee_id). Las firmas existentes quedan en FALSE.
--
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_supervision_checklist_signatures
  ADD COLUMN IF NOT EXISTS on_behalf BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.rh_document_signatures
  ADD COLUMN IF NOT EXISTS on_behalf BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.rh_supervision_checklist_signatures.on_behalf IS
  'TRUE: la firma la coloco signer_user_id desde una imagen, a nombre de signer_employee_id.';
COMMENT ON COLUMN public.rh_document_signatures.on_behalf IS
  'TRUE: la firma la coloco signer_user_id desde una imagen, a nombre de signer_employee_id.';

INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES
    ('RH.SIGNATURE_INBOX.SIGN_ON_BEHALF',
     'Colocar en el Buzon de firmas la firma de otro firmante, cargandola desde un archivo de imagen')
) AS src(code, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'RH'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT 'RH_SIGNATURE_PROXY', 'RH · Firma por imagen a nombre del firmante',
       'Coloca en el Buzón de firmas la firma de cualquier firmante a partir del archivo de imagen que resguarda Recursos Humanos',
       m.id, TRUE, TRUE
FROM public.modules m
WHERE UPPER(m.code) = 'RH'
  AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE UPPER(r.code) = 'RH_SIGNATURE_PROXY');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
INNER JOIN public.permissions p ON UPPER(p.code) = 'RH.SIGNATURE_INBOX.SIGN_ON_BEHALF'
WHERE UPPER(r.code) = 'RH_SIGNATURE_PROXY'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
INNER JOIN public.roles r ON UPPER(r.code) = 'RH_SIGNATURE_PROXY'
WHERE LOWER(u.email) IN ('recursos.humanos@unilabor.mx', 'sistemas@unilabor.mx')
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;
