BEGIN;

-- =====================================================================
-- HD-ISO-01: Columnas ISO 15189:2022 en helpdesk_assets
-- (proveedor, fechas de recepcion/puesta en marcha, condicion al recibir,
--  baja con motivo, y bandera de codigo manual/preservado).
-- Reusa acquired_on (fecha factura), warranty_expires_on, brand/model/serial,
-- location y responsible_employee_id ya existentes.
-- =====================================================================

ALTER TABLE public.helpdesk_assets
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  ADD COLUMN IF NOT EXISTS received_on DATE NULL,
  ADD COLUMN IF NOT EXISTS placed_in_service_on DATE NULL,
  ADD COLUMN IF NOT EXISTS receipt_condition_id BIGINT NULL REFERENCES public.helpdesk_receipt_conditions(id),
  ADD COLUMN IF NOT EXISTS decommissioned_on DATE NULL,
  ADD COLUMN IF NOT EXISTS disposal_reason_id BIGINT NULL REFERENCES public.helpdesk_disposal_reasons(id),
  ADD COLUMN IF NOT EXISTS asset_code_overridden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_supplier_id
  ON public.helpdesk_assets (supplier_id);

COMMIT;
