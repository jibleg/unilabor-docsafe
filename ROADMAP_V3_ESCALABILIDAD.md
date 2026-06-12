# Roadmap V3 - Endurecimiento y Escalabilidad SafeDoc

Estado general del roadmap: `pendiente`

Objetivo general:
Convertir el PMV+ funcional (V2 + Helpdesk) en una base sostenible y escalable, sin agregar modulos nuevos. Cada sprint ataca una sola recomendacion tecnica y es independiente, para ejecutarse de forma selectiva segun la necesidad operativa del momento.

## Principios de la V3

- no romper funcionalidad existente de QUALITY, RH ni HELPDESK
- cada sprint entrega valor por si solo y se puede ejecutar aislado
- preferir cambios incrementales y reversibles
- toda mejora cierra con `npm run build` correcto en backend y frontend
- documentar y versionar igual que en V2 (commit + push por sprint)

## Estructura de sprints

| Sprint | Nombre | Recomendacion que resuelve | Urgencia | Estado |
| --- | --- | --- | --- | --- |
| 23 | Higiene tecnica y baseline | Limpieza rapida (lint, excludes, lockfile, puertos) | alta | `completada` |
| 24 | Migration runner y control de schema | Sin runner de migraciones | alta | `pendiente` |
| 25 | Aplicacion y validacion de migraciones Helpdesk | Migraciones Helpdesk no aplicadas en BD real | alta | `pendiente` |
| 26 | Infraestructura de pruebas | Sin tests | media | `pendiente` |
| 27 | Validacion de entrada centralizada | Sin libreria de validacion | media | `pendiente` |
| 28 | Endurecimiento de auth y sesion | JWT/localStorage sin refresh ni 401 handling | media | `pendiente` |
| 29 | Paginacion y rendimiento en listados | Listados sin paginacion real | media | `pendiente` |
| 30 | Modularidad y reduccion de archivos monoliticos | service.ts y paginas/servicios gigantes | baja | `pendiente` |

## Dependencias sugeridas

1. Sprint 24 (runner) habilita Sprint 25 (aplicar migraciones por runner). Si urge operar, se puede aplicar a mano primero y formalizar el runner despues.
2. Sprint 26 (pruebas) conviene antes de 27, 29 y 30 para refactorizar con red de seguridad, pero no es bloqueante.
3. Sprint 23 (baseline) es independiente y de bajo riesgo: buen primer paso.
4. Sprints 27, 28, 29 y 30 son independientes entre si.

## Definicion de exito de la V3

La V3 se considera lograda cuando:

- existe un mecanismo controlado y repetible de migraciones de base de datos
- las migraciones Helpdesk estan aplicadas y validadas en navegador
- existe una red minima de pruebas automatizadas que protege los flujos criticos
- la entrada de datos se valida de forma consistente y centralizada
- la sesion maneja expiracion y errores de autenticacion de forma controlada
- los listados grandes pagina del lado servidor
- los archivos mas grandes estan divididos en unidades mantenibles

Nota: no es obligatorio completar los 8 sprints. El roadmap esta disenado para ejecucion selectiva segun prioridad operativa.

## Bitacora general

| Fecha | Hito | Estado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Se define roadmap V3 de escalabilidad | `pendiente` | Un sprint por recomendacion tecnica, ejecucion selectiva. |
| 2026-06-12 | Sprint 23 (higiene tecnica) ejecutado | `completada` | Primer sprint de la V3 cerrado; baseline limpio. |
