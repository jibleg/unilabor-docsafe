# Sprint 29 - Paginacion y Rendimiento en Listados

Estado general del sprint: `pendiente`

Objetivo:
Incorporar paginacion del lado servidor en los listados que hoy traen todos los registros, para que el sistema escale con el crecimiento de datos sin degradar la experiencia.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-01 | Definir contrato de paginacion estandar | `pendiente` | `page`, `pageSize`, `total`; respuesta uniforme. |
| PAG-02 | Paginar listado de activos Helpdesk | `pendiente` | `listHelpdeskAssets` trae todo hoy. |
| PAG-03 | Paginar listado de tickets Helpdesk | `pendiente` | Volumen alto esperado. |
| PAG-04 | Paginar listado de empleados RH | `pendiente` | `listEmployees`. |
| PAG-05 | Revisar otros listados grandes | `pendiente` | Documentos, usuarios, ordenes de mantenimiento. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-06 | Adaptar `api/service.ts` al contrato de paginacion | `pendiente` | Sin romper normalizadores existentes. |
| PAG-07 | Agregar controles de paginacion en paginas grandes | `pendiente` | Tickets, activos, empleados. |
| PAG-08 | Evitar refetch innecesario al navegar | `pendiente` | Considerar cache/memoizacion ligera. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| PAG-09 | Pruebas de paginacion | `pendiente` | Reutiliza infraestructura del Sprint 26 si existe. |
| PAG-10 | Validar build y commit/push | `pendiente` | Sin regresiones funcionales. |

## Definicion de terminado

- contrato de paginacion uniforme en backend
- listados de alto volumen paginan del lado servidor
- frontend consume paginacion sin romper normalizacion
- navegacion sin refetch redundante en las paginas tocadas

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 29 creado | `pendiente` | Paginacion para escalar con el volumen de datos. |
