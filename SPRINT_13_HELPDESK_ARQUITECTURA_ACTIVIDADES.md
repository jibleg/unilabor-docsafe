# Sprint 13 - Arquitectura del Modulo HELP DESK

Estado general del sprint: `pendiente`

Objetivo:
Habilitar el modulo `HELPDESK` dentro de SafeDoc, con permisos, rutas, navegacion base y catalogos iniciales para mesa de ayuda, activos y mantenimiento.

## Bloque 1 - Base del modulo

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| MOD-01 | Registrar modulo `HELPDESK` en catalogo de modulos | `pendiente` | Debe convivir con `QUALITY` y `RH`. |
| MOD-02 | Agregar acceso por modulo para usuarios | `pendiente` | Usar el esquema actual de permisos por modulo. |
| MOD-03 | Definir roles operativos del modulo | `pendiente` | ADMIN, SOPORTE, MANTENIMIENTO, CALIDAD, JEFE_AREA, COLABORADOR. |
| MOD-04 | Crear rutas backend base | `pendiente` | Prefijo sugerido: `/api/helpdesk`. |
| MOD-05 | Crear layout/sidebar frontend del modulo | `pendiente` | Navegacion propia del modulo. |

## Bloque 2 - Catalogos iniciales

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| CAT-01 | Catalogo de categorias de equipo | `pendiente` | Laboratorio, computo, refrigeracion, medicion, infraestructura. |
| CAT-02 | Catalogo de ubicaciones | `pendiente` | Areas fisicas o funcionales del laboratorio. |
| CAT-03 | Catalogo de criticidad | `pendiente` | Baja, media, alta, critica. |
| CAT-04 | Catalogo de estados operativos | `pendiente` | Operativo, condicionado, mantenimiento, fuera de servicio, retirado. |
| CAT-05 | Catalogo de tipos de solicitud | `pendiente` | Falla, reparacion, soporte, correctivo, revision, requerimiento. |

## Bloque 3 - Frontend base

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear dashboard base del modulo | `pendiente` | Puede iniciar con resumen vacio/listo para siguientes sprints. |
| FE-02 | Agregar acceso desde selector de modulos | `pendiente` | Solo usuarios con modulo asignado. |
| FE-03 | Agregar proteccion por modulo | `pendiente` | Usar `ModuleGuard`. |

## Definicion de terminado

- modulo `HELPDESK` visible y protegido por permisos
- rutas backend/frontend listas
- catalogos base creados o planeados en migracion
- dashboard inicial accesible

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 13 creado | `pendiente` | Base para iniciar modulo Helpdesk. |
