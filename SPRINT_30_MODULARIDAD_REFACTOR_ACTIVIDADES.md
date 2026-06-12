# Sprint 30 - Modularidad y Reduccion de Archivos Monoliticos

Estado general del sprint: `pendiente`

Objetivo:
Dividir los archivos mas grandes en unidades mantenibles y testeables, sin cambiar comportamiento. Mejora directa de mantenibilidad y velocidad de desarrollo futuro.

Dependencia recomendada:
Conviene ejecutar despues del Sprint 26 (pruebas), para refactorizar con red de seguridad.

## Bloque 1 - Frontend: capa de API

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-01 | Dividir `api/service.ts` por dominio | `pendiente` | ~2.636 LOC. Separar en `quality`, `rh`, `helpdesk`, `auth`. |
| REF-02 | Extraer normalizadores compartidos | `pendiente` | `asRecord`, `getString`, `getNumber`, etc. a util comun. |
| REF-03 | Mantener exports compatibles | `pendiente` | Evitar tocar imports de paginas; reexportar si hace falta. |

## Bloque 2 - Frontend: paginas grandes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-04 | Extraer modales de `HelpdeskTicketsPage.tsx` | `pendiente` | ~1.184 LOC; 5 formularios inline. |
| REF-05 | Extraer modales de `HelpdeskMaintenancePage.tsx` | `pendiente` | ~1.135 LOC. |
| REF-06 | Extraer modales de `UsersPage.tsx` | `pendiente` | ~1.069 LOC; crear/editar usuario. |
| REF-07 | Unificar configuracion de sidebar y navbar | `pendiente` | `AppSidebar` y `AppNavbar` repiten items de menu. |

## Bloque 3 - Backend: servicios grandes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-08 | Dividir `helpdesk-ticket.service.ts` | `pendiente` | ~1.367 LOC; separar por ciclo de vida del ticket. |
| REF-09 | Dividir `helpdesk.controller.ts` | `pendiente` | ~1.367 LOC; separar HTTP por recurso. |
| REF-10 | Revisar `document.controller.ts` | `pendiente` | ~823 LOC; mover logica a service. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| REF-11 | Verificar paridad con pruebas | `pendiente` | Comportamiento identico antes/despues. |
| REF-12 | Validar builds y commit/push | `pendiente` | Backend y frontend correctos. |

## Definicion de terminado

- `api/service.ts` dividido por dominio con normalizadores compartidos
- paginas y servicios mayores a 1.000 LOC divididos en unidades menores
- sin cambios de comportamiento observables
- builds correctos y pruebas verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 30 creado | `pendiente` | Refactor de modularidad sobre archivos monoliticos. |
