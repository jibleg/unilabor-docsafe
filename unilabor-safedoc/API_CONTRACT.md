# API Contract - SafeDoc Backend

Fecha de corte del contrato: 2026-04-07

## 1) Base del API

- Base URL local: `http://localhost:4000`
- Prefix de API: `/api`
- Formato de error estandar (general): `{ "message": "..." }`

## 2) Autenticacion

- Header requerido en endpoints protegidos:
  - `Authorization: Bearer <jwt>`

- Flujo de login:
  - `POST /api/auth/login`
  - Body:
```json
{
  "email": "admin@unilabor.mx",
  "password": "admin123"
}
```
  - Response 200 (ejemplo):
```json
{
  "message": "Ingreso exitoso",
  "token": "jwt...",
  "user": {
    "id": "uuid-or-id",
    "name": "Nombre Usuario",
    "email": "admin@unilabor.mx",
    "role": "ADMIN",
    "mustChangePassword": true
  }
}
```

- Flujo de recuperacion de contrasena:
  - `POST /api/auth/recover-password`
  - Body:
```json
{
  "email": "admin@unilabor.mx"
}
```
  - Response 200:
```json
{
  "message": "Si el correo existe y esta activo, recibiras una contrasena temporal para recuperar el acceso"
}
```
  - Notas:
    - Endpoint publico, no requiere JWT.
    - No revela si el correo existe o no.
    - Si el correo corresponde a un usuario activo, el sistema genera una contrasena temporal, la envia por email y marca `must_change_password = true`.

## 3) Regla global de seguridad (mustChangePassword)

Si el JWT trae `mustChangePassword=true`, cualquier endpoint protegido responde:

- `428 Precondition Required`
```json
{
  "message": "Debes cambiar tu contrasena temporal para continuar",
  "mustChangePassword": true
}
```

Unica excepcion permitida con ese token:
- `PATCH /api/users/change-password`

Body:
```json
{
  "newPassword": "NuevaClaveSegura123*"
}
```

Response 200:
```json
{
  "message": "Contrasena actualizada correctamente"
}
```

## 3.1) Recuperacion publica de contrasena

### `POST /api/auth/recover-password`

Body:
```json
{
  "email": "usuario@example.com"
}
```

Response 200:
```json
{
  "message": "Si el correo existe y esta activo, recibiras una contrasena temporal para recuperar el acceso"
}
```

Notas:
- No requiere autenticacion.
- Si el usuario existe y esta activo, el backend envia una contrasena temporal al correo registrado.
- La cuenta queda con `must_change_password = true`.
- Si el correo no existe, el backend responde exactamente el mismo mensaje por seguridad.

## 4) Roles y permisos (resumen)

| Endpoint | ADMIN | EDITOR | VIEWER |
|---|---|---|---|
| `POST /api/auth/login` | Si | Si | Si |
| `POST /api/auth/recover-password` | Si | Si | Si |
| `POST /api/users` | Si | No | No |
| `GET /api/users` | Si | Si | No |
| `PATCH /api/users/:id` | Si | No | No |
| `PATCH /api/users/:id/reset-password` | Si | No | No |
| `DELETE /api/users/:id` | Si | No | No |
| `GET /api/users/:id/categories` | Si | Si | No |
| `PUT /api/users/:id/categories` | Si | Si | No |
| `GET /api/users/me` | Si | Si | Si |
| `GET /api/users/me/categories` | Si | Si | Si |
| `PATCH /api/users/me/avatar` | Si | Si | Si |
| `GET /api/users/me/avatar` | Si | Si | Si |
| `DELETE /api/users/me/avatar` | Si | Si | Si |
| `GET /api/categories` | Si | Si | Si |
| `GET /api/categories/:id` | Si | Si | Si |
| `POST /api/categories` | Si | Si | No |
| `PATCH /api/categories/:id` | Si | Si | No |
| `PATCH /api/categories/:id/status` | Si | Si | No |
| `DELETE /api/categories/:id` | Si | Si | No |
| `GET /api/documents/categories` | Si | Si | Si |
| `POST /api/documents/upload` | Si | Si | No |
| `GET /api/documents` | Si | Si | Si |
| `GET /api/documents/search` | Si | Si | Si |
| `GET /api/documents/view/:filename` | Si | Si | Si (con restricciones) |
| `PATCH /api/documents/:id/replace` | Si | Si | No |
| `PATCH /api/documents/:id` | Si | Si | No |
| `PATCH /api/documents/status/:id` | Si | Si | No |
| `DELETE /api/documents/:id` | Si | Si | No |
| `GET /api/audit/logs` | Si | No | No |

## 5) Usuarios

### `POST /api/users` (ADMIN)

Body:
```json
{
  "email": "nuevo.usuario@example.com",
  "full_name": "Usuario Nuevo",
  "role": "VIEWER",
  "category_ids": [1, 2]
}
```

Notas:
- `role` permitido: `ADMIN`, `EDITOR`, `VIEWER`
- Tambien acepta `categoryIds`
- Si `role=VIEWER`, debe tener al menos una categoria
- Envia correo de bienvenida con password temporal (si la integracion SMTP esta operativa)

### `GET /api/users` (ADMIN, EDITOR)

Response 200: arreglo de usuarios.

### `GET /api/users/me` (ADMIN, EDITOR, VIEWER)

Response 200: perfil del usuario autenticado.
Campos relevantes:
- `id`
- `email`
- `full_name`
- `role`
- `avatar_path`
- `must_change_password`
- `created_at`
- `updated_at`

### `PATCH /api/users/:id` (ADMIN)

Body parcial permitido:
```json
{
  "email": "nuevo.correo@example.com",
  "full_name": "Nuevo Nombre",
  "role": "EDITOR"
}
```

### `PATCH /api/users/:id/reset-password` (ADMIN)

Restablece la contrasena del usuario y marca `must_change_password = true`.
Esto obliga al usuario a cambiar su contrasena en su siguiente inicio de sesion.

Body opcional:
```json
{
  "temporaryPassword": "Temporal123*"
}
```

Si no envias `temporaryPassword`, el backend genera una automaticamente.

Response 200 (ejemplo):
```json
{
  "message": "Contrasena restablecida correctamente y correo de notificacion enviado",
  "user": {
    "id": "uuid-or-id",
    "email": "user@example.com",
    "full_name": "Usuario",
    "role": "VIEWER",
    "is_active": true,
    "must_change_password": true,
    "updated_at": "2026-04-07T19:00:00.000Z"
  },
  "temporaryPassword": "XyZ123Abc9",
  "emailSent": true
}
```

### `DELETE /api/users/:id` (ADMIN)

- Eliminacion logica: `is_active=false`

### `GET /api/users/:id/categories` (ADMIN, EDITOR)

- Obtiene categorias asignadas al usuario.

### `PUT /api/users/:id/categories` (ADMIN, EDITOR)

Body:
```json
{
  "categoryIds": [1, 2, 3]
}
```

Tambien acepta:
```json
{
  "category_ids": [1, 2, 3]
}
```

### `PATCH /api/users/me/avatar` (ADMIN, EDITOR, VIEWER)

`multipart/form-data`:
- `avatar` (obligatorio)
- Formatos permitidos: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Tamano maximo: `5MB`
- Si la columna `users.avatar_path` aun no existe, retorna `409` (ejecutar migracion).

Response 200:
```json
{
  "message": "Avatar actualizado correctamente",
  "user": {
    "id": "uuid-or-id",
    "email": "user@example.com",
    "full_name": "Usuario",
    "role": "EDITOR",
    "avatar_path": "uploads/avatars/AVATAR-...png",
    "updated_at": "2026-04-07T18:00:00.000Z"
  }
}
```

### `GET /api/users/me/avatar` (ADMIN, EDITOR, VIEWER)

- Devuelve el archivo de imagen del avatar del usuario autenticado.
- Si no existe avatar configurado, retorna `404`.
- Si la columna `users.avatar_path` aun no existe, retorna `409`.

### `DELETE /api/users/me/avatar` (ADMIN, EDITOR, VIEWER)

- Elimina el avatar actual del usuario autenticado.
- Limpia `avatar_path` en base de datos.
- Si la columna `users.avatar_path` aun no existe, retorna `409`.

## 6) Categorias

### `GET /api/categories`

Query params:
- `page` (default `1`)
- `limit` (default `10`)
- `search` (opcional)
- `includeInactive` (solo ADMIN/EDITOR realmente aplicable)

Response 200:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Seguridad Industrial",
      "is_active": true,
      "created_at": "2026-04-07T10:00:00.000Z",
      "updated_at": "2026-04-07T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/categories/:id`
- Obtiene una categoria.

### `POST /api/categories` (ADMIN, EDITOR)

Body:
```json
{
  "name": "Operacion Planta"
}
```

### `PATCH /api/categories/:id` (ADMIN, EDITOR)

Body:
```json
{
  "name": "Operacion Planta v2"
}
```

### `PATCH /api/categories/:id/status` (ADMIN, EDITOR)

Body:
```json
{
  "is_active": false
}
```

### `DELETE /api/categories/:id` (ADMIN, EDITOR)

- Eliminacion logica (internamente desactiva categoria).

## 7) Documentos

### `GET /api/documents/categories`

- Devuelve categorias visibles para el usuario autenticado.

### `POST /api/documents/upload` (ADMIN, EDITOR)

`multipart/form-data`:
- `file` (PDF, max 10MB)
- `category_id` (obligatorio)
- `title` (opcional)
- `description` (opcional)
- `publish_date` (opcional, `YYYY-MM-DD`)
- `expiry_date` (opcional, `YYYY-MM-DD`)

Response 201:
```json
{
  "message": "Documento publicado con exito",
  "docId": 123
}
```

### `GET /api/documents`

Response 200: arreglo de documentos.
Regla actual por defecto: este endpoint retorna documentos con `status = active`.
Query opcional:
- `includeInactive=true` (solo aplica para `ADMIN` y `EDITOR`; en `VIEWER` se ignora e incluye documentos `inactive` y `superseded`)
Campos relevantes:
- `id`
- `title`
- `filename` (contiene `file_path` almacenado)
- `category_id`
- `category_name`
- `status`

Estados posibles:
- `active`: documento vigente
- `inactive`: documento deshabilitado/eliminado logicamente
- `superseded`: documento derogado por una nueva version vigente

### `GET /api/documents/search`

Busqueda filtrada de documentos. La solicitud debe incluir al menos un filtro:
- `category_id` o `categoryId`
- `title`
- `description`
- `publish_date` o `publishDate`
- `expiry_date` o `expiryDate`

Query params soportados:
- `category_id` o `categoryId` (entero positivo)
- `title` (busqueda parcial, no sensible a mayusculas/minusculas)
- `description` (busqueda parcial, no sensible a mayusculas/minusculas)
- `publish_date` o `publishDate` (`YYYY-MM-DD`)
- `expiry_date` o `expiryDate` (`YYYY-MM-DD`)
- `includeInactive=true` (solo aplica para `ADMIN` y `EDITOR`; en `VIEWER` se ignora)

Reglas por rol:
- `ADMIN`: puede buscar en todos los documentos; por defecto solo `active`
- `EDITOR`: puede buscar en los documentos de sus categorias asignadas; si no tiene asignaciones, conserva el comportamiento actual del modulo
- `VIEWER`: solo puede obtener documentos `active` y visibles para sus categorias asignadas

Response 200:
```json
[
  {
    "id": "uuid-or-id",
    "title": "Procedimiento de bloqueo",
    "filename": "uploads/documents/SAFEDOC-....pdf",
    "created_at": "2026-04-09T18:00:00.000Z",
    "uploaded_by": "Usuario Editor",
    "category_id": 2,
    "category_name": "Seguridad Industrial",
    "description": "Version vigente del procedimiento",
    "publish_date": "2026-04-09",
    "expiry_date": "2027-04-09",
    "status": "active"
  }
]
```

### `GET /api/documents/view/:filename`

- Retorna PDF inline (`Content-Type: application/pdf`).
- Headers anti-cache activos.
- Para VIEWER solo permite documentos `active` y de categorias asignadas.

### `PATCH /api/documents/:id/replace` (ADMIN, EDITOR)

`id` acepta formato numerico o UUID (segun el esquema de tu BD).

Reemplaza el archivo PDF por una nueva version:
- El documento actual queda con `status = superseded` (derogado)
- Se crea un nuevo documento con `status = active` (vigente)
- Se conserva el historial enlazando ambas versiones

`multipart/form-data`:
- `file` (PDF, obligatorio)
- `title` (opcional)
- `description` (opcional)
- `publish_date` (opcional, `YYYY-MM-DD`)
- `expiry_date` (opcional, `YYYY-MM-DD` o `null`)
- `category_id` (opcional, entero positivo de categoria activa)

Si no envias metadata opcional, el backend reutiliza la del documento actual.

Response 201:
```json
{
  "message": "Documento reemplazado correctamente. La version anterior quedo derogada.",
  "supersededDocument": {
    "id": "uuid-or-id",
    "status": "superseded",
    "replaced_by_document_id": "uuid-or-id",
    "updated_at": "2026-04-09T18:00:00.000Z"
  },
  "document": {
    "id": "uuid-or-id",
    "title": "Procedimiento actualizado",
    "file_path": "uploads/documents/SAFEDOC-....pdf",
    "category_id": 2,
    "description": "Nueva version vigente",
    "publish_date": "2026-04-09",
    "expiry_date": "2027-04-09",
    "status": "active",
    "replaces_document_id": "uuid-or-id",
    "created_at": "2026-04-09T18:00:00.000Z",
    "updated_at": "2026-04-09T18:00:00.000Z"
  }
}
```

### `PATCH /api/documents/:id` (ADMIN, EDITOR)

`id` acepta formato numerico o UUID (segun el esquema de tu BD).

Actualizacion parcial de metadata/propiedades del documento.
Puedes enviar uno o varios campos:
- `title` (minimo 2 caracteres)
- `description` (texto)
- `publish_date` (`YYYY-MM-DD`)
- `expiry_date` (`YYYY-MM-DD` o `null`)
- `category_id` (entero positivo de categoria activa)
- `status` (`active` o `inactive`)

Nota:
- `superseded` no se asigna manualmente desde este endpoint; ese estado se usa automaticamente al reemplazar un documento vigente.

Body ejemplo:
```json
{
  "title": "Procedimiento actualizado",
  "description": "Nueva version validada",
  "publish_date": "2026-04-07",
  "expiry_date": "2027-04-07",
  "category_id": 2,
  "status": "active"
}
```

Response 200:
```json
{
  "message": "Metadata del documento actualizada correctamente",
  "document": {
    "id": "uuid-or-id",
    "title": "Procedimiento actualizado",
    "category_id": 2,
    "description": "Nueva version validada",
    "publish_date": "2026-04-07",
    "expiry_date": "2027-04-07",
    "status": "active",
    "updated_at": "2026-04-07T20:00:00.000Z"
  }
}
```

### `PATCH /api/documents/status/:id` (ADMIN, EDITOR)

`id` acepta formato numerico o UUID (segun el esquema de tu BD).

Body:
```json
{
  "status": "inactive"
}
```

Valores permitidos: `active` o `inactive`.

Nota:
- No aplica a documentos `superseded` (derogados).

### `DELETE /api/documents/:id` (ADMIN, EDITOR)

`id` acepta formato numerico o UUID (segun el esquema de tu BD).

- Eliminacion logica (`status=inactive`)
- Intenta eliminar archivo fisico

## 8) Auditoria

### `GET /api/audit/logs` (ADMIN)

Response 200: maximo 100 eventos recientes.

## 9) Codigos HTTP a manejar en frontend

- `200` OK
- `201` Creado
- `400` Validacion / request invalido
- `401` Sin token / sesion invalida
- `403` Sin permisos / token invalido o expirado
- `404` Recurso no encontrado
- `409` Conflicto (duplicado o dependencia de migracion)
- `428` Debe cambiar password temporal
- `500` Error interno

## 10) Recomendaciones de integracion frontend

- Centralizar cliente HTTP con interceptor para `Authorization`.
- Manejar `428` con redireccion forzada a pantalla de cambio de password.
- Ocultar acciones por rol en UI:
  - VIEWER: solo listar/visualizar documentos permitidos. No tiene acceso a crear nuevos documentos.
  - EDITOR: categorias + documentos + asignacion de categorias a usuarios.
  - ADMIN: todo, incluyendo alta/edicion/baja de usuarios y auditoria.
- Para PDF de VIEWER:
  - usar visor embebido
  - ocultar botones de descarga/impresion en UI
  - considerar esto como control de UX (no control absoluto de seguridad cliente)
