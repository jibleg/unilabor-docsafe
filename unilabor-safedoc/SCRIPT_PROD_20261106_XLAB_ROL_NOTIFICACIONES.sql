-- SCRIPT_PROD_20261106_XLAB_ROL_NOTIFICACIONES.sql
--
-- Rol de minimo privilegio con el que DocSafe lee y marca como leidas las
-- notificaciones de Contigo+ en `xlab`. Aplicar A MANO, conectado a la BD `xlab`,
-- con un rol que pueda crear roles (no es una migracion de DocSafe: `npm run migrate`
-- corre en otra BD). Compatible con PostgreSQL 10. Se puede repetir: la segunda
-- corrida solo actualiza la contrasena y reafirma los permisos.
--
-- ANTES DE CORRERLO reemplaza REEMPLAZAR_CONTRASENA (una vez, abajo) por una contrasena
-- fuerte, p. ej. `openssl rand -hex 32`, y usa esa misma en XLAB_DB_PASSWORD del .env
-- del VPS. No guardes el archivo con la contrasena puesta ni lo subas al repositorio.
--
-- El rol queda con:
--   USAGE en los esquemas public y contigo
--   contigo.staff_notifications: SELECT y UPDATE solo de read_at
--   public.usuarios: SELECT solo de cve_usuario, nombre, login, activo_usuario, cve_tipo_usuario
--
-- Si el rol ya existe y solo falta `login` (lo pide el selector de RH), basta con:
--   GRANT SELECT (login) ON public.usuarios TO docsafe_notificaciones;
-- Al final se comprueba y, si le sobra o le falta algo, se revierte todo.
BEGIN;

DO $$
DECLARE
  -- Reemplazar solo el valor de esta linea.
  new_password CONSTANT text := '80a455c99caec4e64bd40c7f27132a0c674a54c0e6d17d6ecb8d84072f496a83';
BEGIN
  IF current_database() <> 'xlab' THEN
    RAISE EXCEPTION 'Este script se aplica en la BD xlab, no en %.', current_database();
  END IF;
  IF new_password LIKE 'REEMPLAZAR%' OR length(new_password) < 16 THEN
    RAISE EXCEPTION 'Reemplaza REEMPLAZAR_CONTRASENA por una contrasena fuerte antes de correr este script.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docsafe_notificaciones') THEN
    EXECUTE format('CREATE ROLE docsafe_notificaciones LOGIN PASSWORD %L', new_password);
  ELSE
    EXECUTE format('ALTER ROLE docsafe_notificaciones PASSWORD %L', new_password);
  END IF;
END
$$;

ALTER ROLE docsafe_notificaciones LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 10;

GRANT CONNECT ON DATABASE xlab TO docsafe_notificaciones;
GRANT USAGE ON SCHEMA public, contigo TO docsafe_notificaciones;

-- Se parte de cero en ambas tablas por si el rol ya existia con otros permisos.
REVOKE ALL ON contigo.staff_notifications, public.usuarios FROM docsafe_notificaciones;
REVOKE ALL (cve_usuario, nombre, login, activo_usuario, cve_tipo_usuario) ON public.usuarios FROM docsafe_notificaciones;

GRANT SELECT ON contigo.staff_notifications TO docsafe_notificaciones;
GRANT UPDATE (read_at) ON contigo.staff_notifications TO docsafe_notificaciones;
GRANT SELECT (cve_usuario, nombre, login, activo_usuario, cve_tipo_usuario) ON public.usuarios TO docsafe_notificaciones;

-- Comprobacion dentro de la transaccion: incluye lo que el rol hereda de PUBLIC.
DO $$
DECLARE
  extra text;
BEGIN
  SELECT string_agg(a.attname, ', ') INTO extra
    FROM pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('cve_usuario', 'nombre', 'login', 'activo_usuario', 'cve_tipo_usuario')
     AND has_column_privilege('docsafe_notificaciones', a.attrelid, a.attnum, 'SELECT');
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'El rol puede leer columnas de public.usuarios que no debe: %', extra;
  END IF;

  SELECT string_agg(a.attname, ', ') INTO extra
    FROM pg_attribute a
   WHERE a.attrelid = 'contigo.staff_notifications'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname <> 'read_at'
     AND has_column_privilege('docsafe_notificaciones', a.attrelid, a.attnum, 'UPDATE');
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'El rol puede modificar columnas de contigo.staff_notifications que no debe: %', extra;
  END IF;

  IF has_table_privilege('docsafe_notificaciones', 'public.usuarios', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_table_privilege('docsafe_notificaciones', 'contigo.staff_notifications', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'nombre', 'UPDATE') THEN
    RAISE EXCEPTION 'El rol conserva privilegios de mas sobre public.usuarios o contigo.staff_notifications.';
  END IF;

  IF NOT has_table_privilege('docsafe_notificaciones', 'contigo.staff_notifications', 'SELECT')
     OR NOT has_column_privilege('docsafe_notificaciones', 'contigo.staff_notifications', 'read_at', 'UPDATE')
     OR NOT has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'cve_usuario', 'SELECT')
     OR NOT has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'nombre', 'SELECT')
     OR NOT has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'login', 'SELECT')
     OR NOT has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'activo_usuario', 'SELECT')
     OR NOT has_column_privilege('docsafe_notificaciones', 'public.usuarios', 'cve_tipo_usuario', 'SELECT') THEN
    RAISE EXCEPTION 'Al rol le falta algun permiso necesario.';
  END IF;
END
$$;

COMMIT;

-- Comprobacion opcional, ya con el rol (psql -U docsafe_notificaciones -d xlab):
--   SELECT cve_usuario, nombre FROM public.usuarios LIMIT 1;   -- debe funcionar
--   SELECT contrasena FROM public.usuarios LIMIT 1;            -- debe dar permission denied
--   UPDATE contigo.staff_notifications SET titulo = titulo;    -- debe dar permission denied
