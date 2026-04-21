# Sprint 11 - UI de Configuracion de Expediente por Colaborador

Estado general del sprint: `completada`

Objetivo:
Permitir que RH configure desde la pantalla de colaboradores que secciones y documentos aplican a cada expediente.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Interfaz RH

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| UI-01 | Agregar accion de configuracion documental en colaboradores | `completada` | Acceso desde tabla y ficha del colaborador. |
| UI-02 | Crear modal de secciones y documentos asignables | `completada` | Arbol con checks por seccion y tipo documental. |
| UI-03 | Agregar acciones rapidas de seleccion | `completada` | Seleccionar todo y limpiar seleccion. |
| UI-04 | Mostrar resumen de secciones/documentos habilitados | `completada` | Ayuda a revisar configuracion antes de guardar. |

## Bloque 2 - Integracion API

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| API-01 | Consumir lectura de matriz documental | `completada` | `GET /employees/:id/document-access`. |
| API-02 | Consumir guardado de matriz documental | `completada` | `PUT /employees/:id/document-access`. |
| API-03 | Manejar estados de carga, guardado y error | `completada` | Evita cambios ambiguos para RH. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar build frontend | `completada` | `npm run build` paso con advertencia no bloqueante de bundle. |
| QA-02 | Validar build backend | `completada` | `npm run build` paso. |

## Definicion de terminado del sprint

- RH puede abrir configuracion documental desde colaboradores
- RH puede habilitar/deshabilitar secciones y documentos por colaborador
- acciones rapidas funcionan
- la matriz se guarda contra backend
- builds backend y frontend pasan

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Sprint 11 iniciado | `completada` | Se inicia la interfaz de configuracion documental por colaborador. |
| 2026-04-21 | UI de configuracion implementada | `completada` | La pantalla de colaboradores permite editar secciones y documentos habilitados por expediente. |
