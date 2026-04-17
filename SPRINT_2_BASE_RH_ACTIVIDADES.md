# Sprint 2 - Base RH

Estado general del sprint: `pendiente`

Objetivo:
Crear la base estructural del submodulo de Recursos Humanos para empezar a operar colaboradores y preparar el terreno del expediente digital.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar entidad `employees` | `pendiente` | Debe representar al colaborador como entidad de negocio. |
| DB-02 | Crear script SQL o migracion para tabla `employees` | `pendiente` | Considerar relacion opcional con `users`. |
| DB-03 | Definir indices y restricciones de `employees` | `pendiente` | Validar email, codigo y estado. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear servicio CRUD de colaboradores | `pendiente` | Alta, consulta, actualizacion y baja logica. |
| BE-02 | Crear rutas API de RH para colaboradores | `pendiente` | Deben vivir bajo el contexto del modulo `RH`. |
| BE-03 | Crear politicas de acceso RH para colaboradores | `pendiente` | `ADMIN` y `EDITOR` con acceso total; colaborador solo propio cuando aplique. |
| BE-04 | Preparar relacion `employee <-> user` | `pendiente` | Necesaria para portal del colaborador. |
| BE-05 | Crear servicio para consultar y persistir asignaciones de modulos por usuario | `pendiente` | Debe permitir gestionar `QUALITY` y `RH` desde administracion, sin depender de SQL manual. |
| BE-06 | Extender alta y edicion de usuario para recibir modulos habilitados | `pendiente` | Debe soportar asignacion inicial y actualizacion posterior desde UI. |
| BE-07 | Preparar transicion de `role` global hacia `rol por modulo` | `pendiente` | En esta etapa puede mantenerse compatibilidad, pero la administracion debe empezar a orientarse a modulo. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `RhDashboardPage` inicial | `pendiente` | Puede empezar con placeholders funcionales. |
| FE-02 | Crear `EmployeesPage` | `pendiente` | Listado base de colaboradores. |
| FE-03 | Crear flujo de alta de colaborador | `pendiente` | Modal o pagina dedicada. |
| FE-04 | Crear vista simple de detalle de colaborador | `pendiente` | Base para expediente. |
| FE-05 | Integrar RH sidebar con opciones iniciales | `pendiente` | Dashboard, Colaboradores, Expedientes placeholder. |
| FE-06 | Agregar selector de modulos al formulario de crear usuario | `pendiente` | Debe permitir habilitar `QUALITY`, `RH` o ambos al momento del alta. |
| FE-07 | Agregar gestion de modulos al formulario de editar usuario o perfil administrativo | `pendiente` | Debe permitir cambiar modulos habilitados sin recurrir a base de datos. |
| FE-08 | Preparar UI para evolucionar a rol por modulo | `pendiente` | Puede iniciar con estructura visual compatible aunque el refinamiento completo llegue despues. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alta de colaborador | `pendiente` | Debe guardar correctamente. |
| QA-02 | Validar edicion de colaborador | `pendiente` | Sin romper integridad. |
| QA-03 | Validar visibilidad del modulo RH | `pendiente` | Solo para usuarios autorizados al modulo. |
| QA-04 | Validar alta de usuario con modulos asignados desde UI | `pendiente` | Debe crear usuario y reflejar acceso correcto en login. |
| QA-05 | Validar edicion de modulos de usuario desde UI | `pendiente` | Debe actualizar acceso a `QUALITY`, `RH` o ambos. |
| QA-06 | Validar usuario sin un modulo previamente asignado tras edicion | `pendiente` | Debe perder acceso al modulo removido sin efectos colaterales. |

## Definicion de terminado del sprint

- existe tabla `employees`
- existe CRUD backend de colaboradores
- existe listado frontend de colaboradores
- RH ya tiene una base navegable propia
- administracion de usuarios ya puede asignar modulos desde UI

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 2 creado | `completada` | Base para futura ejecucion. |
