# Sprint 14 - Gestion Tecnica de Activos

Estado general del sprint: `pendiente`

Objetivo:
Crear el inventario tecnico de equipos, instrumentos, computadoras y activos del laboratorio, con asignacion a colaboradores, areas o ubicaciones.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Crear tabla de activos/equipos | `pendiente` | Codigo interno, nombre, categoria, marca, modelo, serie. |
| DB-02 | Crear soporte para asignaciones | `pendiente` | Colaborador, area o ubicacion. |
| DB-03 | Crear soporte para documentos/evidencias del equipo | `pendiente` | Manuales, garantias, certificados, fotos. |
| DB-04 | Crear historial basico de cambios del activo | `pendiente` | Estado, responsable, ubicacion, asignacion. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | CRUD de activos | `pendiente` | Alta, edicion, consulta, baja logica. |
| BE-02 | Validar codigo interno unico | `pendiente` | Debe ser trazable y auditable. |
| BE-03 | Asignar activo a colaborador/area/ubicacion | `pendiente` | Integracion con RH. |
| BE-04 | Registrar auditoria de cambios | `pendiente` | `module_code = HELPDESK`. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear pagina de equipos/activos | `pendiente` | Tabla con filtros. |
| FE-02 | Crear formulario de alta/edicion | `pendiente` | Campos tecnicos y operativos. |
| FE-03 | Crear ficha del activo | `pendiente` | Estado, asignacion, documentos, historial. |

## Definicion de terminado

- inventario tecnico funcional
- activos asignables a colaboradores/areas/ubicaciones
- estado operativo visible
- cambios auditados

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Archivo del Sprint 14 creado | `pendiente` | Base para inventario tecnico Helpdesk. |
