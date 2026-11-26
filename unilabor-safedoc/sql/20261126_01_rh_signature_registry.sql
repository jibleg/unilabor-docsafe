-- =============================================================================
-- RH - Registro de firmas autorizadas (REH-REG-027).
--
-- Vista derivada del Listado de personal autorizado (REH-REG-026): una fila por
-- colaborador y puesto AUTORIZADO en su ultimo REH-REG-003 cerrado, mas las
-- filas historicas (colaborador de baja o puesto terminado) que tuvieron esa
-- autorizacion. Casi todo sale de lo que SafeDoc ya sabe (carta REH-REG-008,
-- evaluaciones, puestos). Aqui se agregan solo los datos que el formato pide y
-- el sistema no tenia:
--
--   * rh_disciplines                        catalogo de disciplinas o areas del
--                                           formato (11 valores del Excel).
--   * rh_signature_authorizations           por colaborador x puesto: disciplina,
--                                           si es responsable de disciplina, el
--                                           texto de actividades y documentos
--                                           que esta autorizado a firmar y notas.
--   * rh_employee_signature_specimens       especimen de FIRMA y de RUBRICA del
--                                           colaborador (PNG en la carpeta de
--                                           firmas + sha256). Nunca se borra: se
--                                           retira con retired_at; a lo mas uno
--                                           vigente por colaborador y tipo.
--   * Permiso RH.SIGNATURE_REGISTRY.MANAGE  consulta, PDF y edicion del registro.
--                                           Se otorga a los roles que hoy tienen
--                                           RH.COMPETENCY.AUTHORIZE (RH_ADMIN,
--                                           RH_DIRECTOR) y a ADMIN_SUPERUSER, que
--                                           son los de recursos.humanos@ y sistemas@.
--
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de disciplinas o areas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_disciplines (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_disciplines_code ON public.rh_disciplines (UPPER(code));

INSERT INTO public.rh_disciplines (code, name, sort_order)
SELECT src.code, src.name, src.sort_order
FROM (
  VALUES
    ('QUIMICA_CLINICA',       'Química clínica',              1),
    ('HEMATOLOGIA',           'Hematología y coagulación',    2),
    ('INMUNOLOGIA',           'Inmunología e inmunoquímica',  3),
    ('UROANALISIS',           'Uroanálisis',                  4),
    ('PARASITOLOGIA',         'Parasitología',                5),
    ('TOXICOLOGIA',           'Toxicología',                  6),
    ('BIOLOGIA_MOLECULAR',    'Biología molecular',           7),
    ('RECEPCION_TOMA',        'Recepción y toma de muestra',  8),
    ('GESTION_CALIDAD',       'Gestión de la calidad',        9),
    ('ADMINISTRATIVA',        'Administrativa',              10),
    ('NO_APLICA',             'No aplica',                   11)
) AS src(code, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.rh_disciplines d WHERE UPPER(d.code) = UPPER(src.code));

-- ---------------------------------------------------------------------------
-- 2. Datos capturados por colaborador x puesto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_signature_authorizations (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  discipline_id BIGINT NULL REFERENCES public.rh_disciplines(id) ON DELETE SET NULL,
  is_discipline_responsible BOOLEAN NOT NULL DEFAULT FALSE,
  -- Actividades y documentos que esta autorizado a firmar (texto libre; se
  -- propone desde la carta REH-REG-008 y RH lo edita).
  signing_scope_text TEXT NULL,
  notes TEXT NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_signature_authorizations_employee_position
  ON public.rh_signature_authorizations (employee_id, position_id);
CREATE INDEX IF NOT EXISTS idx_rh_signature_authorizations_discipline
  ON public.rh_signature_authorizations (discipline_id);

COMMENT ON TABLE public.rh_signature_authorizations IS
  'REH-REG-027: disciplina, responsable y alcance de firma por colaborador y puesto. La fila del registro se arma con el REH-REG-026.';

-- ---------------------------------------------------------------------------
-- 3. Especimenes de firma y rubrica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_employee_signature_specimens (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  image_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  -- UPLOAD = archivo, CLIPBOARD = portapapeles, DOCUMENT_SIGNATURE = copiado de
  -- la ultima firma del colaborador en SafeDoc (rh_document_signatures).
  source TEXT NOT NULL,
  source_note TEXT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ NULL,
  retired_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_rh_signature_specimens_kind CHECK (kind IN ('FIRMA', 'RUBRICA')),
  CONSTRAINT chk_rh_signature_specimens_source CHECK (source IN ('UPLOAD', 'CLIPBOARD', 'DOCUMENT_SIGNATURE'))
);

-- Un solo especimen vigente por colaborador y tipo; los retirados se conservan.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_signature_specimens_active
  ON public.rh_employee_signature_specimens (employee_id, kind) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_signature_specimens_employee
  ON public.rh_employee_signature_specimens (employee_id, registered_at DESC);

COMMENT ON TABLE public.rh_employee_signature_specimens IS
  'REH-REG-027: especimen de firma y de rubrica del colaborador. No se borra: se retira con retired_at.';

-- ---------------------------------------------------------------------------
-- 4. Permiso y concesiones
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES
    ('RH.SIGNATURE_REGISTRY.MANAGE',
     'Registro de firmas autorizadas (REH-REG-027): consultar, generar el PDF y capturar disciplina, alcance y especimenes de firma')
) AS src(code, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'RH'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

-- 4a. Roles que hoy autorizan la competencia (RH.COMPETENCY.AUTHORIZE).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM public.role_permissions rp
INNER JOIN public.permissions op ON op.id = rp.permission_id AND UPPER(op.code) = 'RH.COMPETENCY.AUTHORIZE'
INNER JOIN public.permissions np ON UPPER(np.code) = 'RH.SIGNATURE_REGISTRY.MANAGE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4b. ADMIN_SUPERUSER, si existe.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
INNER JOIN public.permissions p ON UPPER(p.code) = 'RH.SIGNATURE_REGISTRY.MANAGE'
WHERE UPPER(r.code) = 'ADMIN_SUPERUSER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- recursos.humanos@ y sistemas@ (26-nov-2026) tienen RH_ADMIN y ADMIN_SUPERUSER:
-- con 4a y 4b quedan cubiertas sin regar el permiso a sus demas roles
-- (Calidad, Help Desk, Asistencias), que lo heredarian otros usuarios.

COMMIT;
