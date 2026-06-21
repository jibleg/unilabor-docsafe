-- Generacion atomica de codigos HD-/MP-/OM- (mesa de ayuda).
-- Antes los codigos se calculaban con `COALESCE(MAX(id),0)+1`, lo que bajo
-- concurrencia produce el MISMO codigo para dos solicitudes simultaneas y
-- colisiona contra el indice unico. Se reemplaza por secuencias dedicadas:
-- `nextval` es atomico y nunca repite, sin importar la concurrencia.
-- Cada secuencia se inicializa al MAX(id) actual para continuar la numeracion
-- existente sin chocar con codigos ya emitidos.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_ticket_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_maintenance_plan_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_maintenance_order_code_seq;

-- Alinear el valor actual de cada secuencia con el maximo id ya existente.
-- is_called = (max > 0): si la tabla esta vacia, el primer nextval devuelve 1;
-- si ya hay filas, el primer nextval devuelve max+1.
SELECT setval(
  'public.helpdesk_ticket_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_tickets), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_tickets), 0) > 0
);

SELECT setval(
  'public.helpdesk_maintenance_plan_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_plans), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_plans), 0) > 0
);

SELECT setval(
  'public.helpdesk_maintenance_order_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_orders), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_orders), 0) > 0
);

COMMIT;
