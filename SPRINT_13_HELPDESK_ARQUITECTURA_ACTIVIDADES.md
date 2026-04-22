# Sprint 13 - Arquitectura del Modulo HELP DESK

Estado general del sprint: `completada`

Objetivo:
Habilitar el modulo `HELPDESK` dentro de SafeDoc, con permisos, rutas, navegacion base y catalogos iniciales para mesa de ayuda, activos y mantenimiento.

## Bloque 1 - Base del modulo

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MOD-01 | Registrar modulo `HELPDESK` en catalogo de modulos | `completada` | Debe convivir con `QUALITY` y `RH`. |
| MOD-02 | Agregar acceso por modulo para usuarios | `completada` | Usa el esquema actual de permisos por modulo. |
| MOD-03 | Definir roles operativos del modulo | `completada` | En esta base se mapean a ADMIN, EDITOR y VIEWER por modulo. |
| MOD-04 | Crear rutas backend base | `completada` | Prefijo disponible: `/api/helpdesk`. |
| MOD-05 | Crear layout/sidebar frontend del modulo | `completada` | Navegacion propia del modulo. |

## Bloque 2 - Catalogos iniciales

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| CAT-01 | Catalogo de categorias de equipo | `completada` | Laboratorio, computo, refrigeracion, mobiliario, infraestructura. |
| CAT-02 | Catalogo de ubicaciones | `completada` | Base inicial con ubicaciones generales y sin asignar. |
| CAT-03 | Catalogo de criticidad | `completada` | Baja, media, alta, critica. |
| CAT-04 | Catalogo de estados operativos | `completada` | Operativo, condicionado, mantenimiento, fuera de servicio, retirado. |
| CAT-05 | Catalogo de tipos de solicitud | `completada` | Falla, reparacion, soporte, correctivo, revision, requerimiento. |

## Bloque 3 - Frontend base

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear dashboard base del modulo | `completada` | Inicia con resumen listo para siguientes sprints. |
| FE-02 | Agregar acceso desde selector de modulos | `completada` | Solo usuarios con modulo asignado. |
| FE-03 | Agregar proteccion por modulo | `completada` | Usa `ModuleGuard`. |

## Definicion de terminado

- modulo `HELPDESK` visible y protegido por permisos
- rutas backend/frontend listas
- catalogos base creados o planeados en migracion
- dashboard inicial accesible

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 13 creado | `completada` | Base para iniciar modulo Helpdesk. |
| 2026-04-21 | Arquitectura Helpdesk implementada | `completada` | Se agregaron modulo, rutas, layout, dashboard, selector, permisos y catalogos base. |
