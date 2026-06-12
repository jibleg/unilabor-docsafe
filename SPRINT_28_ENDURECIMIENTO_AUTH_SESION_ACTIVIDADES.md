# Sprint 28 - Endurecimiento de Auth y Sesion

Estado general del sprint: `pendiente`

Objetivo:
Mejorar el manejo de sesion y autenticacion sin romper el flujo actual: expiracion controlada, manejo uniforme de 401 en el frontend y revision de la politica de almacenamiento de token.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-01 | Mover expiracion de JWT a variable de entorno | `pendiente` | Hoy `8h` hardcodeado en `auth.controller.ts`. |
| AUT-02 | Validar `JWT_SECRET` obligatorio al arranque | `pendiente` | Fallar rapido si falta o es el valor `change-me`. |
| AUT-03 | Evaluar refresh token o renovacion controlada | `pendiente` | Decision de diseno: refresh vs reauth. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-04 | Agregar response interceptor en axios | `pendiente` | 401 -> logout + redirect a `/login`. |
| AUT-05 | Manejar token expirado de forma uniforme | `pendiente` | Hoy el error cae por pagina al refetch. |
| AUT-06 | Revisar almacenamiento de token | `pendiente` | Hoy localStorage (`auth-storage`); documentar riesgo XSS y decidir mitigacion. |
| AUT-07 | Confirmacion de logout | `pendiente` | Mejora menor de UX. |

## Bloque 3 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| AUT-08 | Pruebas de expiracion y 401 | `pendiente` | Reutiliza infraestructura del Sprint 26 si existe. |
| AUT-09 | Validar build y commit/push | `pendiente` | Sin romper login ni guards actuales. |

## Definicion de terminado

- expiracion de token configurable y secreto validado al arranque
- 401 manejado de forma central en el frontend
- politica de almacenamiento de token revisada y documentada

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-12 | Archivo del Sprint 28 creado | `pendiente` | Endurecimiento de sesion sin romper el flujo. |
