# Roadmap — Módulo Sala de Lectura (Calidad)

Lectura obligatoria y firma autógrafa de los documentos del **Sistema de Gestión de
Calidad**. El responsable de Calidad (o de RH) toma un documento **vigente** del SGC,
lo publica a lectura y asigna lectores; cada lector debe recorrerlo completo antes de
poder firmarlo, y la copia firmada queda como evidencia **en el repositorio de Calidad**.

Estado: **diseño aprobado, sin implementar**. Fecha de diseño: 2026-07-22.

---

## 1. Principio rector

**Todo es aditivo.** Tablas nuevas, permisos nuevos, páginas nuevas.

- **NO** se modifica la tabla `documents` ni el flujo documental de Calidad.
- **NO** se elimina ningún documento, por ningún motivo (regla del negocio, se hace
  técnica en SL-01).
- **NO** se toca el módulo RH de acuses (`rh_institutional_documents`,
  `rh_document_acknowledgements`), que sigue operando en producción tal cual.

La sala de lectura **solo lee** los documentos del SGC. Nunca los modifica, mueve ni borra.

## 2. Decisiones confirmadas

| # | Decisión | Consecuencia de diseño |
|---|---|---|
| 1 | La copia firmada **se queda en el repositorio de Calidad**, no va al expediente del colaborador. Es un documento del SGC, no del trabajador. | No se escribe en `employee_documents`. **El módulo no depende del vínculo usuario↔empleado**, así que ningún lector queda bloqueado por un dato administrativo faltante. |
| 2 | Solo son elegibles los documentos **vigentes** (`status = 'active'`). Un documento derogado no se pone a leer. | Guarda al publicar; y al ser reemplazado, la publicación se cierra sola (SL-06). |
| 3 | **Se reusa el motor** de lectura y firma ya probado en producción. | Extracción a piezas compartidas, sin cambiar el comportamiento de RH. |
| 4 | Los lectores se asignan **individualmente, por área/unidad, o a todos**. | El targeteo usa `employees` solo para resolver a quiénes; el acuse se ancla a `users`. |

## 3. Modelo de datos

Migración `sql/20260722_01_quality_reading_room.sql` (aditiva, 2 tablas + permisos).
`documents.id` es **UUID**.

### 3.1 `quality_reading_publications` — el documento puesto a lectura

```sql
CREATE TABLE IF NOT EXISTS public.quality_reading_publications (
  id BIGSERIAL PRIMARY KEY,

  -- La fuente es el documento del SGC. RESTRICT: una publicacion existente
  -- impide que el documento desaparezca (ver la guarda de SL-01).
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,

  -- Sellados al publicar: la evidencia se ancla a este archivo exacto. El
  -- documento del SGC puede renombrarse despues; la evidencia no se mueve.
  title_snapshot TEXT NOT NULL,
  source_sha256  CHAR(64) NOT NULL,
  pages_total    INTEGER NOT NULL,

  -- Reglas de la lectura, congeladas para todos los lectores de esta publicacion.
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
  CONSTRAINT chk_qrp_deadline    CHECK (default_deadline_hours BETWEEN 1 AND 8760)
);

-- Una sola publicacion abierta por documento. Como cada version del SGC es su
-- propia fila en `documents`, esto permite tener abierta la v3 mientras la v2
-- conserva cerrada su publicacion historica con toda su evidencia.
CREATE UNIQUE INDEX IF NOT EXISTS ux_qrp_open_document
  ON public.quality_reading_publications (document_id)
  WHERE status = 'open';
```

### 3.2 `quality_reading_acknowledgements` — un lector dentro de una publicación

```sql
CREATE TABLE IF NOT EXISTS public.quality_reading_acknowledgements (
  id BIGSERIAL PRIMARY KEY,

  publication_id BIGINT NOT NULL
    REFERENCES public.quality_reading_publications(id) ON DELETE RESTRICT,

  -- El lector es quien firma, o sea un USUARIO. `employee_id` es solo una foto
  -- para reportar por area; que sea NULL no impide leer ni firmar.
  user_id     UUID   NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  employee_id BIGINT NULL     REFERENCES public.employees(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending',

  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at        TIMESTAMPTZ NOT NULL,
  started_at         TIMESTAMPTZ NULL,
  read_completed_at  TIMESTAMPTZ NULL,
  signed_at          TIMESTAMPTZ NULL,

  -- Evidencia de lectura. `pages_seen` solo guarda paginas que YA calificaron.
  pages_total          INTEGER NOT NULL,
  pages_seen           INTEGER[] NOT NULL DEFAULT '{}',
  min_seconds_per_page INTEGER NOT NULL,
  active_seconds       INTEGER NOT NULL DEFAULT 0,

  -- Contabilidad del heartbeat, llevada por el SERVIDOR. El cliente solo reporta
  -- en que pagina esta, nunca cuantos segundos lleva.
  current_page         INTEGER NULL,
  current_page_seconds INTEGER NOT NULL DEFAULT 0,
  last_progress_at     TIMESTAMPTZ NULL,

  -- Firma y sellado. `signed_file_path` es la copia firmada, que vive en el
  -- almacenamiento de evidencias de Calidad (NO se inserta en `documents`).
  signed_file_path TEXT NULL,
  signature_path   TEXT NULL,
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
  CONSTRAINT chk_qra_pages_total CHECK (pages_total >= 1),
  CONSTRAINT chk_qra_current_page CHECK (
    current_page IS NULL OR (current_page BETWEEN 1 AND pages_total)
  ),
  -- Un acuse firmado debe traer su evidencia completa.
  CONSTRAINT chk_qra_signed_evidence CHECK (
    status <> 'signed'
    OR (signed_at IS NOT NULL AND signed_file_path IS NOT NULL AND signed_sha256 IS NOT NULL)
  )
);

-- A lo sumo un acuse VIGENTE por (publicacion, lector). Los estados terminales
-- no bloquean reasignar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_qra_active
  ON public.quality_reading_acknowledgements (publication_id, user_id)
  WHERE status IN ('pending', 'in_progress', 'read');
```

Índices adicionales: `publication_id`, `user_id`, `status`, `deadline_at`.

### 3.3 Almacenamiento de evidencia

Las copias firmadas van a `uploads/quality-reading-evidence/`, separadas de los PDFs
del SGC. **No se insertan filas en `documents`**: el repositorio documental controla
documentos vigentes del sistema, no archiva cientos de copias firmadas. La evidencia
se consulta y descarga desde el módulo de sala de lectura.

## 4. Permisos y acceso al módulo

Recordatorio del mecanismo: **el acceso a un módulo se deriva de los permisos**
(`permission.service.ts`, `buildSnapshot`). Basta un permiso `QUALITY.*` para que
Calidad aparezca en el selector de módulos del usuario.

Permisos nuevos:

| Código | Para qué |
|---|---|
| `QUALITY.READING.MANAGE` | Publicar documentos a lectura, asignar lectores, ver el tablero de seguimiento y descargar evidencia. |
| `QUALITY.SELF.READING` | Ver la propia sala de lectura, leer y firmar. |

Dos roles nuevos, ambos del módulo Calidad (`roles.module_id`), asignables a cualquier
usuario porque la relación usuario↔roles es M:N:

- **`QUALITY_READING_MANAGER`** — publica lecturas, asigna lectores y ve el tablero.
  Se asigna **a las personas concretas** que van a operar la sala de lectura, sean de
  Calidad o de RH.
- **`QUALITY_READER`** — solo lee y firma. Es el rol del colaborador; entra a Calidad
  y ahí únicamente ve su sala de lectura.

Asignación de permisos a roles:

| Rol | MANAGE | SELF | Nota |
|---|---|---|---|
| `QUALITY_READING_MANAGER` (nuevo) | ✅ | ✅ | Se otorga persona por persona (Calidad o RH) |
| `QUALITY_READER` (nuevo) | — | ✅ | El colaborador que solo debe leer |
| `QUALITY_ADMIN` | ✅ | ✅ | Ya tiene el módulo: no hay cambio visible |
| `QUALITY_EDITOR` | — | ✅ | Publicar requiere el rol dedicado |
| `QUALITY_VIEWER` | — | ✅ | |
| `RH_ADMIN` | — | — | **Sin cambios.** RH no recibe permisos de Calidad por el solo hecho de ser RH |

**Por qué un rol dedicado y no un permiso a `RH_ADMIN`** (decisión del 2026-07-22):
como el acceso a módulos se deriva de los permisos, darle `QUALITY.READING.MANAGE` a
todo `RH_ADMIN` haría aparecer Calidad en su selector de módulos. Y como el selector
**se salta cuando el usuario tiene un solo módulo**
(`ModuleSelectorPage.tsx`), esos usuarios pasarían de entrar directo a RH a tener que
elegir módulo en cada inicio de sesión — un cambio de rutina para gente que quizá nunca
publique una lectura. Con el rol dedicado, eso solo le ocurre a quien de verdad va a
usar la función, se avisa antes, y quitar el rol revierte el efecto por completo.

## 5. Superficies

**Gestión** — `/quality/reading-room`, permiso `QUALITY.READING.MANAGE`:
lista de publicaciones con avance (asignados / leídos / firmados / vencidos), publicar
desde un documento vigente, asignar lectores, cancelar acuses no firmados, descargar
evidencia individual o el paquete de la publicación.

**Lector** — `/quality/my-readings` ("Sala de lectura"), permiso `QUALITY.SELF.READING`:
lista de pendientes con plazo, visor instrumentado con barra de avance y "te falta la
página N", y paso de firma. Reusa `PdfSafeViewer` con su prop opcional `tracking`.

Ambas rutas van con `PermissionGate` (nunca `RoleGate`), y las entradas de sidebar
filtradas por el mismo permiso.

## 6. Reuso del motor

Se extrae a piezas compartidas, **sin cambiar el comportamiento de RH**:

| Pieza a extraer | Origen | Qué encapsula |
|---|---|---|
| `reading-progress.engine` | `rh-document-acknowledgement.service.ts` | Crédito del latido con reloj del servidor (tope 12 s), calificación de página por permanencia, transición a `read`. |
| `signature-annex.pdf` | `rh-acknowledgement-pdf.service.ts` | Hoja anexa con firma, declaración, sha256 de origen y bitácora de lectura. Se parametriza el texto de la declaración. |
| `signature-image`, `file-storage` | `utils/` | Ya son compartidos, se usan tal cual. |

RH pasa a consumir las piezas extraídas. Los tests existentes son la red: cualquier
cambio de comportamiento en el motor de RH debe salir en rojo.

## 7. Sprints

| Sprint | Alcance | Entregable verificable |
|---|---|---|
| **SL-01** | Migración (2 tablas), permisos, roles `QUALITY_READING_MANAGER` y `QUALITY_READER`. **Guarda de integridad**: bloquear con 409 el borrado de un documento con publicaciones (hace técnica la regla "no se borra ningún documento"). Gate de `/quality/documents` y `/quality/dashboard` con `QUALITY.DOCUMENTS.READ`. | Un lector con solo `QUALITY.SELF.READING` entra a Calidad y no ve nada más. Intentar borrar un documento publicado devuelve 409. |
| **SL-02** | Extracción del motor a piezas compartidas; RH las consume. Sin cambio funcional. | Tests de RH verdes; acuses de RH intactos en prod. |
| **SL-03** | Publicar a lectura (solo documentos `active`, sella sha256 + páginas) y asignar lectores en las 3 formas. Tablero de seguimiento. | Calidad publica un documento y asigna a todos; el tablero muestra el avance. |
| **SL-04** | Sala de lectura del colaborador: visor instrumentado, gate de lectura, firma, copia firmada al repositorio de evidencias de Calidad. | Un lector completa el ciclo y su PDF firmado queda descargable desde el tablero. |
| **SL-05** | Recordatorios (≤24 h) y vencimientos automáticos, reusando el scheduler. | Cron corriendo; un acuse vencido pasa a `expired` solo. |
| **SL-06** | Re-lectura por versión: al reemplazarse un documento, se cierra su publicación y se ofrece republicar la nueva versión a los mismos lectores. | Reemplazar un documento propone la nueva ronda con un clic. |

SL-06 es el diferenciador: convierte la sala de lectura en control de documentos real,
no en un archivero de firmas.

## 8. Guardas y riesgos

- **Borrado de documentos**: 409 si tiene publicaciones. La FK `RESTRICT` es el
  segundo cinturón a nivel de base de datos.
- **Solo documentos vigentes**: al publicar se valida `status = 'active'`.
- **Anti-fraude**: se conserva íntegro el principio del motor de RH — el cliente
  reporta la página, **el servidor mide el tiempo**. El gate del front es UX; la
  validación real es de servidor. Firmar exige `status = 'read'` verificado en servidor.
- **Archivo cambiado**: si el sha256 del PDF fuente difiere del sellado al publicar,
  se rechaza la firma (guarda equivalente a `RH_ACK_SOURCE_CHANGED`).
- **Evidencia inmutable**: `ON DELETE RESTRICT` en publicación y usuario; los acuses
  firmados nunca se cancelan ni se borran.

## 9. Trazabilidad ISO 15189 / 9001

Lo que este módulo produce como evidencia auditable:

- Quién debía leer qué versión de qué documento, y con qué plazo.
- Bitácora de lectura por página con tiempos medidos por el servidor.
- Declaración firmada de forma autógrafa, con sha256 del documento origen y del
  documento firmado.
- Matriz de difusión por documento: asignados, leídos, firmados, vencidos.
