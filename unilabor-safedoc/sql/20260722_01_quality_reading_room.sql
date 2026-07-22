-- =============================================================================
-- Sala de Lectura (modulo Calidad) - SL-01: cimientos
--
-- Lectura obligatoria y firma autografa de los documentos del SGC. El gestor
-- toma un documento VIGENTE de `documents`, lo publica a lectura y asigna
-- lectores; la evidencia firmada se queda en el repositorio de Calidad.
--
-- 100% ADITIVA: crea 2 tablas, 2 permisos y 2 roles. NO modifica ninguna tabla
-- existente, NO toca `documents` ni el modulo RH de acuses, NO borra nada.
--
-- Ver ROADMAP_MODULO_SALA_DE_LECTURA.md para el diseno completo.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Publicaciones: el documento del SGC puesto a lectura
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_reading_publications (
  id BIGSERIAL PRIMARY KEY,

  -- La fuente es el documento del SGC, nunca una copia. RESTRICT: una
  -- publicacion existente impide que el documento desaparezca.
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,

  -- Sellados al publicar: la evidencia se ancla a este archivo exacto. El
  -- documento puede renombrarse despues; lo que se leyo no cambia.
  title_snapshot TEXT NOT NULL,
  source_sha256  CHAR(64) NOT NULL,
  pages_total    INTEGER NOT NULL,

  -- Reglas de la lectura, congeladas para todos los lectores de la publicacion.
  min_seconds_per_page   INTEGER NOT NULL DEFAULT 7,
  default_deadline_hours INTEGER NOT NULL DEFAULT 72,
  instructions TEXT NULL,

  status TEXT NOT NULL DEFAULT 'open',

  published_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_qrp_status      CHECK (status IN ('open', 'closed')),
  CONSTRAINT chk_qrp_pages       CHECK (pages_total >= 1),
  CONSTRAINT chk_qrp_min_seconds CHECK (min_seconds_per_page BETWEEN 1 AND 120),
  CONSTRAINT chk_qrp_deadline    CHECK (default_deadline_hours BETWEEN 1 AND 8760),
  CONSTRAINT chk_qrp_closed      CHECK (status <> 'closed' OR closed_at IS NOT NULL)
);

-- Una sola publicacion ABIERTA por documento. Como cada version del SGC es su
-- propia fila en `documents` (versionado por reemplazo), esto permite tener
-- abierta la v3 mientras la v2 conserva cerrada su publicacion historica con
-- toda su evidencia intacta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_qrp_open_document
  ON public.quality_reading_publications (document_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_qrp_document
  ON public.quality_reading_publications (document_id);

CREATE INDEX IF NOT EXISTS idx_qrp_status
  ON public.quality_reading_publications (status);

-- ---------------------------------------------------------------------------
-- 2. Acuses: un lector dentro de una publicacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_reading_acknowledgements (
  id BIGSERIAL PRIMARY KEY,

  publication_id BIGINT NOT NULL
    REFERENCES public.quality_reading_publications(id) ON DELETE RESTRICT,

  -- El lector es quien firma, o sea un USUARIO. `employee_id` es solo una foto
  -- para reportar por area: que sea NULL no impide leer ni firmar, porque la
  -- evidencia se queda en Calidad y no depende del expediente.
  user_id     UUID   NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  employee_id BIGINT NULL     REFERENCES public.employees(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending',

  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at       TIMESTAMPTZ NOT NULL,
  started_at        TIMESTAMPTZ NULL,
  read_completed_at TIMESTAMPTZ NULL,
  signed_at         TIMESTAMPTZ NULL,

  -- Evidencia de lectura. `pages_seen` solo guarda paginas que YA calificaron
  -- (permanencia >= min_seconds_per_page).
  pages_total          INTEGER NOT NULL,
  pages_seen           INTEGER[] NOT NULL DEFAULT '{}',
  min_seconds_per_page INTEGER NOT NULL DEFAULT 7,
  active_seconds       INTEGER NOT NULL DEFAULT 0,

  -- Contabilidad del heartbeat, llevada por el SERVIDOR. El cliente solo
  -- reporta en que pagina esta, nunca cuantos segundos lleva: si no, bastaria
  -- un POST con 99999 para saltarse el gate. El credito de cada latido se acota
  -- contra last_progress_at, asi que dejar la pestania abierta no acumula.
  current_page         INTEGER NULL,
  current_page_seconds INTEGER NOT NULL DEFAULT 0,
  last_progress_at     TIMESTAMPTZ NULL,

  -- Firma y sellado. `signed_file_path` es la copia firmada, que vive en el
  -- almacen de evidencias de Calidad; NO se inserta en `documents`, que
  -- controla documentos vigentes del SGC y no archiva evidencia.
  signature_path   TEXT NULL,
  signed_file_path TEXT NULL,
  source_sha256    CHAR(64) NULL,
  signed_sha256    CHAR(64) NULL,
  ip_address       INET NULL,
  user_agent       TEXT NULL,

  notified_email_at TIMESTAMPTZ NULL,
  reminder_sent_at  TIMESTAMPTZ NULL,

  assigned_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_qra_status CHECK (
    status IN ('pending', 'in_progress', 'read', 'signed', 'expired', 'cancelled')
  ),
  CONSTRAINT chk_qra_pages_total   CHECK (pages_total >= 1),
  CONSTRAINT chk_qra_min_seconds   CHECK (min_seconds_per_page BETWEEN 1 AND 120),
  CONSTRAINT chk_qra_active_secs   CHECK (active_seconds >= 0),
  CONSTRAINT chk_qra_current_page  CHECK (
    current_page IS NULL OR (current_page BETWEEN 1 AND pages_total)
  ),
  CONSTRAINT chk_qra_current_secs  CHECK (current_page_seconds >= 0),
  -- Un acuse firmado debe traer su evidencia completa.
  CONSTRAINT chk_qra_signed_evidence CHECK (
    status <> 'signed'
    OR (signed_at IS NOT NULL AND signed_file_path IS NOT NULL AND signed_sha256 IS NOT NULL)
  )
);

-- A lo sumo un acuse VIGENTE por (publicacion, lector). Los estados terminales
-- no bloquean una reasignacion.
CREATE UNIQUE INDEX IF NOT EXISTS ux_qra_active
  ON public.quality_reading_acknowledgements (publication_id, user_id)
  WHERE status IN ('pending', 'in_progress', 'read');

CREATE INDEX IF NOT EXISTS idx_qra_publication
  ON public.quality_reading_acknowledgements (publication_id);

CREATE INDEX IF NOT EXISTS idx_qra_user
  ON public.quality_reading_acknowledgements (user_id);

CREATE INDEX IF NOT EXISTS idx_qra_status
  ON public.quality_reading_acknowledgements (status);

CREATE INDEX IF NOT EXISTS idx_qra_deadline
  ON public.quality_reading_acknowledgements (deadline_at);

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
    ('QUALITY.READING.MANAGE', 'QUALITY',
     'Publicar documentos del SGC a lectura, asignar lectores y dar seguimiento'),
    ('QUALITY.SELF.READING',   'QUALITY',
     'Leer y firmar los documentos del SGC que me fueron asignados')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 4. Roles nuevos del modulo Calidad
--
-- Se usa un rol DEDICADO para gestionar lecturas en vez de darle el permiso a
-- RH_ADMIN: como el acceso a modulos se deriva de los permisos, eso le habria
-- hecho aparecer Calidad en el selector a todo RH, agregandoles una pantalla de
-- seleccion que hoy no ven (el selector se salta con un solo modulo). Con el
-- rol dedicado eso solo le pasa a quien de verdad va a publicar lecturas.
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT src.code, src.name, src.description, m.id, TRUE, TRUE
FROM (
  VALUES
    ('QUALITY_READING_MANAGER', 'Calidad · Gestor de sala de lectura',
     'Publica documentos del SGC a lectura, asigna lectores y da seguimiento', 'QUALITY'),
    ('QUALITY_READER',          'Calidad · Lector',
     'Solo lee y firma los documentos del SGC que le fueron asignados', 'QUALITY')
) AS src(code, name, description, module_code)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE UPPER(r.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 5. Asignacion de permisos a roles
--
-- QUALITY_ADMIN recibe MANAGE porque ya tiene el modulo: no hay cambio visible
-- para el. RH_ADMIN NO recibe nada (ver nota del punto 4).
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('QUALITY_READING_MANAGER', 'QUALITY.READING.MANAGE'),
    ('QUALITY_READING_MANAGER', 'QUALITY.SELF.READING'),
    ('QUALITY_READER',          'QUALITY.SELF.READING'),
    ('QUALITY_ADMIN',           'QUALITY.READING.MANAGE'),
    ('QUALITY_ADMIN',           'QUALITY.SELF.READING'),
    ('QUALITY_EDITOR',          'QUALITY.SELF.READING'),
    ('QUALITY_VIEWER',          'QUALITY.SELF.READING')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
