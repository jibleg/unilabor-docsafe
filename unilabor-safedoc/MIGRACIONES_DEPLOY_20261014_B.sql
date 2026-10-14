-- MIGRACIONES_DEPLOY_20261014_B.sql - quita ATTENDANCE.* de ADMIN_SUPERUSER (aplicar por pgAdmin; compatible PG < 12)
-- ============ 20261014_01_attendance_revoke_superuser_grants.sql ============
-- =============================================================================
-- Control de Asistencias - Quita los permisos ATTENDANCE.* del rol ADMIN_SUPERUSER.
--
-- 20261012_02 se los concedio, pero ningun otro modulo lo hace: ADMIN_SUPERUSER solo
-- administra usuarios/roles/auditoria. Con esa concesion, todo administrador del
-- sistema (p. ej. sistemas@, cuentas QA) veia Asistencias sin tener un rol ATTENDANCE_*.
-- El acceso al modulo se da unicamente con ATTENDANCE_ADMIN / _EDITOR / _VIEWER.
-- Idempotente.
-- =============================================================================
BEGIN;

DELETE FROM public.role_permissions rp
 USING public.roles r, public.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND UPPER(r.code) = 'ADMIN_SUPERUSER'
   AND UPPER(p.code) LIKE 'ATTENDANCE.%';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20261014_01_attendance_revoke_superuser_grants.sql', '6e6d16595e8018786ea06513532afb02001297b8515e4ed4a2a35e91775ec22a')
ON CONFLICT DO NOTHING;
