# Sprint 14 - Gestion Tecnica de Activos

Estado general del sprint: `completada`

Objetivo:
Crear el inventario tecnico de equipos, instrumentos, computadoras y activos del laboratorio, con asignacion a colaboradores, areas o ubicaciones.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de activos/equipos | `completada` | Codigo interno, nombre, categoria, marca, modelo, serie. |
| DB-02 | Crear soporte para asignaciones | `completada` | Colaborador, area o ubicacion. |
| DB-03 | Crear soporte para documentos/evidencias del equipo | `completada` | Base de tabla para documentos/evidencias del activo. |
| DB-04 | Crear historial basico de cambios del activo | `completada` | Historial de creacion, actualizacion y baja logica. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | CRUD de activos | `completada` | Alta, edicion, consulta, baja logica. |
| BE-02 | Validar codigo interno unico | `completada` | Indice unico activo por codigo interno. |
| BE-03 | Asignar activo a colaborador/area/ubicacion | `completada` | Integracion con RH mediante colaboradores activos. |
| BE-04 | Registrar auditoria de cambios | `completada` | `module_code = HELPDESK`. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear pagina de equipos/activos | `completada` | Tabla con busqueda operativa. |
| FE-02 | Crear formulario de alta/edicion | `completada` | Campos tecnicos, operativos y de inventario previo. |
| FE-03 | Crear ficha del activo | `completada` | Estado, asignacion y datos tecnicos principales. |

## Definicion de terminado

- inventario tecnico funcional
- activos asignables a colaboradores/areas/ubicaciones
- estado operativo visible
- cambios auditados

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 14 creado | `completada` | Base para inventario tecnico Helpdesk. |
| 2026-04-21 | Inventario tecnico implementado | `completada` | CRUD de activos, catalogos normalizados, asignacion RH, historial y migracion aplicada localmente. |
