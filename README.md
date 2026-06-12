# Unilabor SafeDoc Workspace

Repositorio de trabajo con dos proyectos relacionados:

- `unilabor-safedoc`: backend API con Express, TypeScript y PostgreSQL.
- `unilabor-safedoc-ui`: frontend con React, Vite y TypeScript.

## Estructura

```text
.
├─ unilabor-safedoc/
│  ├─ src/
│  ├─ sql/
│  ├─ postman/
│  ├─ uploads/
│  └─ storage/
├─ unilabor-safedoc-ui/
│  ├─ src/
│  └─ public/
├─ .gitignore
├─ .gitattributes
└─ README.md
```

## Proyectos

### Backend: `unilabor-safedoc`

- Stack: Node.js, Express, TypeScript, PostgreSQL.
- Modulos principales: autenticacion, usuarios, categorias, documentos y auditoria.
- Contrato API: `unilabor-safedoc/API_CONTRACT.md`
- Utilidad local: `npm run hash-password -- <password> <email>`
- Recursos de apoyo:
  - `unilabor-safedoc/sql/`: migraciones de base de datos (ver "Migraciones de base de datos").
  - `unilabor-safedoc/postman/`: coleccion y environment para pruebas.

### Frontend: `unilabor-safedoc-ui`

- Stack: React, Vite, TypeScript, Tailwind CSS, Zustand, Axios.
- Modulos principales: login, cambio/recuperacion de contrasena, dashboard, usuarios, categorias, documentos, auditoria y perfil.

## Requisitos

- Node.js 20+ recomendado
- npm 10+ recomendado
- PostgreSQL

## Configuracion

### 1. Variables de entorno

Backend:

```powershell
Copy-Item unilabor-safedoc/.env.example unilabor-safedoc/.env
```

La politica de `VIEWER` se controla desde estas variables del backend:

- `VIEWER_ALLOWED_CATEGORY_LABELS`
- `VIEWER_ALLOWED_CATEGORY_KEYWORDS`

Con ellas puedes limitar explicitamente las categorias visibles para consulta del SGC ISO 15189.

Frontend:

```powershell
Copy-Item unilabor-safedoc-ui/.env.example unilabor-safedoc-ui/.env
```

### Puertos del backend (importante)

El backend escucha en puertos distintos segun el entorno:

- Desarrollo: `PORT=4000` (valor por defecto en `.env.example` y en `src/index.ts`). El proxy de Vite del frontend apunta a este puerto via `VITE_API_PROXY_TARGET`.
- Produccion (PM2): `ecosystem.config.js` arranca el proceso con `PORT=5060`.

Si cambias el puerto de produccion, actualiza tambien el reverse proxy (nginx) o el `VITE_API_PROXY_TARGET` que use el frontend para no romper la comunicacion `/api`.

### 2. Instalar dependencias

Backend:

```powershell
cd unilabor-safedoc
npm install
```

Frontend:

```powershell
cd unilabor-safedoc-ui
npm install
```

## Desarrollo local

Backend:

```powershell
cd unilabor-safedoc
npm run dev
```

Frontend:

```powershell
cd unilabor-safedoc-ui
npm run dev
```

## Migraciones de base de datos

Las migraciones viven en `unilabor-safedoc/sql/` con prefijo de fecha `AAAAMMDD_*.sql`
y se aplican con un runner versionado (ya no a mano). El runner usa las variables
`DB_*` del `.env`, por lo que apunta a la base de datos configurada localmente.

```powershell
cd unilabor-safedoc
npm run migrate:status   # lista aplicadas vs pendientes (no modifica nada)
npm run migrate          # aplica en orden solo las pendientes
```

Caracteristicas:

- Cada migracion se aplica dentro de una transaccion propia; si falla, se hace
  rollback de esa migracion y se detiene el proceso.
- Lo aplicado se registra en la tabla `schema_migrations` (nombre, checksum, fecha);
  volver a correr `migrate` solo aplica lo pendiente.
- Las migraciones son inmutables: si una ya esta aplicada y editas su contenido, el
  runner avisa del cambio de checksum. Para corregir, crea una migracion nueva.

Importante: no apuntar el runner a la base de datos de produccion. Aplicar primero
en local y validar en el navegador.

## Build

Backend:

```powershell
cd unilabor-safedoc
npm run build
```

Frontend:

```powershell
cd unilabor-safedoc-ui
npm run build
```

## Sesion y seguridad

- **JWT_SECRET obligatorio**: el backend no arranca si `JWT_SECRET` falta o conserva
  el valor por defecto `change-me` (validacion al inicio). Genera uno fuerte con
  `openssl rand -hex 32`.
- **Expiracion configurable**: `JWT_EXPIRES_IN` (default `8h`, formato de
  `jsonwebtoken`: `30m`, `8h`, `1d`).
- **Manejo uniforme de sesion (frontend)**: un interceptor de respuesta de axios
  detecta `401` (sesion expirada o token invalido), cierra sesion y redirige a
  `/login`. Los `401` de los endpoints de login/recuperacion se excluyen para que el
  error se muestre en pantalla. El backend devuelve `401` para token expirado/invalido
  y reserva `403` para permisos insuficientes (no cierran sesion).
- **Almacenamiento del token (riesgo XSS, AUT-06)**: el token se guarda en
  `localStorage` (`auth-storage`) por simplicidad de la SPA. Esto es vulnerable a XSS
  si se inyecta script en la pagina. Mitigaciones actuales: expiracion corta + cierre
  de sesion centralizado ante `401`. Mitigacion futura recomendada: cookie `httpOnly`
  + `SameSite` emitida por el backend (requiere endpoint de refresh y manejo CSRF).
- **Refresh token (decision AUT-03)**: por ahora se opta por re-autenticacion
  controlada (al expirar el token, el `401` lleva al login) en vez de implementar
  refresh tokens. Con el token en `localStorage`, un refresh token aportaria poca
  ganancia de seguridad y si complejidad; se difiere hasta migrar a cookies `httpOnly`.

## Pruebas

Ambos proyectos usan Vitest. Es una red minima de smoke tests sobre flujos
criticos (no busca cobertura total): autorizacion por modulo, login/JWT,
calculo de downtime, guards de ruta, normalizacion de respuestas y store de
sesion.

Backend (entorno node):

```powershell
cd unilabor-safedoc
npm test           # corre una vez
npm run test:watch # modo watch
```

Frontend (entorno jsdom + React Testing Library):

```powershell
cd unilabor-safedoc-ui
npm test
npm run test:watch
```

Convencion: los archivos de prueba viven junto al codigo como `*.test.ts` /
`*.test.tsx`. En el backend se excluyen del build de produccion (`dist/`).

## Versionado

El repositorio ya esta preparado para evitar ruido en Git:

- Se ignoran `node_modules`, `dist`, archivos de entorno y artefactos temporales.
- `uploads/` y `storage/` conservan solo la estructura minima con `.gitkeep`.
- Se conservan en Git los archivos utiles para mantenimiento:
  - `package-lock.json`
  - `sql/`
  - `postman/`
  - `API_CONTRACT.md`
  - `.env.example`

## Siguiente paso sugerido

Para publicar este workspace en GitHub:

```powershell
git add .
git commit -m "chore: prepare SafeDoc workspace for versioning"
git branch -M main
git remote add origin <TU-URL-DEL-REPO>
git push -u origin main
```
