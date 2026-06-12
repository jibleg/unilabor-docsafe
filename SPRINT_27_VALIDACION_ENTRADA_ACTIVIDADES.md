# Sprint 27 - Validacion de Entrada Centralizada

Estado general del sprint: `pendiente`

Objetivo:
Introducir validacion de entrada consistente y centralizada en el backend, reemplazando los chequeos ad-hoc dispersos en los controllers, reduciendo duplicacion y riesgo.

## Bloque 1 - Base de validacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-01 | Incorporar libreria de validacion | `pendiente` | Zod recomendado por integracion con TypeScript. |
| VAL-02 | Crear middleware `validate(schema)` | `pendiente` | Valida body/query/params y responde 400 uniforme. |
| VAL-03 | Definir formato de error de validacion estandar | `pendiente` | Alinear con el global error handler de `index.ts`. |

## Bloque 2 - Migracion de validaciones existentes

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-04 | Esquematizar entradas de auth y usuarios | `pendiente` | login, cambio de contrasena, crear/editar usuario. |
| VAL-05 | Esquematizar entradas de documentos y categorias | `pendiente` | Reemplazar `parsePositiveInt`, `parseDocumentId`, `parseOptionalDate` por esquemas. |
| VAL-06 | Esquematizar entradas de RH y Helpdesk | `pendiente` | Empleados, expediente, tickets, activos, planes. |
| VAL-07 | Retirar helpers de parseo ad-hoc redundantes | `pendiente` | Eliminar duplicacion una vez cubiertos por esquemas. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| VAL-08 | Agregar pruebas de validacion | `pendiente` | Reutiliza infraestructura del Sprint 26 si existe. |
| VAL-09 | Validar build y commit/push | `pendiente` | Sin regresiones en endpoints existentes. |

## Definicion de terminado

- existe middleware de validacion reutilizable
- entradas criticas validadas por esquema, no por chequeos manuales
- formato de error 400 uniforme
- duplicacion de parseo reducida

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 27 creado | `pendiente` | Centralizacion de validacion de entrada. |
