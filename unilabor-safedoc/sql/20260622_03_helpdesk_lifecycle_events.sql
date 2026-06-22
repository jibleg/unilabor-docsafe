BEGIN;

-- =====================================================================
-- HD-ISO-03: Eventos del ciclo de vida del equipo (ISO 15189:2022 6.4/6.5).
-- Cada evento (adquisicion, instalacion, mantenimiento, calibracion,
-- incidente, reubicacion, baja) es un registro trazable que ademas puede
-- portar evidencias PDF (helpdesk_asset_documents.lifecycle_event_id).
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_lifecycle_event_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  event_type_id BIGINT NOT NULL REFERENCES public.helpdesk_lifecycle_event_types(id),
  event_code TEXT NOT NULL,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  -- cruces opcionales segun el tipo de evento
  maintenance_order_id BIGINT NULL REFERENCES public.helpdesk_maintenance_orders(id),
  ticket_id BIGINT NULL REFERENCES public.helpdesk_tickets(id),
  supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  -- trazabilidad de quien ejecuta
  performed_by_employee_id BIGINT NULL REFERENCES public.employees(id),
  performed_by_provider TEXT NULL,
  cost NUMERIC(14,2) NULL,
  currency TEXT NULL DEFAULT 'MXN',
  -- calibracion (ISO 6.5 trazabilidad metrologica)
  calibration_certificate_no TEXT NULL,
  calibration_due_on DATE NULL,
  -- baja
  disposal_reason_id BIGINT NULL REFERENCES public.helpdesk_disposal_reasons(id),
  -- reubicacion
  from_location_id BIGINT NULL REFERENCES public.helpdesk_locations(id),
  to_location_id BIGINT NULL REFERENCES public.helpdesk_locations(id),
  notes TEXT NULL,
  -- acta/reporte generado automaticamente (se enlaza tras crear el documento)
  generated_act_document_id BIGINT NULL REFERENCES public.helpdesk_asset_documents(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hd_lifecycle_events_asset
  ON public.helpdesk_asset_lifecycle_events (asset_id, event_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_hd_lifecycle_events_type
  ON public.helpdesk_asset_lifecycle_events (event_type_id);

-- Alinear la secuencia con el maximo id existente (mismo patron que 20260620_01).
SELECT setval(
  'public.helpdesk_lifecycle_event_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_lifecycle_events), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_lifecycle_events), 0) > 0
);

COMMIT;
