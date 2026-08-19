-- =============================================================================
-- Modulo Proveedores - Ficha completa del proveedor
--
-- El catalogo de proveedores (helpdesk_suppliers) solo tenia name/description/
-- rfc/contact (texto libre). Se agrega domicilio, sitio web y notas al
-- proveedor, y una tabla de contactos (0..N por proveedor, con uno marcado
-- como principal) para reemplazar el campo de texto libre `contact` por un
-- registro estructurado.
--
-- ADITIVA: agrega columnas NULL-ables a `helpdesk_suppliers` (Activos sigue
-- funcionando igual, solo ignora las columnas nuevas) y crea 1 tabla nueva.
-- No borra ni renombra `helpdesk_suppliers.contact` (queda en desuso, se
-- conserva por si algun reporte historico la lee).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Domicilio, sitio web y notas del proveedor
-- ---------------------------------------------------------------------------
ALTER TABLE public.helpdesk_suppliers
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS address_country TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- 2. Contactos del proveedor (lista, uno puede marcarse como principal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_contacts (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_contacts_provider_id
  ON public.provider_contacts (provider_id);

-- A lo mucho un contacto principal por proveedor.
CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_contacts_primary
  ON public.provider_contacts (provider_id)
  WHERE is_primary = TRUE;

COMMIT;
