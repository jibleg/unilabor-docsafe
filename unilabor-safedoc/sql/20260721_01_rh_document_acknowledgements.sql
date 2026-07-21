-- =============================================================================
-- RH-ACK - Acuse de lectura y firma autografa de documentos institucionales.
--
-- MODELO
-- Un documento institucional (reglamento, politica, codigo de conducta) no
-- pertenece a nadie: RH lo carga UNA vez y lo asigna a los colaboradores que
-- deben leerlo y firmarlo. Al firmar, cada lector recibe SU PROPIA copia con la
-- hoja de acuse anexa en SU expediente; el documento institucional nunca se
-- modifica.
--
-- Se modela aparte de employee_documents a proposito: esa tabla es por empleado,
-- y usarla como fuente compartida hacia que N colaboradores acusaran un archivo
-- alojado en el expediente de un tercero.
--
-- DOS RELOJES INDEPENDIENTES, no confundir:
--   * deadline_at          -> plazo para cumplir (default 72h).
--   * min_seconds_per_page -> permanencia minima POR PAGINA dentro del visor.
--     Es un piso anti-atajo, NO una estimacion de lectura real: una pagina solo
--     cuenta tras permanecer en ella ese tiempo con la pestania visible y con
--     foco. Se congela por acuse para que cambiar el default no altere los que
--     ya estan en curso.
--
-- El peso probatorio lo carga la declaracion firmada; el tracking solo sostiene
-- que hubo exposicion completa y no trivial del documento.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Documentos institucionales (la fuente que se lee)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_institutional_documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',

  -- Sellados al cargar: la evidencia del acuse se ancla a este archivo exacto.
  sha256 CHAR(64) NOT NULL,
  pages_total INTEGER NOT NULL,

  -- Donde aterriza la copia firmada dentro del expediente del lector.
  target_document_type_id BIGINT NOT NULL
    REFERENCES public.document_types(id) ON DELETE RESTRICT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_inst_docs_pages CHECK (pages_total >= 1)
);

CREATE INDEX IF NOT EXISTS idx_rh_inst_docs_active
  ON public.rh_institutional_documents (is_active)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 2. Acuses (un documento institucional asignado a un colaborador)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_document_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  institutional_document_id BIGINT NOT NULL
    REFERENCES public.rh_institutional_documents(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',

  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,

  started_at TIMESTAMPTZ NULL,
  read_completed_at TIMESTAMPTZ NULL,
  signed_at TIMESTAMPTZ NULL,

  -- Evidencia de lectura
  pages_total INTEGER NOT NULL,
  -- Solo paginas que YA calificaron (permanencia >= min_seconds_per_page).
  pages_seen INTEGER[] NOT NULL DEFAULT '{}',
  active_seconds INTEGER NOT NULL DEFAULT 0,
  min_seconds_per_page INTEGER NOT NULL DEFAULT 7,
  -- Contabilidad del heartbeat, llevada por el SERVIDOR (el cliente solo reporta
  -- en que pagina esta; nunca cuantos segundos lleva, o bastaria un POST con
  -- 99999 para saltarse el gate). El credito de cada latido se acota contra
  -- last_progress_at, asi que dejar la pestania abierta no acumula tiempo.
  current_page INTEGER NULL,
  current_page_seconds INTEGER NOT NULL DEFAULT 0,
  last_progress_at TIMESTAMPTZ NULL,

  -- Firma y sellado
  signature_path TEXT NULL,
  -- Copia firmada, ya en el expediente del propio lector.
  signed_document_id BIGINT NULL
    REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  source_sha256 CHAR(64) NULL,
  signed_sha256 CHAR(64) NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,

  notified_email_at TIMESTAMPTZ NULL,
  reminder_sent_at TIMESTAMPTZ NULL,

  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_ack_status CHECK (
    status IN ('pending', 'in_progress', 'read', 'signed', 'expired', 'cancelled')
  ),
  CONSTRAINT chk_rh_ack_pages_total CHECK (pages_total >= 1),
  CONSTRAINT chk_rh_ack_min_seconds CHECK (min_seconds_per_page BETWEEN 1 AND 120),
  CONSTRAINT chk_rh_ack_active_seconds CHECK (active_seconds >= 0),
  CONSTRAINT chk_rh_ack_current_page CHECK (
    current_page IS NULL OR (current_page BETWEEN 1 AND pages_total)
  ),
  CONSTRAINT chk_rh_ack_current_page_seconds CHECK (current_page_seconds >= 0),
  -- Un acuse firmado debe traer su evidencia completa.
  CONSTRAINT chk_rh_ack_signed_evidence CHECK (
    status <> 'signed'
    OR (signed_at IS NOT NULL AND signature_path IS NOT NULL AND signed_sha256 IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_rh_ack_document
  ON public.rh_document_acknowledgements (institutional_document_id);

CREATE INDEX IF NOT EXISTS idx_rh_ack_employee
  ON public.rh_document_acknowledgements (employee_id);

CREATE INDEX IF NOT EXISTS idx_rh_ack_status
  ON public.rh_document_acknowledgements (status);

CREATE INDEX IF NOT EXISTS idx_rh_ack_deadline
  ON public.rh_document_acknowledgements (deadline_at);

-- Idempotencia: a lo sumo un acuse VIGENTE por (documento, colaborador). Los
-- estados terminales no bloquean una reasignacion (p. ej. nueva version del
-- documento o acuse vencido que se vuelve a solicitar).
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_ack_active
  ON public.rh_document_acknowledgements (institutional_document_id, employee_id)
  WHERE status IN ('pending', 'in_progress', 'read');

-- ---------------------------------------------------------------------------
-- 3. Permisos RBAC
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT
  src.code,
  m.id,
  split_part(src.code, '.', 2),
  split_part(src.code, '.', 3),
  src.description
FROM (
  VALUES
    ('RH.ACKNOWLEDGEMENTS.MANAGE', 'RH',
     'Cargar documentos institucionales, solicitar acuses de lectura y dar seguimiento'),
    ('RH.SELF.ACKNOWLEDGEMENTS',   'RH',
     'Leer y firmar los documentos que me fueron asignados para acuse')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('RH_VIEWER', 'RH.SELF.ACKNOWLEDGEMENTS'),
    ('RH_EDITOR', 'RH.ACKNOWLEDGEMENTS.MANAGE'),
    ('RH_EDITOR', 'RH.SELF.ACKNOWLEDGEMENTS'),
    ('RH_ADMIN',  'RH.ACKNOWLEDGEMENTS.MANAGE'),
    ('RH_ADMIN',  'RH.SELF.ACKNOWLEDGEMENTS')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
