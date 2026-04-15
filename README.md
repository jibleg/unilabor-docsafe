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
  - `unilabor-safedoc/sql/`: scripts SQL y migraciones manuales.
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
