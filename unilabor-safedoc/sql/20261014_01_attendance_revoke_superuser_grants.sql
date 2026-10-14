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
