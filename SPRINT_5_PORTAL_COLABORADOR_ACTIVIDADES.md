# Sprint 5 - Portal del Colaborador

Estado general del sprint: `pendiente`

Objetivo:
Permitir que el colaborador autenticado vea solo su expediente y pueda cargar sus propios documentos.

## Reglas de estado
- `pendiente`: aun no se inicia.
- `proceso`: ya se esta trabajando o depende de tareas en curso.
- `completada`: terminada y validada.

## Bloque 1 - Backend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| BE-01 | Crear endpoint `mi expediente` | `pendiente` | Solo para el usuario autenticado propietario. |
| BE-02 | Crear endpoint de carga de documentos propios | `pendiente` | Debe validar pertenencia del expediente. |
| BE-03 | Blindar acceso por propietario en backend | `pendiente` | No depender del frontend. |
| BE-04 | Permitir consulta de sensibles propios | `pendiente` | Regla especial para colaborador. |

## Bloque 2 - Frontend

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| FE-01 | Crear `MyExpedientPage` | `pendiente` | Vista personal del colaborador. |
| FE-02 | Adaptar RH sidebar para colaborador | `pendiente` | Mostrar solo opciones permitidas. |
| FE-03 | Crear flujo de carga propia | `pendiente` | Desde expediente personal. |
| FE-04 | Mostrar sensibles propios dentro del expediente | `pendiente` | Solo los del colaborador autenticado. |

## Bloque 3 - QA

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| QA-01 | Validar que el colaborador solo ve su expediente | `pendiente` | Caso critico de seguridad. |
| QA-02 | Validar que el colaborador puede subir solo en su expediente | `pendiente` | Sin poder afectar a terceros. |
| QA-03 | Validar bloqueo de acceso a otros expedientes por URL | `pendiente` | Debe bloquearse en backend. |

## Definicion de terminado del sprint

- existe portal del colaborador
- el colaborador ve su expediente
- puede cargar documentos propios
- no puede acceder a expedientes ajenos

## Bitacora de avance

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Archivo del Sprint 5 creado | `completada` | Base para futura ejecucion. |
