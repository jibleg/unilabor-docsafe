BEGIN;

CREATE TABLE IF NOT EXISTS public.helpdesk_ticket_statuses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_ticket_statuses_code
  ON public.helpdesk_ticket_statuses (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_ticket_priorities (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  response_hours INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_ticket_priorities_code
  ON public.helpdesk_ticket_priorities (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_code TEXT NOT NULL,
  asset_id BIGINT NULL REFERENCES public.helpdesk_assets(id),
  request_type_id BIGINT NULL REFERENCES public.helpdesk_request_types(id),
  status_id BIGINT NULL REFERENCES public.helpdesk_ticket_statuses(id),
  priority_id BIGINT NULL REFERENCES public.helpdesk_ticket_priorities(id),
  requester_user_id UUID NULL REFERENCES public.users(id),
  requester_employee_id BIGINT NULL REFERENCES public.employees(id),
  assigned_user_id UUID NULL REFERENCES public.users(id),
  assigned_employee_id BIGINT NULL REFERENCES public.employees(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  operational_impact TEXT NULL,
  affects_results BOOLEAN NOT NULL DEFAULT FALSE,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_tickets_ticket_code
  ON public.helpdesk_tickets (UPPER(ticket_code));

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_asset_id
  ON public.helpdesk_tickets (asset_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_status_id
  ON public.helpdesk_tickets (status_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_requester_employee_id
  ON public.helpdesk_tickets (requester_employee_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_assigned_employee_id
  ON public.helpdesk_tickets (assigned_employee_id);

CREATE TABLE IF NOT EXISTS public.helpdesk_ticket_comments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_ticket_comments_ticket_id
  ON public.helpdesk_ticket_comments (ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.helpdesk_ticket_documents (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_kind TEXT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_ticket_documents_ticket_id
  ON public.helpdesk_ticket_documents (ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.helpdesk_ticket_history (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  previous_values JSONB NULL,
  new_values JSONB NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_ticket_history_ticket_id
  ON public.helpdesk_ticket_history (ticket_id, created_at DESC);

INSERT INTO public.helpdesk_ticket_statuses (code, name, description, is_closed, sort_order)
SELECT source.code, source.name, source.description, source.is_closed, source.sort_order
FROM (
  VALUES
    ('NEW', 'Nuevo', 'Solicitud registrada y pendiente de revision.', FALSE, 10),
    ('IN_REVIEW', 'En revision', 'Solicitud en evaluacion inicial.', FALSE, 20),
    ('ASSIGNED', 'Asignado', 'Solicitud asignada a responsable.', FALSE, 30),
    ('IN_PROGRESS', 'En proceso', 'Solicitud en atencion tecnica.', FALSE, 40),
    ('WAITING_PARTS', 'Esperando refaccion', 'Atencion detenida por refacciones o insumos.', FALSE, 50),
    ('WAITING_PROVIDER', 'Esperando proveedor', 'Atencion dependiente de proveedor externo.', FALSE, 60),
    ('SOLVED', 'Solucionado', 'Soporte declara solucion tecnica aplicada.', FALSE, 70),
    ('VALIDATED', 'Validado', 'Responsable valida funcionamiento o continuidad.', FALSE, 80),
    ('CLOSED', 'Cerrado', 'Ticket cerrado administrativamente.', TRUE, 90),
    ('CANCELLED', 'Cancelado', 'Solicitud cancelada o improcedente.', TRUE, 100)
) AS source(code, name, description, is_closed, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_ticket_statuses existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_ticket_priorities (code, name, description, response_hours, sort_order)
SELECT source.code, source.name, source.description, source.response_hours, source.sort_order
FROM (
  VALUES
    ('LOW', 'Baja', 'No compromete la continuidad operativa.', 72, 10),
    ('MEDIUM', 'Media', 'Impacto operativo controlado.', 48, 20),
    ('HIGH', 'Alta', 'Impacta la continuidad de un proceso.', 24, 30),
    ('CRITICAL', 'Critica', 'Puede afectar operacion, resultados o seguridad.', 8, 40)
) AS source(code, name, description, response_hours, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_ticket_priorities existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
