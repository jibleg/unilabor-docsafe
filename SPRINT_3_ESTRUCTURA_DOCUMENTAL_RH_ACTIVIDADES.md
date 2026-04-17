# Sprint 3 - Estructura Documental RH

Estado general del sprint: `pendiente`

Objetivo:
Construir la estructura flexible de secciones y tipos documentales que sustentara el expediente digital del colaborador.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar tabla `document_sections` | `pendiente` | Secciones del expediente RH. |
| DB-02 | Disenar tabla `document_types` | `pendiente` | Tipos documentales por seccion. |
| DB-03 | Crear scripts SQL o migraciones | `pendiente` | Con campos de configuracion documental. |
| DB-04 | Insertar secciones iniciales del expediente RH | `pendiente` | Personales, Reglamento, Contratos, Competencias, Constancias. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear CRUD de secciones documentales | `pendiente` | Debe permitir orden y activacion. |
| BE-02 | Crear CRUD de tipos documentales | `pendiente` | Debe soportar catalogo fijo y personalizado. |
| BE-03 | Implementar propiedades documentales | `pendiente` | `is_required`, `is_sensitive`, `has_expiry`, `is_system_defined`. |
| BE-04 | Crear filtros por seccion y estado | `pendiente` | Base para administracion. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `DocumentSectionsPage` | `pendiente` | Administracion de secciones RH. |
| FE-02 | Crear `DocumentTypesPage` | `pendiente` | Administracion de tipos documentales RH. |
| FE-03 | Crear formularios de alta y edicion | `pendiente` | Deben soportar configuracion flexible. |
| FE-04 | Mostrar propiedades clave del tipo documental | `pendiente` | Sensible, obligatorio, con vencimiento. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alta de secciones | `pendiente` | Debe respetar orden y estado. |
| QA-02 | Validar alta de tipos documentales | `pendiente` | Debe quedar vinculado a seccion. |
| QA-03 | Validar combinacion fijo + personalizado | `pendiente` | Comportamiento esperado de catalogo mixto. |

## Definicion de terminado del sprint

- existen secciones documentales RH
- existen tipos documentales configurables
- se pueden administrar desde frontend
- la estructura del expediente queda lista para uso operativo

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 3 creado | `completada` | Base para futura ejecucion. |
