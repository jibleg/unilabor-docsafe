# Sprint 26 - Infraestructura de Pruebas

Estado general del sprint: `completada`

Objetivo:
Instalar una red minima de pruebas automatizadas que proteja los flujos criticos, para poder refactorizar y escalar con seguridad. No busca cobertura total, sino una base ejecutable.

## Bloque 1 - Setup de herramientas

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-01 | Configurar runner de pruebas backend | `completada` | Vitest 4 (`vitest.config.ts`, entorno node); `.test.ts` excluidos del build `tsc`. |
| TST-02 | Configurar Vitest + React Testing Library en frontend | `completada` | Vitest 4 + RTL + jsdom (`vitest.config.ts`, `src/test/setup.ts`). |
| TST-03 | Agregar scripts `test` y `test:watch` | `completada` | En ambos `package.json`. |

## Bloque 2 - Smoke tests backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-04 | Test de autorizacion por modulo | `completada` | `auth.middleware.test.ts`: `authorize`, `authorizeModuleAccess`, `authorizeModuleRole` (acceso/denegacion/401). |
| TST-05 | Test de login y emision de JWT | `completada` | `auth.controller.test.ts`: 400/401 y emision de JWT valido con claims (incluye `mustChangePassword`). |
| TST-06 | Test de un service critico Helpdesk | `completada` | `helpdesk-ticket.service.test.ts`: `calculateDowntimeMinutes` (redondeo, negativos, fechas invalidas). |

## Bloque 3 - Smoke tests frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-07 | Test de guards de ruta | `completada` | `guards.test.tsx`: `ModuleGuard` y `RoleGate` (acceso, redireccion por modulo/rol, sin token). |
| TST-08 | Test de normalizadores de `api/service.ts` | `completada` | `service.test.ts`: `listMaintenancePlans` con axios mockeado (clave envolvente, arreglo plano, descarte de invalidos). Util `modules.test.ts` cubre normalizacion de modulos/roles. |
| TST-09 | Test de store de auth | `completada` | `useAuthStore.test.ts`: `setAuth`, `setAvailableModules`, `logout`, seleccion automatica de modulo. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-10 | Documentar como correr las pruebas | `completada` | Seccion "Pruebas" en el README. |
| TST-11 | Validar build y commit/push | `completada` | Builds backend y frontend OK; 42 tests verdes (21 backend + 21 frontend). Commit local (sin push). |

## Definicion de terminado

- `npm test` ejecutable en backend y frontend
- flujos criticos de auth, modulos y normalizacion cubiertos por smoke tests
- documentacion de ejecucion disponible

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 26 creado | `pendiente` | Red minima de pruebas para habilitar refactors. |
| 2026-06-12 | Infraestructura de pruebas montada (Vitest) | `completada` | Backend (node) y frontend (jsdom+RTL). 42 smoke tests verdes sobre auth, modulos, downtime, guards, normalizacion y store. Documentado en README. |
