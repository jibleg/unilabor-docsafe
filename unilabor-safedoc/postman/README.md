# Mini guia Postman - SafeDoc Backend

## Archivos
- `safedoc-backend-rbac.collection.json`
- `safedoc-backend.local.environment.json`
- `../API_CONTRACT.md`

## Importacion
1. Abre Postman.
2. Importa la collection y luego el environment.
3. Selecciona el environment `SafeDoc Backend Local`.
4. Ajusta credenciales reales (`adminEmail`, `editorEmail`, `viewerEmail` y passwords).
5. Asegura que `baseUrl` apunte a tu backend (por defecto `http://localhost:4000`).

## Orden recomendado de ejecucion
1. Ejecuta `00 Auth > Login ADMIN`, `Login EDITOR` y `Login VIEWER`.
2. Si un usuario tiene password temporal, ejecuta su `Change Password` antes de cualquier otro endpoint protegido.
3. Valida perfil/avatar en `05 Profile Avatar`.
4. Valida acciones ADMIN en `10 Admin`.
5. Valida acciones EDITOR en `20 Editor`.
6. Valida restricciones VIEWER en `30 Viewer`.
7. Ejecuta `40 Negative Permission Checks` para confirmar 403 esperados.

## Notas clave de seguridad/roles
- `ADMIN`: crea/edita/elimina usuarios, asigna roles, ve auditoria.
- `ADMIN`: tambien puede restablecer contrasena de usuarios (`must_change_password=true`).
- `EDITOR`: crea/edita categorias, asocia categorias (segun backend actual), sube/gestiona documentos en categorias permitidas.
- `VIEWER`: solo consulta categorias/documentos permitidos y visualiza PDF.
- El backend no expone endpoint de descarga directa de PDF; visualizacion es por `/api/documents/view/:filename` con `Content-Disposition: inline`.

## Variables importantes
- `categoryId`, `editorCategoryId`, `managedUserId`, `documentId`, `documentFilename` se llenan automaticamente con scripts.
- `resetTempPassword` (opcional): si lo dejas vacio, el backend genera temporal automaticamente.
- `resetGeneratedPassword`: se llena con la temporal generada por el endpoint de reset.
- `documentTitleUpdated`, `documentDescriptionUpdated`, `documentPublishDateUpdated`, `documentExpiryDateUpdated` se usan en `Update Document Metadata (EDITOR)`.
- `pdfFilePath` debe apuntar a un PDF real de prueba en tu maquina.
- `avatarFilePath` debe apuntar a una imagen JPG/PNG/WEBP real para pruebas de avatar.
- `documentsIncludeInactive=true` permite probar `GET /api/documents?includeInactive=true` con token ADMIN/EDITOR.
