# Roadmap — Módulo Proveedores

Gestión documental de proveedores: control y trazabilidad de contratos, convenios,
pólizas y demás documentos asociados a cada proveedor, con **vigencia y derogación**
(motor de versiones tipo Calidad) y **alertas de vencimiento** configurables.

Estado: **MÓDULO COMPLETO Y VERIFICADO (backend end-to-end vía API).** Backend y
frontend compilan limpio (`npm run build` en ambos). Smoke test end-to-end contra la
BD local (2026-08-13): catálogo de proveedores/categorías, carga de documento,
reemplazo con derogación automática, trazabilidad (histórico), visor seguro del PDF,
CRUD de categorías (con 409 por dependencia), CRUD de destinatarios de alerta, y el
scheduler de vencimiento (envío real de correo verificado en `notification_log`).
RBAC probado en ambos sentidos (401 sin token, 403 sin permiso, 200 con
`PROVIDERS_ADMIN`). Se encontraron y corrigieron 2 bugs de formato de fecha durante la
prueba (ver sección 9). **Falta únicamente la prueba visual en navegador** (todo lo
demás se probó contra la API real) y el commit. Sin commitear.
Fecha de diseño: 2026-08-13. Fecha de implementación y QA backend: 2026-08-13.

---

## 1. Principio rector

**Todo es aditivo.** Tablas nuevas, permisos nuevos, páginas nuevas.

- **NO** se toca `helpdesk_suppliers`: el módulo la reutiliza tal cual como catálogo
  maestro de proveedores (ya tiene `rfc`, `contact`, `is_active`). El combo "Proveedor"
  del formulario de activos sigue funcionando sin cambios.
- **NO** se reutiliza literalmente `document.service.ts` (está acoplado a `documents`/SGC);
  se **replica su patrón** de estado (`active`/`superseded`/`inactive`) y encadenamiento
  (`replaces_document_id`/`replaced_by_document_id`), ya probado en producción.
- El alcance de "proveedores" es el mismo universo que ya usa Activos/mantenimiento
  (no proveedores de otras áreas).

## 2. Decisiones confirmadas

| # | Decisión | Consecuencia de diseño |
|---|---|---|
| 1 | Módulo **nuevo e independiente** en el sidebar (no una pestaña dentro de Activos). | RBAC propio (`PROVIDERS`), rutas `/providers/*`, `ModuleCode` propio. |
| 2 | La derogación usa el **motor de versiones** (igual que Calidad), no fechas sueltas. | Subir un documento que "reemplaza a X" encadena `replaces_document_id`/`replaced_by_document_id` y pasa X a `superseded` en una transacción, igual que `document.service.ts:317-431`. |
| 3 | El catálogo de proveedores es **`helpdesk_suppliers`, sin tocar**. | Cero riesgo sobre Activos. El nuevo módulo le agrega una capa de gestión documental encima (FK), no lo reemplaza. |
| 4 | Las alertas de vencimiento van a una **lista de destinatarios configurable** (no a un responsable por documento). | Nueva tabla + pantalla `/providers/config` (solo `PROVIDERS_ADMIN`) para dar de alta/baja usuarios que reciben el aviso. |

## 3. Modelo de datos

Migración `sql/20260813_01_providers_module.sql` (aditiva) — **aplicada en BD local, verificada**.

### 3.1 `provider_document_categories` — clasificación

```sql
CREATE TABLE IF NOT EXISTS public.provider_document_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_document_categories_code
  ON public.provider_document_categories (UPPER(code));
```

Seed sugerido: `CONTRATO`, `CONVENIO`, `POLIZA`, `CERTIFICADO_ISO_PROVEEDOR`,
`CONFIDENCIALIDAD`, `OTRO`.

### 3.2 `provider_documents` — el corazón del módulo

```sql
CREATE TABLE IF NOT EXISTS public.provider_documents (
  id BIGSERIAL PRIMARY KEY,

  provider_id BIGINT NOT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE RESTRICT,
  category_id BIGINT NOT NULL REFERENCES public.provider_document_categories(id) ON DELETE RESTRICT,

  title TEXT NOT NULL,
  description TEXT NULL,

  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,

  document_date DATE NULL,       -- fecha del documento/firma
  effective_from DATE NULL,      -- vigencia desde
  expiry_date DATE NULL,         -- vigencia hasta / vencimiento

  status TEXT NOT NULL DEFAULT 'active',
  replaces_document_id BIGINT NULL REFERENCES public.provider_documents(id) ON DELETE SET NULL,
  replaced_by_document_id BIGINT NULL REFERENCES public.provider_documents(id) ON DELETE SET NULL,

  reminder_sent_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_provider_documents_status CHECK (status IN ('active', 'inactive', 'superseded'))
);

CREATE INDEX IF NOT EXISTS ix_provider_documents_provider ON public.provider_documents (provider_id);
CREATE INDEX IF NOT EXISTS ix_provider_documents_expiry ON public.provider_documents (expiry_date)
  WHERE status = 'active';
```

Mismo flujo de reemplazo que `replaceDocumentWithNewVersion()`: `SELECT ... FOR UPDATE`
del documento previo, valida `status = 'active'` y sin `replaced_by_document_id` ya
seteado, inserta el nuevo con `replaces_document_id`, actualiza el previo a
`superseded` + `replaced_by_document_id`. Storage en filesystem local
(`uploads/provider-documents/`), igual que el resto del proyecto.

### 3.3 `provider_notification_recipients` — configuración de alertas

```sql
CREATE TABLE IF NOT EXISTS public.provider_notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
```

### 3.4 RBAC (mismo patrón que `20260722_01_quality_reading_room.sql`)

- `modules`: fila `PROVIDERS`.
- `permissions`: `PROVIDERS.CATALOG.MANAGE`, `PROVIDERS.DOCUMENTS.MANAGE`,
  `PROVIDERS.DOCUMENTS.VIEW`, `PROVIDERS.CONFIG.MANAGE`.
- `roles`: `PROVIDERS_ADMIN` (todos los permisos), `PROVIDERS_EDITOR`
  (`DOCUMENTS.MANAGE` + `DOCUMENTS.VIEW`), `PROVIDERS_VIEWER` (`DOCUMENTS.VIEW`).
- `role_permissions`: join por código, igual que el ejemplo de Sala de Lectura.

## 4. Alertas de vencimiento

Nuevo `provider-document-scheduler.service.ts`, mismo esqueleto que
`helpdesk-service-scheduler.service.ts` (`node-cron`, reutiliza
`sendGenericNotification` y el SMTP ya configurado en `.env`):

- Ventana configurable por env `PROVIDER_DOCUMENT_REMINDER_DAYS` (default 30 — un
  contrato suele requerir más antelación que un mantenimiento).
- Consulta `provider_documents` con `status = 'active'`,
  `expiry_date <= CURRENT_DATE + N`, `reminder_sent_at IS NULL`.
- Notifica por correo a todos los `user_id` en `provider_notification_recipients`.
- Idempotente: marca `reminder_sent_at` al enviar.
- Se registra en `index.ts` junto a los demás schedulers
  (`startServiceReminderScheduler`, `startQualityReadingScheduler`, etc.).
- Apagable con `PROVIDER_DOCUMENT_REMINDER_ENABLED=false`.

## 5. Frontend

- `ModuleCode` (`types/models.ts`) `+= 'PROVIDERS'`.
- `NAV_CONFIG['PROVIDERS']` (`config/navigation.ts`).
- Rutas en `App.tsx`: `/providers` (lista de proveedores), `/providers/:id` (ficha +
  documento vigente por categoría + histórico), `/providers/config` (destinatarios de
  alerta, solo `PROVIDERS_ADMIN`).
- Componentes: `ProviderDocumentUploadModal` (con selector opcional "reemplaza a..."),
  `ProviderDocumentHistoryModal` (cadena vigente↔derogados, mismo patrón que
  `EmployeeDocumentHistoryModal.tsx` en RH), visor PDF compartido ya existente.

## 6. Estructura de sprints propuesta

| Sprint | Nombre | Entrega | Estado |
| --- | --- | --- | --- |
| 1 | Base de datos + RBAC | Migración (3 tablas + permisos/roles), seed de categorías | `completada`, verificada en BD |
| 2 | Backend: catálogo de proveedores + categorías | `provider-catalog.service.ts` + `provider-catalog.controller.ts`: solo-lectura sobre `helpdesk_suppliers`; CRUD de `provider_document_categories` | `completada`, probada por API (create/update/deactivate/delete + 409) |
| 3 | Backend: motor de documentos/versiones | `provider-document.service.ts` + `provider-document.controller.ts` (subir, reemplazar, ver, histórico), storage en `uploads/provider-documents` | `completada`, probada por API (upload/replace/history/view real) |
| 4 | Backend: alertas de vencimiento + configuración | `provider-document-scheduler.service.ts`, `provider-config.service.ts` (CRUD `provider_notification_recipients`) | `completada`, scheduler probado (envío real de correo confirmado) |
| 5 | Frontend: módulo, listado y ficha de proveedor | Alta de módulo (sidebar/rutas/selector), `ProvidersListPage`, `ProviderDetailPage` | `completada`, build limpio, **sin probar en navegador** |
| 6 | Frontend: subida, reemplazo e histórico | `ProviderDocumentUploadModal`, `ProviderDocumentHistoryModal`, visor PDF (blob) | `completada`, build limpio, **sin probar en navegador** |
| 7 | Frontend: configuración de alertas + QA/cierre | `ProviderCategoriesPage`, `ProviderConfigPage` completos; backend con QA de API completo | `backend QA completo; falta QA visual en navegador` |

## 7. Definición de éxito

- Cada proveedor de `helpdesk_suppliers` tiene una ficha con sus documentos
  clasificados (contrato, póliza, etc.), cada uno con fecha y vigencia.
- Subir una renovación deroga automáticamente la versión anterior y queda trazable
  la cadena completa (vigente + histórico).
- Los usuarios configurados en `/providers/config` reciben aviso por correo cuando un
  contrato está por vencer, sin duplicar envíos.
- Activos sigue funcionando exactamente igual (cero cambios en su código o datos).

## 8. Pendientes antes de dar el módulo por cerrado

1. ~~QA visual en navegador~~ **HECHO (2026-08-19)**, vía Playwright headless: login,
   lista de proveedores, detalle (carga + reemplazo de documento con PDF real), badge
   "por vencer", histórico de trazabilidad, visor PDF protegido, categorías (alta),
   alertas de vencimiento (selector de destinatarios). Sin errores de consola en
   ningún flujo. Se encontraron y corrigieron 3 bugs reales (ver sección 10).
2. Commitear el trabajo (nada de esta sesión está commiteado).
3. Cuando se despliegue: aplicar la migración `20260813_01_providers_module.sql` en
   prod (misma mecánica que el resto del repo, ver `[[redeploy-scripts]]`), y asignar
   los roles `PROVIDERS_*` a los usuarios que correspondan desde `/admin/roles`.
4. **Sembrar `helpdesk_suppliers` en prod si aún está vacía** (memoria previa indicaba
   que esa tabla no tiene seed) — sin proveedores capturados el módulo no tiene nada
   que mostrar.

## 9. QA realizado (2026-08-13, contra BD local, vía API real)

Con el backend corriendo y un usuario de prueba con rol `PROVIDERS_ADMIN` asignado
temporalmente (removido al terminar), se probó por API real — no simulado — cada
endpoint:

- Catálogo: `GET /providers/catalog/providers` (vacío al inicio, refleja proveedor
  sembrado después) y `GET /providers/catalog/categories` (las 6 categorías seed).
- Categorías: crear, editar, desactivar y **borrar definitivo** (200 sin dependencias,
  **409 correcto** al intentar borrar una categoría en uso).
- Documentos: **upload** con PDF real, **replace** (derogación automática: el
  documento anterior quedó `superseded` con `replaced_by_document_id` apuntando al
  nuevo, el nuevo quedó `active` con `replaces_document_id` apuntando al anterior),
  **histórico** (`GET /documents/:id` devuelve la cadena completa vigente+derogados en
  ambas direcciones), **vista segura** (`GET /documents/:id/view` devolvió el PDF real,
  content-type correcto).
- Configuración: alta y listado de destinatarios de alerta.
- **Scheduler**: se sembró un documento con vencimiento a 5 días, se corrió
  `processProviderDocumentReminders()` directamente — detectó el documento, marcó
  `reminder_sent_at` (idempotente), y **el correo se envió de verdad** (confirmado en
  `notification_log` con `status = 'sent'` al destinatario configurado).
- RBAC: 401 sin token, 401 con token inválido, **403 real** al desactivar el rol
  `PROVIDERS_ADMIN` del usuario de prueba, 200 al reactivarlo.

**2 bugs encontrados y corregidos durante el QA** (ambos por la misma causa raíz: las
columnas `DATE` de Postgres las devuelve `pg` como objetos `Date`, no como texto —
`String(date)` da un `toString()` legible por humanos, no `YYYY-MM-DD`):

1. `provider-document.service.ts` (`mapDocumentRow`): `document_date`/`effective_from`/
   `expiry_date` llegaban al frontend como `"Thu Jan 15 2026 00:00:00 GMT-0600..."` en
   vez de `"2026-01-15"` — habría roto los `<input type="date">` del formulario y el
   parseo en las tarjetas. Fix: `toISOString().slice(0, 10)` para fechas,
   `toISOString()` para timestamps.
2. `provider-document-scheduler.service.ts` (`formatDate`): el asunto del correo de
   alerta mostraba **"Invalid Date"** en vez de la fecha de vencimiento, por la misma
   causa. Fix: mismo patrón, aceptando `Date | string`.

Todos los datos de prueba (proveedor, documentos, destinatario, asignación de rol) se
limpiaron de la BD local al terminar; las 6 categorías seed quedaron intactas.

## 10. QA visual en navegador (2026-08-19, Playwright headless contra BD local)

Con backend (`:4000`) y frontend (Vite, `:5174`) locales corriendo y un usuario de
prueba (`qa.providers@unilabor.local`, rol `PROVIDERS_ADMIN`, creado y borrado al
terminar) se piloteó el módulo completo con Playwright: login → lista de proveedores
→ detalle → cargar documento (PDF real + fechas) → badge "por vencer" → histórico de
trazabilidad → visor PDF protegido → categorías (alta) → alertas de vencimiento
(selector de destinatarios). Cero errores de consola en cualquier flujo tras las
correcciones.

**3 bugs reales encontrados y corregidos** (ninguno se había visto en el QA por API
del 2026-08-13, porque solo existían en capas de frontend/routing que la API no
ejercita):

1. **El módulo Proveedores era inalcanzable en el navegador para cualquier usuario**,
   pese a que el backend devolvía `availableModules` correctamente. Causa:
   `normalizeModuleAccess` (`unilabor-safedoc-ui/src/api/service.normalizers.ts`)
   filtraba el `code` contra una lista hardcodeada que nunca se actualizó al agregar
   el módulo (`QUALITY | RH | HELPDESK | ADMIN`, sin `PROVIDERS`) — el módulo se
   descartaba en el cliente y `ModuleGuard` rebotaba a `/login` con "Tu cuenta no
   tiene módulos habilitados". Fix: agregar `'PROVIDERS'` a la lista.
2. **El selector de destinatarios en "Alertas de vencimiento" siempre estaba vacío**
   para cualquier `PROVIDERS_ADMIN` sin permisos de RH. Causa: la página llama a
   `GET /employees/linkable-users` (directorio genérico de usuarios del sistema, no
   expedientes de RH) pero la ruta
   (`unilabor-safedoc/src/routes/employee.routes.ts`) solo aceptaba
   `RH.EMPLOYEES.READ`. Fix: agregar `PROVIDERS.CONFIG.MANAGE` al arreglo de permisos
   aceptados, mismo patrón ya usado ahí para `HELPDESK.ASSETS.READ`.
3. **Fechas de documento mostradas con un día de desfase** (cargué vigencia
   19/08/2026 → vencimiento 01/09/2026 y la UI mostraba 18/8/2026 → 31/8/2026).
   Causa: `formatDisplayDate` en `ProviderDetailPage.tsx` y en
   `ProviderDocumentHistoryModal.tsx` hacía `new Date("YYYY-MM-DD")`, que JS
   interpreta como medianoche UTC; al formatear en zona horaria local (México,
   UTC-6) se recorre un día atrás. Mismo patrón de bug ya identificado en el backend
   el 2026-08-13 (ver arriba), esta vez en el frontend. Fix: parsear como
   `` `${value.slice(0,10)}T00:00:00` `` (hora local), igual que ya hacía
   `daysUntil` en el mismo archivo.

Datos de prueba de esta sesión (usuario, rol asignado, proveedor demo, documento
subido, `access_logs` del usuario) limpiados y verificados en 0 tras terminar.

**Módulo ahora sí verificado de punta a punta (API + navegador). Falta únicamente**:
commitear (punto 2 de la sección 8) y los pendientes de despliegue (puntos 3-4).

## 11. Alta/edición propia del catálogo de proveedores (2026-08-19)

**Gap cerrado**: hasta este punto `GET /providers/catalog/providers` era de solo
lectura (ver sección "Qué es y decisiones clave" original) y dar de alta un
proveedor nuevo obligaba a salir del módulo e ir a Activos → Catálogos. Se agregó
alta/edición/desactivación propia, sin tocar cómo Activos consume la misma tabla.

**Backend**: `createProvider` / `updateProvider` / `deactivateProvider` en
`provider-catalog.service.ts` (escriben en `helpdesk_suppliers`: name, description,
rfc, contact — cierra también el gap de que la UI genérica de Activos no exponía
rfc/contact). Controllers nuevos en `provider-catalog.controller.ts`, error mapper
`mapProviderError` en `provider-controller.shared.ts` (400 nombre obligatorio, 409
nombre duplicado — probado con el proveedor real "Sergio Armando"). Rutas nuevas,
todas gated por `PROVIDERS.CATALOG.MANAGE` (mismo permiso que ya protegía
categorías): `POST /catalog/providers`, `PATCH /catalog/providers/:id`,
`POST /catalog/providers/:id/deactivate`. Sin endpoint de borrado definitivo
(riesgo de FK compartida con Activos/movimientos; solo desactivar, igual que
categorías).

**Frontend**: página nueva `ProvidersCatalogPage.tsx` (`/providers/catalog`, permiso
`PROVIDERS.CATALOG.MANAGE`), mismo patrón visual que `ProviderCategoriesPage.tsx`
(tabla + modal crear/editar + confirmar desactivar). Ítem nuevo en el sidebar
"Catálogo de proveedores" (ícono `Building2`) en `navigation.ts`, arriba de
"Categorías de documento". Funciones API nuevas en `service.api-providers.ts`
(`createProviderCatalog`/`updateProviderCatalog`/`deactivateProviderCatalog`).

**Verificado en navegador** (Playwright, cuenta `admin.local@unilabor.mx` con rol
`PROVIDERS_ADMIN`): alta → aparece en la lista, edición → refleja el cambio,
desactivar → badge pasa a "Inactivo" y el botón desaparece, nombre duplicado → 409
con mensaje claro en vez de 500. Cero errores de consola. `tsc --noEmit` (backend)
y `tsc -b` (frontend) limpios. Registro de prueba (`Proveedor Sidebar QA SA de CV`)
limpiado de la BD al terminar; el proveedor real `Sergio Armando` no se tocó.

**Nota de diseño**: ahora hay dos lugares que administran `helpdesk_suppliers`
(Activos → Catálogos, genérico entre muchos catálogos; y Proveedores → Catálogo de
proveedores, dedicado con rfc/contact). Ambos escriben a la misma tabla, sin
conflicto — el `UNIQUE(upper(name))` de la tabla es quien evita duplicados entre
ambos. `PROVIDERS_VIEWER`/`PROVIDERS_EDITOR` no tienen `PROVIDERS.CATALOG.MANAGE`,
así que no ven el ítem ni pueden entrar a la ruta (confirmado contra
`role_permissions`).

**Sin commitear**, igual que el resto del módulo.

## 12. Ficha completa del proveedor: domicilio, sitio web, notas y contactos (2026-08-19)

A petición del usuario, el modal de alta/edición se amplió con tabs para no
saturar la pantalla: **Datos generales** (nombre, RFC, sitio web, descripción,
notas) · **Domicilio** (calle, colonia, CP, ciudad, estado, país) · **Contactos**
(lista de contactos con nombre/puesto/teléfono/correo, uno marcable como
"principal").

**Migración** `20260819_01_provider_catalog_details.sql`: agrega columnas
NULL-ables a `helpdesk_suppliers` (website, address_street, address_neighborhood,
address_city, address_state, address_zip, address_country, notes — Activos las
ignora, sigue igual) y crea la tabla `provider_contacts` (FK a
`helpdesk_suppliers` con `ON DELETE CASCADE`, índice único parcial
`WHERE is_primary = TRUE` que garantiza como máximo un contacto principal por
proveedor a nivel de BD). Aplicada en local.

**Backend**: `ProviderSummary`/`ProviderPayload` extendidos con los campos
nuevos. CRUD de contactos (`listProviderContacts`/`createProviderContact`/
`updateProviderContact`/`deleteProviderContact`) en `provider-catalog.service.ts`
— marcar un contacto como principal corre en una transacción (`BEGIN`/`COMMIT`,
mismo patrón que `replaceProviderDocumentWithNewVersion`) que primero quita el
flag a cualquier otro contacto del proveedor, evitando el 23505 del índice único.
Rutas nuevas, todas bajo `/providers/catalog/providers/:id/contacts` y
`/providers/catalog/contacts/:id`, gated por `PROVIDERS.CATALOG.MANAGE` (lectura
por `PROVIDERS.CATALOG.READ`).

**Frontend**: `ProvidersCatalogPage.tsx` reescrita con modal de 3 tabs (ancho
`max-w-2xl`, contenido con scroll interno). El tab **Contactos** está
deshabilitado al dar de alta un proveedor nuevo (los contactos necesitan un
`provider_id` que aún no existe) — al guardar el alta, el modal **no se cierra**:
cambia a modo edición con el proveedor recién creado y salta directo al tab
Contactos, para que el siguiente paso natural sea agregar el primer contacto sin
tener que reabrir el modal. En edición sí cierra al guardar, igual que antes.

**Verificado en navegador** (Playwright, `admin.local@unilabor.mx`): alta con
domicilio completo → aparece en la lista (columna "Ciudad" nueva) → modal se
queda abierto en modo edición con tab Contactos habilitado → se agregaron 2
contactos (uno marcado principal, estrella visible) → reabrir el modal conserva
domicilio y contactos → editar un contacto y marcarlo como principal quita
correctamente la estrella del anterior (confirma la transacción) → desactivar/
borrar limpian en cascada (`provider_contacts` quedó en 0 tras borrar el
proveedor de prueba). Cero errores de consola. `tsc -b` (frontend) y
`tsc --noEmit` (backend) limpios.

**Sin commitear.**

## 13. Paginación server-side en las listas de proveedores (2026-08-19)

Ni `/providers` (lista para navegar documentos) ni `/providers/catalog` (alta/
edición) tenían paginación — cargaban todas las filas y filtraban en el cliente.
Se adoptó el patrón ya establecido en el resto del repo (el mismo que usa
`listEmployees`/`RhEmployeesPage`): utilidad `resolvePagination`/
`buildPaginatedResult`/`buildIlikeSearch` (`utils/pagination.ts`) en el backend,
hook `usePaginatedList` + componente `Pagination` en el frontend.

**Backend**: `listProviders` (`provider-catalog.service.ts`) pasó de
`(includeInactive) => ProviderSummary[]` a
`(options: {page, limit, search, includeInactive}) => PaginatedResult<ProviderSummary>`.
Paginación **opt-in** (mismo contrato que empleados): si el cliente no manda
`page`/`limit`, devuelve todas las filas en una sola "página" — no rompe otros
consumidores futuros que no paginen. Búsqueda server-side por nombre o RFC
(`ILIKE`). El controller ahora responde `{data, pagination}` en vez de
`{providers: [...]}` — cambio de contrato aceptable porque los únicos 2
consumidores (`ProvidersListPage`, `ProvidersCatalogPage`) se actualizaron en el
mismo cambio.

**Frontend**: `listProvidersCatalog` (sin paginar) se reemplazó por
`listProvidersPaginated` (mismo patrón que `listEmployeesPaginated`). Ambas
páginas usan `usePaginatedList` (pageSize 20) + `<Pagination>`; el catálogo pasa
`includeInactive: true` fijo (constante, no es un filtro que el usuario cambie).
El filtrado/ordenado que antes se hacía en el cliente (`useMemo` con `.filter`/
`.sort`) se eliminó — ya lo hace el backend.

**Verificado en navegador** (Playwright, `admin.local@unilabor.mx`): se sembraron
25 proveedores de prueba (total 26) para forzar 2 páginas reales en ambas
pantallas — "Mostrando 1–20 de 26" / "Página 1 de 2", botón Siguiente lleva a la
página 2 con los 6 restantes, Anterior/Siguiente se deshabilitan correctamente en
los extremos, la búsqueda ("Sergio") resetea a página 1 y filtra server-side.
Cero errores de consola. `tsc -b` (frontend) y `tsc --noEmit` (backend) limpios.
Los 25 proveedores de prueba se borraron al terminar (BD local quedó con el único
proveedor real, `Sergio Armando`).

**Sin commitear.**
