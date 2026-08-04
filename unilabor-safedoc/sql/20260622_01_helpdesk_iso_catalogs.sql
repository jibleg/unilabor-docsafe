BEGIN;

-- =====================================================================
-- HD-ISO-01: Catalogos nuevos para el ciclo de vida + evidencias ISO 15189:2022
-- (proveedores, condicion de recepcion, motivos de baja, tipos de documento,
--  tipos de evento de ciclo de vida) + tabla de consecutivos para el codigo
--  de inventario autogenerado, y reseed de catalogos segun la plantilla
--  Inventario-UNILABOR.xlsx (2 unidades, 26 areas, clasificaciones, modalidades).
-- =====================================================================

-- --- Proveedores (proveedor != marca) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  rfc TEXT NULL,
  contact TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_suppliers_name
  ON public.helpdesk_suppliers (UPPER(name));

-- --- Condicion al recibir el equipo (ISO 6.4.4) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_receipt_conditions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_receipt_conditions_code
  ON public.helpdesk_receipt_conditions (UPPER(code));

-- --- Motivos de baja ---
CREATE TABLE IF NOT EXISTS public.helpdesk_disposal_reasons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_disposal_reasons_code
  ON public.helpdesk_disposal_reasons (UPPER(code));

-- --- Tipos/categorias de documento de evidencia ---
CREATE TABLE IF NOT EXISTS public.helpdesk_document_kinds (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_document_kinds_code
  ON public.helpdesk_document_kinds (UPPER(code));

-- --- Tipos de evento del ciclo de vida ---
CREATE TABLE IF NOT EXISTS public.helpdesk_lifecycle_event_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_lifecycle_event_types_code
  ON public.helpdesk_lifecycle_event_types (UPPER(code));

-- --- Consecutivos para el codigo de inventario autogenerado ---
-- scope_key = 'UNIT_AREA:<codigo_unidad>:<codigo_area>', contador independiente
-- por combinacion unidad+area (la categoria NO reinicia el consecutivo).
-- Ver generateAssetCode en helpdesk-asset.service.ts.
CREATE TABLE IF NOT EXISTS public.helpdesk_asset_code_counters (
  scope_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- Seeds
-- =====================================================================

INSERT INTO public.helpdesk_receipt_conditions (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('OPERATIONAL', 'Operativo conforme', 'Equipo recibido operativo y conforme.', 10),
    ('DAMAGED', 'Danado', 'Equipo recibido con dano fisico o funcional.', 20),
    ('INCOMPLETE', 'Incompleto', 'Equipo recibido sin accesorios o componentes.', 30),
    ('NEEDS_CALIBRATION', 'Requiere calibracion', 'Equipo recibido pendiente de calibracion/verificacion.', 40)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_receipt_conditions existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_disposal_reasons (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('NO_SUPPORT', 'Falta de soporte', 'Sin soporte tecnico o refacciones del proveedor.', 10),
    ('UNREPAIRABLE', 'Falla irreparable', 'Falla que no admite reparacion costo-efectiva.', 20),
    ('REPLACEMENT', 'Cambio / Reemplazo', 'Sustituido por un equipo nuevo o superior.', 30),
    ('OBSOLESCENCE', 'Obsolescencia', 'Tecnologia obsoleta o fuera de uso.', 40)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_disposal_reasons existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('INVOICE', 'Factura', 'Factura o recibo de adquisicion.', 10),
    ('PURCHASE_ORDER', 'Orden de compra', 'Orden de compra al proveedor.', 20),
    ('USER_MANUAL', 'Manual de usuario', 'Manual de operacion del equipo.', 30),
    ('INSTRUCTIVE', 'Instructivo', 'Instructivo de uso o procedimiento.', 40),
    ('INSERT', 'Inserto', 'Inserto tecnico del proveedor.', 50),
    ('SERVICE_ORDER', 'Orden de servicio', 'Orden de servicio del proveedor.', 60),
    ('MAINTENANCE_REPORT', 'Reporte de mantenimiento', 'Reporte de mantenimiento preventivo o correctivo.', 70),
    ('CALIBRATION_CERT', 'Certificado de calibracion', 'Certificado de calibracion / verificacion metrologica.', 80),
    ('DECOMMISSION_ACT', 'Acta de baja', 'Acta o evidencia de baja del equipo.', 90),
    ('WARRANTY', 'Garantia', 'Poliza o evidencia de garantia.', 100),
    ('OTHER', 'Otros', 'Otros documentos del proveedor.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('ACQUISITION', 'Adquisicion', 'Ingreso/compra del equipo a UNILABOR.', 10),
    ('COMMISSIONING', 'Instalacion / Puesta en marcha', 'Instalacion y puesta en servicio.', 20),
    ('MAINTENANCE', 'Mantenimiento', 'Mantenimiento preventivo o correctivo.', 30),
    ('CALIBRATION', 'Calibracion', 'Calibracion o verificacion metrologica (ISO 6.5).', 40),
    ('INCIDENT', 'Incidente / Falla', 'Falla, incidente o evento adverso.', 50),
    ('RELOCATION', 'Reubicacion', 'Cambio de ubicacion o area.', 60),
    ('DECOMMISSION', 'Baja', 'Baja del equipo del inventario.', 70)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

-- =====================================================================
-- Reseed de catalogos segun la plantilla Inventario-UNILABOR.xlsx
-- (codigos cortos para componer el codigo ISO UNIDAD-AREA-CLASIFICACION-###)
-- =====================================================================

-- Unidades (A / B)
INSERT INTO public.helpdesk_asset_units (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('A', 'UNILABOR CENTRO', 'Unidad Unilabor Centro.', 1),
    ('B', 'UNILABOR CIDE', 'Unidad Unilabor CIDE.', 2)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_units existing WHERE UPPER(existing.code) = source.code
);

-- Areas (26 segun plantilla)
INSERT INTO public.helpdesk_asset_areas (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('VAL', 'VALIDACION', 10),
    ('URO', 'UROANALISIS', 20),
    ('TOX', 'TOXICOLOGIA', 30),
    ('TEL', 'TELEFONISTA', 40),
    ('SDI', 'SEPARACION Y DISTRIBUCION', 50),
    ('REC', 'CALL CENTER', 60),
    ('QCL', 'QUIMICA CLINICA', 70),
    ('PAR', 'PARASITOLOGIA', 80),
    ('MIC', 'MICROBIOLOGIA', 90),
    ('IRU', 'INMUNOLOGIA RUTINARIA', 100),
    ('IES', 'INMUNOLOGIA ESPECIAL', 110),
    ('HEM', 'HEMATOLOGIA', 120),
    ('DGE', 'DIRECCION GENERAL', 130),
    ('MRP', 'COORDINACION MERCADOTECNIA Y RELACIONES PUBLICAS', 140),
    ('TEI', 'COORDINACION DE TECNOLOGIA E INFORMACION', 150),
    ('SGC', 'COORDINACION DE SISTEMA DE GESTION DE CALIDAD', 160),
    ('SES', 'COORDINACION DE SERVICIOS ESPECIALES', 170),
    ('REH', 'COORDINACION DE RECURSOS HUMANOS', 180),
    ('AYF', 'ADMINISTRACION Y FINANZAS', 190),
    ('CRE', 'CAPTURA DE RESULTADOS', 200),
    ('ALM', 'ALMACEN', 210),
    ('AND', 'ANDROLOGIA', 220),
    ('MEQ', 'MANTENIMIENTO Y EQUIPOS', 230),
    ('SGE', 'SERVICIOS GENERALES', 240),
    ('TMU', 'TOMA DE MUESTRA', 250),
    ('SUB', 'SUBROGACION', 260)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_areas existing WHERE UPPER(existing.code) = source.code
);

-- Clasificaciones (categorias) canonicas de la plantilla
INSERT INTO public.helpdesk_asset_categories (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('MBL', 'MOBILIARIO', 10),
    ('EQL', 'EQUIPO DE LABORATORIO', 20),
    ('EQC', 'EQUIPO DE COMPUTO', 30),
    ('EQR', 'EQUIPO DE REFRIGERACION', 40)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_categories existing WHERE UPPER(existing.code) = source.code
);

-- Modalidades de compra de la plantilla
INSERT INTO public.helpdesk_purchase_modalities (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('ACTIVO_FIJO', 'Activo fijo', 1),
    ('COMODATO', 'Comodato', 2)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_purchase_modalities existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
