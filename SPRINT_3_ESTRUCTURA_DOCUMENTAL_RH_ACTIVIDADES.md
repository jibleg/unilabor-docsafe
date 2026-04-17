# Sprint 3 - Estructura Documental RH

Estado general del sprint: `completada`

Objetivo:
Construir la estructura flexible de secciones y tipos documentales que sustentara el expediente digital del colaborador.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla `document_sections` | `completada` | Secciones del expediente RH creadas en `20260417_rh_document_structure.sql`. |
| DB-02 | Disenar tabla `document_types` | `completada` | Tipos documentales por seccion con propiedades configurables. |
| DB-03 | Crear scripts SQL o migraciones | `completada` | Migracion aplicada y validada en base real. |
| DB-04 | Insertar secciones iniciales del expediente RH | `completada` | Se sembraron 5 secciones base y catalogo documental inicial. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear CRUD de secciones documentales | `completada` | Disponible en `/api/rh/document-structure/sections`. |
| BE-02 | Crear CRUD de tipos documentales | `completada` | Disponible en `/api/rh/document-structure/types`. |
| BE-03 | Implementar propiedades documentales | `completada` | Soporta `is_required`, `is_sensitive`, `has_expiry`, `is_system_defined`. |
| BE-04 | Crear filtros por seccion y estado | `completada` | Listado de tipos soporta `section_id`, `is_active`, `is_system_defined`, `search`. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `DocumentSectionsPage` | `completada` | Administracion RH de secciones con alta, edicion e inactivacion. |
| FE-02 | Crear `DocumentTypesPage` | `completada` | Administracion de tipos documentales RH con filtros. |
| FE-03 | Crear formularios de alta y edicion | `completada` | Formularios flexibles para secciones y tipos. |
| FE-04 | Mostrar propiedades clave del tipo documental | `completada` | Se muestran badges de sensible, obligatorio, con vencimiento y base. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alta de secciones | `completada` | Backend y frontend compilados; migracion aplicada y endpoints operativos. |
| QA-02 | Validar alta de tipos documentales | `completada` | Tipos sembrados y listados correctamente con seccion asociada. |
| QA-03 | Validar combinacion fijo + personalizado | `completada` | La estructura soporta catalogo base (`is_system_defined`) y personalizado. |

## Definicion de terminado del sprint

- existen secciones documentales RH
- existen tipos documentales configurables
- se pueden administrar desde frontend
- la estructura del expediente queda lista para uso operativo

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 3 creado | `completada` | Base para futura ejecucion. |
| 2026-04-17 | Estructura documental RH implementada | `completada` | Se agregaron migracion, CRUD backend, UI RH de secciones y tipos, y validacion de compilacion. |
| 2026-04-17 | Migracion aplicada en base real | `completada` | Se confirmaron 5 secciones y 11 tipos base en `document_sections` y `document_types`. |
