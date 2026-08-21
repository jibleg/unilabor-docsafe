-- Renombra el modulo PROVIDERS: "Proveedores" -> "Acuerdos con los Proveedores".
-- El codigo 'PROVIDERS' y los codigos de rol (PROVIDERS_ADMIN/EDITOR/VIEWER) no cambian,
-- solo los nombres visibles.
BEGIN;

UPDATE public.modules
   SET name = 'Acuerdos con los Proveedores'
 WHERE UPPER(code) = 'PROVIDERS';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Administrador'
 WHERE code = 'PROVIDERS_ADMIN';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Editor'
 WHERE code = 'PROVIDERS_EDITOR';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Consulta'
 WHERE code = 'PROVIDERS_VIEWER';

COMMIT;
