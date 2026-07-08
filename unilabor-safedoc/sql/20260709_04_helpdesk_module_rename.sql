-- Renombra el NOMBRE VISIBLE del modulo HELPDESK (el codigo 'HELPDESK' NO cambia).
-- El modulo dejo de ser solo mesa de ayuda: hoy incluye el inventario y ciclo de
-- vida de activos ISO 15189 (entrega-recepcion, movimientos, mantenimiento,
-- calibracion, calendario) ademas de los tickets de soporte.
-- Solo actualiza public.modules.name/description; no toca code ni accesos.
BEGIN;

UPDATE public.modules
   SET name = 'Gestión de Activos y Soporte',
       description = 'Inventario y ciclo de vida de activos (ISO 15189): mantenimiento, calibración, entrega-recepción, movimientos y mesa de ayuda.'
 WHERE UPPER(code) = 'HELPDESK';

COMMIT;
