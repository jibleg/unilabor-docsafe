# Sprint 28 - Endurecimiento de Auth y Sesion

Estado general del sprint: `completada`

Objetivo:
Mejorar el manejo de sesion y autenticacion sin romper el flujo actual: expiracion controlada, manejo uniforme de 401 en el frontend y revision de la politica de almacenamiento de token.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-01 | Mover expiracion de JWT a variable de entorno | `completada` | `JWT_EXPIRES_IN` (default 8h) via `src/config/env.ts` (`getJwtExpiresIn`). |
| AUT-02 | Validar `JWT_SECRET` obligatorio al arranque | `completada` | `assertRequiredEnv()` en `index.ts`: el servidor sale (exit 1) si falta o es `change-me`. Verificado. |
| AUT-03 | Evaluar refresh token o renovacion controlada | `completada` | Decision: re-autenticacion controlada (401 -> login) en vez de refresh tokens; con token en localStorage el refresh aporta poca seguridad. Se difiere a una futura migracion a cookies httpOnly. Documentado en README. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-04 | Agregar response interceptor en axios | `completada` | `handleResponseError` en `src/api/axios.ts`: 401 -> logout + redirect `/login`, excluyendo endpoints de auth. |
| AUT-05 | Manejar token expirado de forma uniforme | `completada` | El backend ahora devuelve 401 (no 403) para token expirado/invalido; el interceptor lo maneja de forma central. 403 queda solo para permisos. |
| AUT-06 | Revisar almacenamiento de token | `completada` | Documentado en README: localStorage con riesgo XSS; mitigacion actual (expiracion + 401 central) y futura (cookie httpOnly). |
| AUT-07 | Confirmacion de logout | `completada` | `window.confirm` antes de cerrar sesion en AppNavbar y AppSidebar. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-08 | Pruebas de expiracion y 401 | `completada` | Backend: `verifyToken` (sin token/expirado/valido/428) y `env.ts` (assertRequiredEnv, expiry). Frontend: `handleResponseError` (401/auth-endpoint/no-401). |
| AUT-09 | Validar build y commit/push | `completada` | Builds backend y frontend OK; 77 tests verdes (53 back + 24 front); smoke login 200 y token invalido 401. Fail-fast verificado. Commit + push. |

## Definicion de terminado

- expiracion de token configurable y secreto validado al arranque
- 401 manejado de forma central en el frontend
- politica de almacenamiento de token revisada y documentada

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 28 creado | `pendiente` | Endurecimiento de sesion sin romper el flujo. |
| 2026-06-12 | Endurecimiento de auth/sesion ejecutado | `completada` | JWT_SECRET validado al arranque, expiry configurable, interceptor 401 central (backend 401 para token invalido), confirmacion de logout, storage documentado. 77 tests verdes. |
