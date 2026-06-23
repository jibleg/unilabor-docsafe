# Runbook de despliegue (update) — SafeDoc

Flujo: el código se sube **ya transpilado** por `scp` (no hay `git pull` ni `npm run build` en el server). La BD se actualiza con **migraciones** (pgAdmin4 o el runner compilado).

Orden recomendado: **1) migraciones → 2) paquetes (si aplica) → 3) dist backend/frontend → 4) npm ci (si aplica) → 5) restart**.

> Host: `root@unilabor-app.com` · Backend: `/root/projects/unilabor-safedoc` · Frontend: `/var/www/unilabor-safedoc-ui/dist`

---

## 1. Migraciones de base de datos (si hubo cambios de esquema)

Las migraciones de esquema toman efecto **en vivo** (no requieren reiniciar el backend: el proyecto usa SQL crudo con `pg`, sin caché de metadatos).

**Opción A — pgAdmin4 (manual):** ejecutar el SQL consolidado de las migraciones pendientes (idempotente, una transacción por migración, además registra en `schema_migrations`). Generar/usar el archivo `MIGRACIONES_PENDIENTES_MANUAL.sql`.

**Opción B — runner compilado en el server (requiere `.env` con `DB_*` cargado):**
```bash
cd /root/projects/unilabor-safedoc
node dist/scripts/migrate.js status    # ver pendientes (no modifica nada)
node dist/scripts/migrate.js migrate   # aplicar
```
> Si `migrate.js` se queda colgado mostrando `injected env (0)`, el `.env` no tiene las `DB_*`; pásalas inline o complétalas. NO uses `ts-node` en el server (el CLI de ts-node falla con el código transpilado).

---

## 2. Paquetes — **solo si cambiaron dependencias** (`package.json`)

Si cambió `package.json` / `package-lock.json` (alta/baja de dependencias), es **obligatorio** subirlos y reinstalar; subir solo `dist/` **no** actualiza `node_modules`.

```bash
scp /Users/israel/Developer/unilabor/unilabor-docsafe/unilabor-safedoc/package.json      root@unilabor-app.com:/root/projects/unilabor-safedoc/package.json
scp /Users/israel/Developer/unilabor/unilabor-docsafe/unilabor-safedoc/package-lock.json root@unilabor-app.com:/root/projects/unilabor-safedoc/package-lock.json
# en el server:
cd /root/projects/unilabor-safedoc
npm ci
```

---

## 3. Subir el código transpilado (`dist/`)

> Recomendado: borrar el `dist/` remoto antes de subir, para no dejar `.js` viejos de archivos renombrados/borrados ni anidar `dist/dist`.

**Backend:**
```bash
ssh root@unilabor-app.com 'rm -rf /root/projects/unilabor-safedoc/dist'
scp -r /Users/israel/Developer/unilabor/unilabor-docsafe/unilabor-safedoc/dist root@unilabor-app.com:/root/projects/unilabor-safedoc/dist
```

**Frontend:**
```bash
ssh root@unilabor-app.com 'rm -rf /var/www/unilabor-safedoc-ui/dist'
scp -r /Users/israel/Developer/unilabor/unilabor-docsafe/unilabor-safedoc-ui/dist root@unilabor-app.com:/var/www/unilabor-safedoc-ui/dist
```

---

## 4. Reiniciar el backend (si subiste `dist/` backend o corriste `npm ci`)

```bash
pm2 restart unilabor-safedoc
pm2 logs unilabor-safedoc --lines 50    # verificar arranque sin errores
```
El frontend no requiere reinicio (lo sirve nginx desde `dist/`); si hace falta, limpiar caché del navegador / CDN.

---

## ¿Qué necesita restart y qué no?

| Cambio | Cómo se aplica | ¿Restart backend? |
|---|---|---|
| Migraciones SQL | pgAdmin / `migrate.js` | ❌ No (efecto en vivo) |
| Código backend (`dist/`) | `scp -r dist` | ✅ Sí |
| Dependencias (`package.json`) | `scp` package + `npm ci` | ✅ Sí |
| Frontend (`dist/`) | `scp -r dist` | ❌ No (solo recarga) |

---

## Notas para el deploy del 2026-06-23 (referencia)

- **`npm ci` ES obligatorio**: `node-cron` bajó de v4 → v3 (v4 truena el scheduler en el Node del server con `RangeError shortOffset`) y se agregó `exceljs`. Sin `npm ci`, el scheduler sigue fallando aunque subas el `dist`.
- **Migraciones obligatorias**: módulo Evaluaciones (`20260617_*`, `20260618_01`), Help Desk ISO (`20260620_01`, `20260622_*`), endurecimiento (`20260623_01`). Sin ellas, prod truena con `no existe la columna e.phone`.
- Verificar en `.env` antes de prod: `NOTIFY_RH_EMAIL` real, credenciales SparkPost/LabsMobile rotadas, `JWT_SECRET` real, `SCHEDULER_ENABLED`.
- WhatsApp cachea el preview por URL → compartir con `?v=2` para forzar refresco.
