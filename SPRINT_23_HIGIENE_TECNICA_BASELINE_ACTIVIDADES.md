# Sprint 23 - Higiene Tecnica y Baseline

Estado general del sprint: `completada`

Objetivo:
Dejar el repositorio en un estado limpio y consistente como punto de partida de la V3, resolviendo deuda menor de bajo riesgo sin tocar logica de negocio.

## Bloque 1 - Limpieza de configuracion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| HIG-01 | Eliminar `package-lock.json` vacio de la raiz | `completada` | Placeholder sin trackear eliminado. |
| HIG-02 | Quitar exclude obsoleto `DocumentsPage_.tsx` de `tsconfig.app.json` | `completada` | Exclude retirado; el archivo ya no existia. |
| HIG-03 | Documentar desfase de puertos dev/prod | `completada` | Seccion "Puertos del backend" agregada al README (dev 4000 vs PM2 prod 5060). |
| HIG-04 | Revisar `.gitignore` raiz vs artefactos locales | `completada` | `.docx-build/` y el zip de respaldo quedan ignorados; sin artefactos sueltos sin trackear. |

## Bloque 2 - Calidad de codigo frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| HIG-05 | Corregir 3 errores de lint `react-hooks/set-state-in-effect` | `completada` | `PdfSafeViewerSafe.tsx`, `EmployeeDocumentUploadModal.tsx` y `AppNavbar.tsx`: reset de estado movido a render-time. |
| HIG-06 | Dejar `npm run lint` en cero errores | `completada` | Lint sin errores ni warnings. |
| HIG-07 | Verificar y unificar variantes duplicadas de modal de carga | `completada` | `UploadDocumentModal.tsx` (sin uso) eliminado; se conserva `UploadDocumentModalStyled.tsx`, el unico importado. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| HIG-08 | Validar builds | `completada` | `npm run build` backend y frontend correctos. |
| HIG-09 | Commit y push | `completada` | Cambio aislado y reversible. |

## Definicion de terminado

- repositorio sin archivos placeholder ni excludes muertos
- `npm run lint` en cero errores
- desfase de puertos documentado o alineado
- builds backend y frontend correctos

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 23 creado | `pendiente` | Baseline de higiene tecnica para iniciar V3. |
| 2026-06-12 | Sprint 23 ejecutado | `completada` | Lockfile y exclude muertos eliminados, modal duplicado retirado, 3 errores de lint corregidos (render-time), puertos documentados, builds OK. |
