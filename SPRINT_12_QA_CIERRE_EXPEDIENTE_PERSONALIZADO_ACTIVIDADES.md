# Sprint 12 - QA y Cierre de Expediente Personalizado

Estado general del sprint: `completada`

Objetivo:
Validar la fase PMV+ de expediente personalizado por colaborador, actualizar documentacion operativa y dejar la funcionalidad lista para prueba de usuario.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - QA funcional

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar configuracion documental por colaborador | `completada` | RH puede seleccionar secciones y documentos desde colaboradores. |
| QA-02 | Validar impacto en expediente RH | `completada` | El expediente solo muestra documentos habilitados por backend. |
| QA-03 | Validar impacto en portal del colaborador | `completada` | Mi expediente solo muestra documentos habilitados por backend. |
| QA-04 | Validar alertas con expedientes parciales | `completada` | Faltantes y vencimientos ignoran documentos deshabilitados. |

## Bloque 2 - Documentacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DOC-01 | Actualizar roadmap con fase PMV+ | `completada` | Se agregan Sprints 9 a 12. |
| DOC-02 | Actualizar manual operativo RH/Admin | `completada` | Se documenta configuracion personalizada por colaborador. |

## Bloque 3 - Validacion tecnica

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| TEC-01 | Validar build backend | `completada` | `npm run build` paso. |
| TEC-02 | Validar build frontend | `completada` | `npm run build` paso con advertencia no bloqueante de bundle. |
| TEC-03 | Levantar entorno local para prueba | `completada` | Backend y frontend disponibles para validacion. |

## Definicion de terminado del sprint

- roadmap refleja PMV+ de expediente personalizado
- manual operativo explica la nueva configuracion
- backend y frontend compilan correctamente
- entorno local queda disponible para validar la funcionalidad

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-21 | Sprint 12 iniciado | `completada` | Se inicia cierre QA/documental y preparacion del entorno de prueba. |
| 2026-04-21 | Entorno local preparado para validacion | `completada` | Migracion aplicada, backend en puerto 4000 y frontend en puerto 5173. |
