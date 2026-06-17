-- Sprint 31 (EVAL-05) - Telefono del colaborador.
-- Habilita la notificacion por SMS (LabsMobile) de sprints posteriores. Nullable,
-- formato E.164 validado en la capa Zod. Migracion aditiva e idempotente.
BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone TEXT NULL;

COMMIT;
