-- MIGRACIONES_DEPLOY_20261016.sql - Lista de verificacion de Supervision ANA-REG-060 (Fase 6): tablas, 31 items, tipo documental, permiso RH.SUPERVISION.MANAGE (pgAdmin)
-- ============ 20261016_01_rh_supervision_checklist.sql ============
-- =============================================================================
-- RH/Induccion - Lista de verificacion de Supervision ANA-REG-060 (rev. 1).
--
-- Evidencia digital de la Fase 6 (capacitacion practica supervisada) por
-- colaborador y puesto, segun REH-MAN-002 §6.2.2.12: "el tutor asignado o el
-- responsable de la supervision documentara la evaluacion mediante la Lista
-- de verificacion de Supervision ANA-REG-060 [...] calificacion minima de 80 %".
-- Tambien sirve para la supervision periodica de area (ANA-PRC-005) cuando no
-- se liga a una inscripcion.
--
--   * rh_supervision_form_items          catalogo de los 31 items del formato,
--                                        versionado por revision (una revision
--                                        nueva del formato agrega filas; las
--                                        listas ya firmadas conservan la suya).
--   * rh_position_supervision_na_items   items que NO aplican a un puesto
--                                        (Calidad los preconfigura; al crear la
--                                        lista quedan en N/A, editables).
--   * rh_supervision_checklists          cabecera: colaborador, puesto,
--                                        inscripcion F6 (opcional), fecha, tipo,
--                                        supervisor, responsable del area,
--                                        totales, conclusion, firmas y PDF.
--   * rh_supervision_checklist_results   un renglon por item: SI / NO / NA
--                                        (NULL = sin capturar) + observacion.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de items del formato (rev. 1, vigente 06/06/2026)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_form_items (
  id BIGSERIAL PRIMARY KEY,
  form_code TEXT NOT NULL DEFAULT 'ANA-REG-060',
  form_revision INTEGER NOT NULL DEFAULT 1,
  section_code TEXT NOT NULL,
  section_title TEXT NOT NULL,
  section_order INTEGER NOT NULL,
  item_no INTEGER NOT NULL,
  item_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_supervision_form_items
  ON public.rh_supervision_form_items (form_code, form_revision, section_code, item_no);

INSERT INTO public.rh_supervision_form_items (form_code, form_revision, section_code, section_title, section_order, item_no, item_text)
SELECT 'ANA-REG-060', 1, src.section_code, src.section_title, src.section_order, src.item_no, src.item_text
FROM (
  VALUES
    ('VESTIMENTA', 'CÓDIGO DE VESTIMENTA', 1, 1, 'Pantalón azul marino: ¿El personal viste con pantalón azul marino limpio y planchado?'),
    ('VESTIMENTA', 'CÓDIGO DE VESTIMENTA', 1, 2, 'Camisa blanca manga corta: ¿El personal viste con camisa blanca manga corta limpia y planchada?'),
    ('VESTIMENTA', 'CÓDIGO DE VESTIMENTA', 1, 3, 'Calzado color negros cerrados: ¿El personal usa calzado color negro cerrado y limpio?'),
    ('VESTIMENTA', 'CÓDIGO DE VESTIMENTA', 1, 4, 'Bata, filipina: El personal utiliza Bata blanca limpia y planchada, filipina blanca y planchada o bata azul celeste limpia y planchada, de acuerdo al área asignada.'),
    ('ORDEN', 'ORDEN Y LIMPIEZA', 2, 1, 'Limpieza: ¿El personal mantiene limpia su área de trabajo incluyendo mobiliario utilizado?'),
    ('ORDEN', 'ORDEN Y LIMPIEZA', 2, 2, 'Orden: ¿El personal mantiene ordenada su área de trabajo?'),
    ('BIOSEGURIDAD', 'BIOSEGURIDAD Y USO DE EPP', 3, 1, 'Uso Obligatorio de EPP: El personal utiliza bata de laboratorio abotonada, guantes de látex/nitrilo y calzado cerrado.'),
    ('BIOSEGURIDAD', 'BIOSEGURIDAD Y USO DE EPP', 3, 2, 'Protección Facial/Ocular: Se usan caretas o gafas de seguridad durante procesos que generan aerosoles (p. ej., centrifugación abierta o destaponado).'),
    ('BIOSEGURIDAD', 'BIOSEGURIDAD Y USO DE EPP', 3, 3, 'Higiene de Manos: El personal se lava o desinfecta las manos antes y después de atender a cada paciente, y antes de retirarse del área.'),
    ('BIOSEGURIDAD', 'BIOSEGURIDAD Y USO DE EPP', 3, 4, 'Manejo de Punzocortantes: Las agujas y lancetas se descartan inmediatamente en el contenedor rígido rojo de RPBI'),
    ('BIOSEGURIDAD', 'BIOSEGURIDAD Y USO DE EPP', 3, 5, 'Gestión de Derrames y Superficies: Las mesadas de trabajo se desinfectan al inicio y al final del turno con la dilución correcta de hipoclorito de sodio o alcohol al 70%.'),
    ('PREANALITICA', 'FASE PREANALÍTICA (Recepción, Toma y Manejo de Muestras)', 4, 1, 'Registro de datos: Los datos demográficos, estudios solicitados y demás información requerida coinciden con la solicitud, identificación del paciente y registro en el sistema.'),
    ('PREANALITICA', 'FASE PREANALÍTICA (Recepción, Toma y Manejo de Muestras)', 4, 2, 'Identificación: Se verifica la identidad del paciente antes de la toma de muestra'),
    ('PREANALITICA', 'FASE PREANALÍTICA (Recepción, Toma y Manejo de Muestras)', 4, 3, 'Rotulación: Los tubos etiquetados se muestran al paciente.'),
    ('PREANALITICA', 'FASE PREANALÍTICA (Recepción, Toma y Manejo de Muestras)', 4, 4, 'Criterios de Aceptación: Se inspeccionan las muestras recibidas para descartar hemólisis, lipemia, coágulos o volumen insuficiente.'),
    ('PREANALITICA', 'FASE PREANALÍTICA (Recepción, Toma y Manejo de Muestras)', 4, 5, 'Transporte y Centrifugación: Se respetan los tiempos de centrifugado y las condiciones de temperatura durante el traslado.'),
    ('ANALITICA', 'FASE ANALÍTICA (Procesamiento y Control Técnico)', 5, 1, 'Control de Calidad Interno (CCI): Se procesaron y aprobaron los controles (normal y patológico) antes de las muestras de pacientes.'),
    ('ANALITICA', 'FASE ANALÍTICA (Procesamiento y Control Técnico)', 5, 2, 'Gráficas Levey-Jennings: Se revisaron las gráficas diarias y no se observan desvíos o tendencias'),
    ('ANALITICA', 'FASE ANALÍTICA (Procesamiento y Control Técnico)', 5, 3, 'Reactivos e Insumos: Los reactivos, calibradores y materiales de control se encuentran vigentes, correctamente identificados y dentro de las condiciones de almacenamiento establecidas.'),
    ('ANALITICA', 'FASE ANALÍTICA (Procesamiento y Control Técnico)', 5, 4, 'Mantenimiento de Equipos: Se ejecutaron y registraron las actividades de mantenimiento, verificaciones operativas y controles definidos para el equipamiento utilizado.'),
    ('ANALITICA', 'FASE ANALÍTICA (Procesamiento y Control Técnico)', 5, 5, 'Condiciones Ambientales: Las temperaturas de refrigeradores, congeladores y del ambiente de la sala están registradas y en rango.'),
    ('POSTANALITICA', 'FASE POSTANALÍTICA (Validación, Reporte y Disposición)', 6, 1, 'Validación de resultados: El personal autorizado revisa la coherencia clínica de los resultados antes de liberarlos.'),
    ('POSTANALITICA', 'FASE POSTANALÍTICA (Validación, Reporte y Disposición)', 6, 2, 'Delta Check: Se analizan los cambios abruptos en resultados comparándolos con el histórico del paciente (si existe).'),
    ('POSTANALITICA', 'FASE POSTANALÍTICA (Validación, Reporte y Disposición)', 6, 3, 'Valores Críticos: Los resultados de riesgo vital se notificaron de inmediato por teléfono y se registró: fecha, hora, emisor y receptor.'),
    ('POSTANALITICA', 'FASE POSTANALÍTICA (Validación, Reporte y Disposición)', 6, 4, 'Monitoreo de Tiempos (TAT): Los resultados urgentes y de rutina se emitieron dentro de los tiempos límite establecidos.'),
    ('POSTANALITICA', 'FASE POSTANALÍTICA (Validación, Reporte y Disposición)', 6, 5, 'Destino de la Muestra: Las muestras procesadas se resguardaron en condiciones adecuadas y los desechos biológicos se descartaron según la norma.'),
    ('DOCUMENTOS', 'CONTROL DE DOCUMENTOS Y REGISTROS', 7, 1, 'Los documentos aplicables al área se encuentran disponibles para consulta, corresponden a la versión vigente autorizada y son utilizados por el personal durante la ejecución de sus actividades.'),
    ('DOCUMENTOS', 'CONTROL DE DOCUMENTOS Y REGISTROS', 7, 2, 'Los registros generados en el área se encuentran completos, legibles, con la información requerida, debidamente identificados y conservan la trazabilidad necesaria para demostrar la ejecución de las actividades realizadas.'),
    ('NO_CONFORME', 'CONTROL DE PRODUCTOS NO CONFORMES', 8, 1, 'Las muestras, reactivos, materiales, insumos o equipos identificados como no conformes se encuentran claramente identificados, segregados o controlados conforme a los procedimientos aplicables del laboratorio.'),
    ('NO_CONFORME', 'CONTROL DE PRODUCTOS NO CONFORMES', 8, 2, 'Cuando aplica, se observa evidencia de la aplicación de los criterios de aceptación, rechazo, disposición, corrección o seguimiento establecidos por el laboratorio para el tratamiento de productos o servicios no conformes.'),
    ('RIESGOS', 'GESTIÓN DE RIESGOS Y OPORTUNIDADES', 9, 1, 'Los riesgos, incidentes, desviaciones u oportunidades de mejora identificados durante la operación son comunicados, documentados y gestionados conforme a los procedimientos establecidos por el laboratorio.')
) AS src(section_code, section_title, section_order, item_no, item_text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_supervision_form_items i
   WHERE i.form_code = 'ANA-REG-060' AND i.form_revision = 1
     AND i.section_code = src.section_code AND i.item_no = src.item_no
);

-- ---------------------------------------------------------------------------
-- 2. Items que NO aplican a un puesto (preconfiguracion de Calidad/RH)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_position_supervision_na_items (
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.rh_supervision_form_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (position_id, item_id)
);

-- ---------------------------------------------------------------------------
-- 3. Cabecera de la lista
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_checklists (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NULL,
  form_code TEXT NOT NULL DEFAULT 'ANA-REG-060',
  form_revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  enrollment_id BIGINT NULL REFERENCES public.rh_induction_enrollments(id) ON DELETE SET NULL,
  supervision_date DATE NOT NULL,
  supervision_type TEXT NOT NULL DEFAULT 'PROGRAMADA',
  area_name TEXT NULL,
  branch_name TEXT NULL,
  supervisor_name TEXT NOT NULL,
  supervisor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  area_responsible_name TEXT NOT NULL DEFAULT '',
  -- Totales sellados al cerrar (en borrador se calculan en vivo).
  items_evaluated INTEGER NULL,
  items_compliant INTEGER NULL,
  items_non_compliant INTEGER NULL,
  compliance_pct NUMERIC(5,2) NULL,
  conclusion TEXT NULL,
  passed BOOLEAN NULL,
  sgc_follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  sgc_reference TEXT NULL,
  supervisor_comments TEXT NULL,
  -- La lista que decide la Fase 6 de la inscripcion (una vigente por inscripcion).
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  supervisor_signature_path TEXT NULL,
  area_responsible_signature_path TEXT NULL,
  employee_signature_path TEXT NULL,
  closed_at TIMESTAMPTZ NULL,
  closed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_supervision_checklists_status CHECK (status IN ('DRAFT', 'CLOSED')),
  CONSTRAINT chk_rh_supervision_checklists_type CHECK (supervision_type IN ('PROGRAMADA', 'NO_PROGRAMADA')),
  CONSTRAINT chk_rh_supervision_checklists_conclusion
    CHECK (conclusion IS NULL OR conclusion IN ('CONFORME', 'CONFORME_CON_OBSERVACIONES', 'REQUIERE_SEGUIMIENTO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_supervision_checklists_folio
  ON public.rh_supervision_checklists (folio) WHERE folio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_employee
  ON public.rh_supervision_checklists (employee_id, position_id);
CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_enrollment
  ON public.rh_supervision_checklists (enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_status
  ON public.rh_supervision_checklists (status, supervision_date DESC);

-- ---------------------------------------------------------------------------
-- 4. Resultado por item
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_supervision_checklist_results (
  checklist_id BIGINT NOT NULL REFERENCES public.rh_supervision_checklists(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.rh_supervision_form_items(id) ON DELETE RESTRICT,
  result TEXT NULL,
  observations TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (checklist_id, item_id),
  CONSTRAINT chk_rh_supervision_checklist_results_result CHECK (result IS NULL OR result IN ('SI', 'NO', 'NA'))
);

-- ---------------------------------------------------------------------------
-- 5. Tipo documental del PDF archivado (seccion Competencias laborales, junto
--    al REH-REG-003). Sin vigencia: es evidencia historica.
-- ---------------------------------------------------------------------------
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT s.id, 'SUPERVISION_ANA060', 'Lista de verificación de Supervisión (ANA-REG-060)',
       'Supervision documentada del desempeno del colaborador en su puesto (Fase 6 de Induccion y supervision periodica).',
       FALSE, FALSE, FALSE, TRUE, 6
FROM (SELECT id FROM public.document_sections WHERE UPPER(code) = 'WORK_COMPETENCIES') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types WHERE UPPER(code) = 'SUPERVISION_ANA060'
);

-- ---------------------------------------------------------------------------
-- 6. RBAC: permiso propio (los responsables de area que apliquen la lista
--    reciben un rol con este permiso), otorgado a los roles RH que ya
--    administran induccion y competencia.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES ('RH.SUPERVISION.MANAGE', 'RH',
          'Supervision: aplicar, cerrar y consultar listas de verificacion ANA-REG-060 (Fase 6 de Induccion y supervision de area)')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES ('RH_ADMIN', 'RH.SUPERVISION.MANAGE'), ('RH_EDITOR', 'RH.SUPERVISION.MANAGE')) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- Registro en el runner de migraciones (para que 'npm run migrate' no la reaplique):
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261016_01_rh_supervision_checklist.sql', '1d57b25fcbd44a3446f31dcb290d300af35f657d454959963f24566b12634812') ON CONFLICT (filename) DO NOTHING;
