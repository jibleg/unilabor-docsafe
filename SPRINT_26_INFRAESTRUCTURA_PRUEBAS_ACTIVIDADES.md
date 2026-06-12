# Sprint 26 - Infraestructura de Pruebas

Estado general del sprint: `pendiente`

Objetivo:
Instalar una red minima de pruebas automatizadas que proteja los flujos criticos, para poder refactorizar y escalar con seguridad. No busca cobertura total, sino una base ejecutable.

## Bloque 1 - Setup de herramientas

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-01 | Configurar runner de pruebas backend | `pendiente` | Vitest o node:test; integrar con `tsc`. |
| TST-02 | Configurar Vitest + React Testing Library en frontend | `pendiente` | Alinear con Vite 8. |
| TST-03 | Agregar scripts `test` y `test:watch` | `pendiente` | En ambos `package.json`. |

## Bloque 2 - Smoke tests backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-04 | Test de autorizacion por modulo | `pendiente` | `authorizeModuleAccess` / `authorizeModuleRole` con casos QUALITY/RH/HELPDESK. |
| TST-05 | Test de login y emision de JWT | `pendiente` | Incluye flag `mustChangePassword`. |
| TST-06 | Test de un service critico Helpdesk | `pendiente` | Ej. calculo de downtime o transicion de ticket. |

## Bloque 3 - Smoke tests frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-07 | Test de guards de ruta | `pendiente` | `ModuleGuard` y `RoleGate` con/sin acceso. |
| TST-08 | Test de normalizadores de `api/service.ts` | `pendiente` | Casos snake_case/camelCase y campos faltantes. |
| TST-09 | Test de store de auth | `pendiente` | `setAuth`, `logout`, persistencia. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TST-10 | Documentar como correr las pruebas | `pendiente` | README de cada proyecto. |
| TST-11 | Validar build y commit/push | `pendiente` | Pruebas verdes en local. |

## Definicion de terminado

- `npm test` ejecutable en backend y frontend
- flujos criticos de auth, modulos y normalizacion cubiertos por smoke tests
- documentacion de ejecucion disponible

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 26 creado | `pendiente` | Red minima de pruebas para habilitar refactors. |
