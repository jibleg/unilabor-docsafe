-- Ajuste del nombre visible del modulo HELPDESK: se acorta a "Gestion de Activos"
-- (se retira "y Soporte" del titulo). El codigo 'HELPDESK' no cambia.
BEGIN;

UPDATE public.modules
   SET name = 'Gestión de Activos'
 WHERE UPPER(code) = 'HELPDESK';

COMMIT;
