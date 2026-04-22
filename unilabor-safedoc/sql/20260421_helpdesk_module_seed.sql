BEGIN;

INSERT INTO public.modules (code, name, description, icon, is_active, sort_order)
SELECT source.code, source.name, source.description, source.icon, source.is_active, source.sort_order
FROM (
  VALUES
    (
      'HELPDESK',
      'Mesa de Ayuda',
      'Modulo para gestion de activos, tickets, soporte y mantenimiento de equipos.',
      'life-buoy',
      TRUE,
      30
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.modules existing
  WHERE UPPER(existing.code) = source.code
);

UPDATE public.modules
SET
  name = source.name,
  description = source.description,
  icon = source.icon,
  is_active = source.is_active,
  sort_order = source.sort_order,
  updated_at = NOW()
FROM (
  VALUES
    (
      'HELPDESK',
      'Mesa de Ayuda',
      'Modulo para gestion de activos, tickets, soporte y mantenimiento de equipos.',
      'life-buoy',
      TRUE,
      30
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE UPPER(public.modules.code) = source.code;

COMMIT;
