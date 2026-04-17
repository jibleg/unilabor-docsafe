# Sprint 1 - Acceso Multi-Modulo

Estado general del sprint: `proceso`

Objetivo:
Preparar SafeDoc para operar con `QUALITY` y `RH` usando un solo login, seleccion de modulo, roles por modulo y navegacion separada, sin romper el modulo actual de Calidad.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Base de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| DB-01 | Disenar modelo de datos para `modules` y `user_module_roles` | `completada` | Diseno aterrizado en el script `20260416_multi_module_access_control.sql`. |
| DB-02 | Crear script SQL o migracion para tabla `modules` | `completada` | Script creado, aplicado y validado en la base. |
| DB-03 | Crear script SQL o migracion para tabla `user_module_roles` | `completada` | Script creado, aplicado y validado en la base. |
| DB-04 | Agregar indices, foreign keys y restriccion unica por `user_id + module_id` | `completada` | Definidos, aplicados y validados en la base. |
| DB-05 | Insertar modulos iniciales `QUALITY` y `RH` | `completada` | Modulos insertados y verificados en BD. |
| DB-06 | Migrar usuarios activos actuales al modulo `QUALITY` con su rol actual | `completada` | Migracion ejecutada y validada en BD. |

## Bloque 2 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear servicio para consultar modulos activos de un usuario | `completada` | Servicio creado en `module-access.service.ts` con fallback seguro a `QUALITY` si las tablas aun no existen. |
| BE-02 | Adaptar login para devolver `availableModules` | `completada` | Login backend ya devuelve `availableModules`. |
| BE-03 | Definir contrato de respuesta de sesion multi-modulo | `completada` | Tipos backend y frontend actualizados con `ModuleAccess` y `availableModules`. |
| BE-04 | Crear helper de autorizacion por modulo | `completada` | El helper de consulta reusable vive en `module-access.service.ts`. |
| BE-05 | Crear middleware `authorizeModuleAccess` | `completada` | Middleware creado y aplicado al modulo actual de `QUALITY`. |
| BE-06 | Crear middleware `authorizeModuleRole` | `completada` | Middleware creado para enforcement por rol dentro del modulo. |
| BE-07 | Definir estrategia de transicion para rutas actuales de Calidad | `completada` | Todo lo actual se trata como `QUALITY` con validacion backend y redirecciones frontend. |
| BE-08 | Preparar soporte futuro para registrar `module_code` en auditoria | `pendiente` | No obligatorio cerrarlo en este sprint. |

## Bloque 3 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Extender store de autenticacion con `availableModules` y `activeModule` | `completada` | Store ya soporta modulos disponibles y modulo activo persistente. |
| FE-02 | Crear tipo frontend para modulo habilitado | `completada` | Tipo `ModuleAccess` agregado en frontend. |
| FE-03 | Adaptar flujo post-login segun cantidad de modulos | `completada` | Login ya redirige segun cantidad de modulos habilitados. |
| FE-04 | Crear pantalla `ModuleSelectorPage` | `completada` | Selector visual creado para `QUALITY` y `RH`. |
| FE-05 | Implementar accion `setActiveModule` | `completada` | Ya existe en store y se usa en selector de modulo. |
| FE-06 | Persistir ultimo modulo activo | `completada` | Se persiste en `auth-storage`. |
| FE-07 | Crear `ModuleGuard` para proteger rutas por modulo | `completada` | Bloquea acceso por URL manual y sincroniza `activeModule`. |
| FE-08 | Separar arbol de rutas en `/quality/*` y `/rh/*` | `completada` | Rutas separadas y redirects legacy implementados. |
| FE-09 | Crear `QualityLayout` | `completada` | Wrapper creado sobre el layout principal. |
| FE-10 | Crear `RhLayout` inicial | `completada` | Layout inicial creado para RH. |
| FE-11 | Crear `QualitySidebar` y `RhSidebar` separados | `completada` | La navegacion en sidebar/navbar ya se adapta segun el modulo activo. |
| FE-12 | Agregar opcion `Cambiar modulo` en navbar o menu de usuario | `completada` | Disponible en desktop y mobile cuando existe mas de un modulo. |

## Bloque 4 - UX y contenido

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| UX-01 | Definir copy del selector de modulo | `completada` | Selector ya comunica modulo, descripcion y rol. |
| UX-02 | Ajustar login para comunicar visualmente los dos modulos | `completada` | Login ya presenta visualmente `QUALITY` y `RH`. |
| UX-03 | Definir mensajes para usuarios sin modulos o sin acceso | `completada` | Flujo ya contempla mensaje para cuentas sin modulos habilitados. |

## Bloque 5 - QA y validacion

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Probar usuario con solo `QUALITY` | `pendiente` | Debe entrar directo a Calidad. |
| QA-02 | Probar usuario con solo `RH` | `pendiente` | Debe entrar directo a RH. |
| QA-03 | Probar usuario con ambos modulos | `pendiente` | Debe mostrar selector de modulo. |
| QA-04 | Probar acceso manual a modulo no autorizado por URL | `pendiente` | Debe bloquear. |
| QA-05 | Probar usuario sin modulos activos | `pendiente` | Debe mostrar error controlado. |
| QA-06 | Validar que Calidad siga funcionando sin ruptura visible | `pendiente` | Criterio clave del sprint. |

## Orden de ejecucion recomendado

1. `DB-01` a `DB-06`
2. `BE-01` a `BE-07`
3. `FE-01` a `FE-08`
4. `FE-09` a `FE-12`
5. `UX-01` a `UX-03`
6. `QA-01` a `QA-06`

## Definicion de terminado del sprint

El Sprint 1 se considera `completada` cuando:

- existe catalogo de modulos
- existe relacion usuario-modulo-rol
- usuarios actuales estan asociados a `QUALITY`
- login devuelve modulos habilitados
- el frontend maneja `activeModule`
- existe selector de modulo para usuarios con acceso multiple
- existen rutas separadas para `QUALITY` y `RH`
- existe proteccion por modulo en frontend y backend
- el modulo actual de Calidad sigue operativo

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Documento inicial del Sprint 1 creado | `completada` | Base de trabajo para ejecucion real. |
| 2026-04-16 | Modelo multi-modulo definido y script SQL base creado | `completada` | Se creo `20260416_multi_module_access_control.sql` con tablas, indices, seed y migracion inicial a `QUALITY`. |
| 2026-04-16 | Migracion multi-modulo aplicada en BD | `completada` | Se validaron modulos `QUALITY` y `RH` y las asignaciones iniciales en `user_module_roles`. |
| 2026-04-16 | Servicio de acceso a modulos y login extendido | `completada` | Backend y contrato frontend ya contemplan `availableModules`. |
| 2026-04-16 | Sesion multi-modulo y selector base implementados | `completada` | Frontend ya maneja `availableModules`, `activeModule` y `/select-module`. |
| 2026-04-16 | Proteccion por modulo, rutas separadas y UX base cerradas | `completada` | Se implementaron middlewares de modulo, rutas `/quality/*` y `/rh/*`, layouts y cambio de modulo. |
