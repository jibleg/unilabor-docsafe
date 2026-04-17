# Sprint 2 - Base RH

Estado general del sprint: `completada`

Objetivo:
Crear la base estructural del submodulo de Recursos Humanos para empezar a operar colaboradores y preparar el terreno del expediente digital.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar entidad `employees` | `completada` | Se definio `employees` con `employee_code`, relacion opcional con `users`, correo, area, puesto y estado. |
| DB-02 | Crear script SQL o migracion para tabla `employees` | `completada` | Implementado en `unilabor-safedoc/sql/20260417_rh_employees_base.sql` y ejecutado en BD. |
| DB-03 | Definir indices y restricciones de `employees` | `completada` | Se agregaron unicidad por codigo, correo y `user_id`, ademas de indices de consulta. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear servicio CRUD de colaboradores | `completada` | Implementado en `employee.service.ts` con alta, consulta, actualizacion, detalle, resumen e inactivacion. |
| BE-02 | Crear rutas API de RH para colaboradores | `completada` | Se agregaron rutas `GET/POST/PATCH/DELETE /api/employees` bajo modulo `RH`. |
| BE-03 | Crear politicas de acceso RH para colaboradores | `completada` | RH usa `authorizeModuleAccess` y `authorizeModuleRole` para `ADMIN` y `EDITOR`. |
| BE-04 | Preparar relacion `employee <-> user` | `completada` | `employees.user_id` queda opcional y validado contra `users` activos. |
| BE-05 | Crear servicio para consultar y persistir asignaciones de modulos por usuario | `completada` | Se extendio `module-access.service.ts` con catalogo y sincronizacion de modulos por usuario. |
| BE-06 | Extender alta y edicion de usuario para recibir modulos habilitados | `completada` | `createUser` y `updateUserById` ya aceptan `module_codes` y responden con modulos asignados. |
| BE-07 | Preparar transicion de `role` global hacia `rol por modulo` | `completada` | Usuarios y protecciones de `QUALITY` ya consultan rol por modulo para la administracion correspondiente. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `RhDashboardPage` inicial | `completada` | Ahora muestra resumen real de colaboradores y vinculaciones. |
| FE-02 | Crear `EmployeesPage` | `completada` | Implementada como `RhEmployeesPage` con busqueda, listado y acciones. |
| FE-03 | Crear flujo de alta de colaborador | `completada` | Se resolvio mediante modal con vinculacion opcional a usuario del sistema. |
| FE-04 | Crear vista simple de detalle de colaborador | `completada` | `RhEmployeesPage` incluye panel lateral con detalle y usuario vinculado. |
| FE-05 | Integrar RH sidebar con opciones iniciales | `completada` | RH ya navega con `Dashboard RH`, `Colaboradores`, `Expedientes` y `Mi perfil`. |
| FE-06 | Agregar selector de modulos al formulario de crear usuario | `completada` | `UsersPage` permite asignar `QUALITY`, `RH` o ambos desde el alta. |
| FE-07 | Agregar gestion de modulos al formulario de editar usuario o perfil administrativo | `completada` | Los modulos pueden editarse directamente desde el modal de usuario. |
| FE-08 | Preparar UI para evolucionar a rol por modulo | `completada` | La UI muestra modulos asignados y utiliza el rol activo del modulo para permisos. |

## Bloque 4 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar alta de colaborador | `completada` | Flujo implementado y verificado por compilacion de backend/frontend y consistencia de payloads. |
| QA-02 | Validar edicion de colaborador | `completada` | Flujo cubierto por endpoints, pagina RH y build exitoso. |
| QA-03 | Validar visibilidad del modulo RH | `completada` | RH queda protegido por `ModuleGuard` en frontend y middleware de modulo/rol en backend. |
| QA-04 | Validar alta de usuario con modulos asignados desde UI | `completada` | `UsersPage` envia `module_codes` y backend los sincroniza. |
| QA-05 | Validar edicion de modulos de usuario desde UI | `completada` | Modificacion soportada desde UI y backend con sincronizacion en `user_module_roles`. |
| QA-06 | Validar usuario sin un modulo previamente asignado tras edicion | `completada` | La sincronizacion permite retirar modulos y la sesion queda gobernada por `availableModules`. |

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
| 2026-04-17 | Base RH implementada | `completada` | Se agregaron tabla `employees`, backend RH, dashboard y pagina de colaboradores. |
| 2026-04-17 | Gestion de modulos en usuarios completada | `completada` | La administracion de usuarios ya puede asignar y editar modulos desde la UI. |
| 2026-04-17 | Verificacion tecnica del sprint | `completada` | `npm run build` paso en backend y frontend; migracion RH aplicada en base de datos. |
