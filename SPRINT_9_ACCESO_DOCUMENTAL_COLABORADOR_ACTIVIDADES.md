# Sprint 9 - Acceso Documental por Colaborador

Estado general del sprint: `completada`

Objetivo:
Crear la base tecnica para personalizar por colaborador las secciones y tipos documentales disponibles en su expediente RH.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de acceso a secciones por colaborador | `completada` | Permitira habilitar/deshabilitar secciones RH por expediente. |
| DB-02 | Crear tabla de acceso a tipos documentales por colaborador | `completada` | Permitira habilitar/deshabilitar documentos especificos por expediente. |
| DB-03 | Poblar accesos iniciales para colaboradores existentes | `completada` | Se conserva compatibilidad asignando todo el catalogo activo actual. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Servicio para consultar matriz documental por colaborador | `completada` | Incluye secciones, tipos documentales y estado habilitado. |
| BE-02 | Servicio para guardar matriz documental por colaborador | `completada` | Valida coherencia entre seccion y tipos seleccionados. |
| BE-03 | Endpoint RH para leer/actualizar accesos | `completada` | Disponible para ADMIN y EDITOR RH. |
| BE-04 | Asignar catalogo activo a nuevos colaboradores | `completada` | Evita crear expedientes sin configuracion inicial. |

## Bloque 3 - Frontend base

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Tipos de matriz documental RH | `completada` | Preparacion para UI del Sprint 11. |
| FE-02 | Cliente API para leer/guardar accesos | `completada` | Preparacion para UI del Sprint 11. |

## Definicion de terminado del sprint

- existen tablas de acceso documental por colaborador
- colaboradores existentes conservan acceso completo al catalogo activo
- nuevos colaboradores nacen con acceso completo al catalogo activo
- API permite leer y guardar la matriz documental por colaborador
- cliente frontend tiene funciones base para consumir la API

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Sprint 9 iniciado | `proceso` | Se inicia la fase PMV+ de expediente personalizado por colaborador. |
| 2026-04-21 | Modelo de acceso documental implementado | `completada` | Se agregaron migracion, servicio, endpoints, auditoria y cliente frontend base. |
