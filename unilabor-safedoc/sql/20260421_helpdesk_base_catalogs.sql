BEGIN;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_categories_code
  ON public.helpdesk_asset_categories (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_locations (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_locations_code
  ON public.helpdesk_locations (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_criticalities (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_criticalities_code
  ON public.helpdesk_criticalities (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_operational_statuses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_operational_statuses_code
  ON public.helpdesk_operational_statuses (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_request_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_request_types_code
  ON public.helpdesk_request_types (UPPER(code));

INSERT INTO public.helpdesk_asset_categories (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('LAB_EQUIPMENT', 'Equipo de laboratorio', 'Instrumentos y equipos usados en procesos de laboratorio.', 10),
    ('COMPUTING', 'Equipo de computo', 'Computadoras, perifericos y equipo de TI.', 20),
    ('FURNITURE', 'Mobiliario', 'Muebles y bienes de soporte operativo.', 30),
    ('REFRIGERATION', 'Equipo de refrigeracion', 'Refrigeradores, congeladores y equipos de temperatura controlada.', 40),
    ('INFRASTRUCTURE', 'Infraestructura', 'Bienes de soporte e instalacion general.', 50)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_categories existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_locations (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('GROUND_FLOOR', 'Planta baja', 'Ubicacion general en planta baja.', 10),
    ('FIRST_FLOOR', '1er piso', 'Ubicacion general en primer piso.', 20),
    ('UPPER_FLOOR', 'Planta alta', 'Ubicacion general en planta alta.', 30),
    ('WAREHOUSE', 'Almacen', 'Area de resguardo o almacenamiento.', 40),
    ('UNASSIGNED', 'Sin ubicacion asignada', 'Ubicacion pendiente de clasificar.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_locations existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_criticalities (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('LOW', 'Baja', 'Activo con bajo impacto operativo.', 10),
    ('MEDIUM', 'Media', 'Activo con impacto operativo moderado.', 20),
    ('HIGH', 'Alta', 'Activo importante para continuidad del laboratorio.', 30),
    ('CRITICAL', 'Critica', 'Activo critico que puede afectar operacion o resultados.', 40)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_criticalities existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_operational_statuses (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('OPERATIONAL', 'Operativo', 'Equipo disponible para uso normal.', 10),
    ('CONDITIONAL', 'Operativo condicionado', 'Equipo disponible con restricciones o seguimiento.', 20),
    ('MAINTENANCE', 'En mantenimiento', 'Equipo en intervencion preventiva o correctiva.', 30),
    ('OUT_OF_SERVICE', 'Fuera de servicio', 'Equipo no disponible para operacion.', 40),
    ('RETIRED', 'Retirado', 'Equipo dado de baja o fuera de uso permanente.', 50)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_operational_statuses existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_request_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('FAILURE', 'Falla', 'Reporte de falla o mal funcionamiento.', 10),
    ('REPAIR', 'Reparacion', 'Solicitud de reparacion de equipo.', 20),
    ('SUPPORT', 'Soporte', 'Solicitud de apoyo tecnico u operativo.', 30),
    ('CORRECTIVE_MAINTENANCE', 'Mantenimiento correctivo', 'Intervencion correctiva por falla o desviacion.', 40),
    ('REVIEW', 'Revision', 'Revision preventiva, diagnostico o inspeccion.', 50),
    ('REQUEST', 'Requerimiento', 'Solicitud general asociada a un equipo o activo.', 60)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_request_types existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
