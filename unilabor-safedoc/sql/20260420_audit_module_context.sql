DO $$
BEGIN
  IF to_regclass('public.access_logs') IS NULL THEN
    RAISE EXCEPTION 'La tabla public.access_logs no existe. Ejecuta primero la base de auditoria original.';
  END IF;
END $$;

ALTER TABLE public.access_logs
  ADD COLUMN IF NOT EXISTS module_code VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS employee_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_access_logs_module_code
  ON public.access_logs (module_code);

CREATE INDEX IF NOT EXISTS idx_access_logs_employee_id
  ON public.access_logs (employee_id);

CREATE INDEX IF NOT EXISTS idx_access_logs_entity_type_entity_id
  ON public.access_logs (entity_type, entity_id);
