-- Modo de calendario para planes de mantenimiento (paridad con calibracion).
-- FREQUENCY: la proxima fecha se deriva del intervalo (comportamiento actual).
-- CALENDAR: las fechas las provee el proveedor/responsable y se cargan como
-- ordenes explicitas (el cierre NO autogenera la siguiente en este modo).
BEGIN;

ALTER TABLE public.helpdesk_maintenance_plans
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'FREQUENCY';

COMMIT;
