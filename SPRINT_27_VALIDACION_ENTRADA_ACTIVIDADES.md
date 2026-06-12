# Sprint 27 - Validacion de Entrada Centralizada

Estado general del sprint: `en progreso`

Nota de alcance (2026-06-12): la base de validacion y las entradas criticas estan
listas (Definicion de terminado cubierta). La esquematizacion de TODOS los
endpoints (documentos/categorias, RH completo, resto de Helpdesk, updateUser) se
deja como seguimiento incremental, reutilizando el mismo middleware y patron de
esquemas. Se prioriza no introducir regresiones en controllers monoliticos.

Objetivo:
Introducir validacion de entrada consistente y centralizada en el backend, reemplazando los chequeos ad-hoc dispersos en los controllers, reduciendo duplicacion y riesgo.

## Bloque 1 - Base de validacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-01 | Incorporar libreria de validacion | `completada` | Zod 4 instalado en el backend. |
| VAL-02 | Crear middleware `validate(schema)` | `completada` | `src/middlewares/validate.middleware.ts`: valida `req.body`, reasigna datos normalizados (coercion/defaults), responde 400 uniforme. |
| VAL-03 | Definir formato de error de validacion estandar | `completada` | `{ message: 'Datos de entrada invalidos', errors: [{ field, message }] }`, consistente con el `{ message }` del handler global. |

## Bloque 2 - Migracion de validaciones existentes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-04 | Esquematizar entradas de auth y usuarios | `parcial` | Hechos: login, recover-password, change-password y createUser (`auth.schema.ts`, `user.schema.ts`). Pendiente: updateUserById, reset-password, replaceUserCategories. |
| VAL-05 | Esquematizar entradas de documentos y categorias | `pendiente` | Reemplazar `parsePositiveInt`, `parseDocumentId`, `parseOptionalDate` por esquemas. |
| VAL-06 | Esquematizar entradas de RH y Helpdesk | `parcial` | Hecho: plan de mantenimiento Helpdesk (`helpdesk.schema.ts`, create+update). Pendiente: empleados, expediente, tickets, activos. |
| VAL-07 | Retirar helpers de parseo ad-hoc redundantes | `parcial` | Retirados los chequeos de forma de createUser y login/change-password. Los helpers `parseCategoryIds`/`parseModuleCodes` se conservan porque aun los usa `updateUserById` (pendiente de esquematizar). |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-08 | Agregar pruebas de validacion | `completada` | `validate.middleware.test.ts` y `schemas/schemas.test.ts` (Vitest del Sprint 26). |
| VAL-09 | Validar build y commit/push | `completada` | Build OK; 31 tests backend verdes; smoke API confirmando 200/400/201/400 sin regresiones. Commit local (sin push). |

## Definicion de terminado

- existe middleware de validacion reutilizable
- entradas criticas validadas por esquema, no por chequeos manuales
- formato de error 400 uniforme
- duplicacion de parseo reducida

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 27 creado | `pendiente` | Centralizacion de validacion de entrada. |
| 2026-06-12 | Base de validacion (Zod + middleware) y entradas criticas | `en progreso` | DoD cubierta: middleware reutilizable, 400 uniforme, auth/createUser/plan de mantenimiento por esquema, tests verdes. Resto de endpoints como seguimiento incremental. |
