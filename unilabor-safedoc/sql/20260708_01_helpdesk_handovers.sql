-- Acta de entrega-recepcion de activos (ISO 15189:2022, trazabilidad de movimientos).
--
-- Primera evidencia de movimiento del inventario: la entrega formal de los activos
-- de una unidad/area a su responsable. El operador/RH coteja en sitio con el
-- responsable, ambos firman (firma electronica trazada) y se genera un acta PDF
-- con fecha/hora. Soporta multiples entregas parciales: un activo entregado (con
-- item en un acta FIRMADA) no vuelve a estar disponible para otra acta salvo que
-- la anterior se anule (VOID). La invariante de "un activo en una sola acta
-- firmada" se refuerza en el servicio (signHandover) bajo transaccion + FOR UPDATE.
--
-- Aditivo y no destructivo: solo agrega tablas/seeds nuevos; no toca datos ni
-- columnas existentes.
BEGIN;

-- Secuencia atomica para el folio del acta (mismo patron que 20260620_01).
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_handover_code_seq;

-- --- Acta (cabecera) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_handovers (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NOT NULL,
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id),
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id),
  -- Quien entrega (operador/RH/admin): usuario del sistema + nombre para la firma.
  delivered_by_user_id UUID NULL REFERENCES public.users(id),
  delivered_by_name TEXT NOT NULL,
  -- Quien recibe (responsable del area): usuario del sistema + nombre para la firma.
  received_by_user_id UUID NULL REFERENCES public.users(id),
  received_by_name TEXT NOT NULL,
  handover_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  void_reason TEXT NULL,
  notes TEXT NULL,
  -- Firmas electronicas trazadas (PNG en disco) y acta PDF generada.
  deliverer_signature_path TEXT NULL,
  receiver_signature_path TEXT NULL,
  document_path TEXT NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_helpdesk_handovers_status CHECK (status IN ('DRAFT', 'SIGNED', 'VOID'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_handovers_folio
  ON public.helpdesk_handovers (folio);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_area
  ON public.helpdesk_handovers (area_id);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_status
  ON public.helpdesk_handovers (status);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_received_by
  ON public.helpdesk_handovers (received_by_user_id);

-- --- Items del acta (activos entregados) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_handover_items (
  handover_id BIGINT NOT NULL REFERENCES public.helpdesk_handovers(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  receipt_condition_id BIGINT NULL REFERENCES public.helpdesk_receipt_conditions(id),
  observations TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (handover_id, asset_id)
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_handover_items_asset
  ON public.helpdesk_handover_items (asset_id);

-- --- Seeds: tipo de evento de ciclo de vida + tipo de documento ---
-- Cada activo entregado recibe un evento HANDOVER en su expediente, con el acta
-- PDF (kind HANDOVER_ACT) ligada como evidencia.
INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('HANDOVER', 'Entrega-Recepcion', 'Entrega-recepcion del equipo a su responsable (acta firmada).', 15)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('HANDOVER_ACT', 'Acta de entrega-recepcion', 'Acta de entrega-recepcion de activos con firmas.', 15)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

-- Alinear la secuencia del folio con el maximo id existente.
SELECT setval(
  'public.helpdesk_handover_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_handovers), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_handovers), 0) > 0
);

COMMIT;
