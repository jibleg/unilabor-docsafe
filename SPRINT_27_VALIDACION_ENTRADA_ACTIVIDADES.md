# Sprint 27 - Validacion de Entrada Centralizada

Estado general del sprint: `completada`

Alcance final (2026-06-12): se esquematizaron TODOS los endpoints de escritura de
los tres modulos (QUALITY, RH, HELPDESK) con el middleware `validate` y Zod. Los
esquemas usan `.passthrough()` para no descartar campos que el controller lea y
que no se modelen; se validan los campos obligatorios, enums y numericos clave
(lo que el controller ya rechazaba), garantizando un 400 uniforme. Los controllers
conservan sus chequeos de reglas cruzadas y dependientes de BD como defensa.

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
| VAL-04 | Esquematizar entradas de auth y usuarios | `completada` | auth (login, recover-password), user (change-password, createUser, updateUserById, reset-password, replaceUserCategories). |
| VAL-05 | Esquematizar entradas de documentos y categorias | `completada` | category (create/update/status), document (upload, status, metadata, replace), document-structure (sections/types create+update). |
| VAL-06 | Esquematizar entradas de RH y Helpdesk | `completada` | RH: employee (create/update/document-access), employee-document (upload empleado + propio). HELPDESK: assets, tickets (crear/editar/comentar/iso-risk/solve/technical-release/validate-return + my-tickets), catalog-admin (create/update), ordenes (reschedule/close), planes. |
| VAL-07 | Retirar helpers de parseo ad-hoc redundantes | `parcial` | Retirados los chequeos de forma de login, change-password y createUser. En el resto de endpoints los esquemas (`.passthrough`) actuan como capa de validacion uniforme y los controllers conservan sus chequeos como defensa en profundidad y para reglas de BD/cruzadas. La limpieza total de chequeos redundantes queda como seguimiento de bajo riesgo. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-08 | Agregar pruebas de validacion | `completada` | `validate.middleware.test.ts` y `schemas/schemas.test.ts` (44 tests backend verdes). |
| VAL-09 | Validar build y commit/push | `completada` | Build OK; 44 tests backend verdes; smoke API por modulo (QUALITY/RH/HELPDESK) confirmando validos 201 e invalidos 400 uniforme, sin regresiones. Commit + push. |

## Definicion de terminado

- existe middleware de validacion reutilizable
- entradas criticas validadas por esquema, no por chequeos manuales
- formato de error 400 uniforme
- duplicacion de parseo reducida

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 27 creado | `pendiente` | Centralizacion de validacion de entrada. |
| 2026-06-12 | Base de validacion (Zod + middleware) y entradas criticas | `completada` | Middleware reutilizable, 400 uniforme, auth/createUser/plan de mantenimiento por esquema, tests verdes. |
| 2026-06-12 | Esquematizacion completa de los 3 modulos | `completada` | Todos los endpoints de escritura de QUALITY, RH y HELPDESK con `validate(...)` + Zod. 44 tests backend verdes; smoke por modulo sin regresiones. |
