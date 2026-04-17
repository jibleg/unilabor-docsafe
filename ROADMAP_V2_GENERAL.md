# Roadmap V2 - SafeDoc UniLabor

Estado general del proyecto: `proceso`

Objetivo general:
Construir la Version 2 de SafeDoc como una plataforma multi-modulo con autenticacion unica, preservando el modulo actual de Calidad e incorporando el submodulo de Recursos Humanos para expediente digital del colaborador.

## Vision de la V2

La V2 estara organizada en dos modulos principales:

- `QUALITY`: gestion documental institucional y de calidad
- `RH`: expediente digital del colaborador

La plataforma compartira:
- login unico
- identidad visual institucional
- motor de usuarios
- permisos y autenticacion
- visor PDF protegido

Cada modulo tendra:
- rutas propias
- sidebar propio
- reglas de acceso propias
- dashboard propio

## Estructura de sprints

| Sprint | Nombre | Objetivo principal | Estado |
| --- | --- | --- | --- |
| 1 | Acceso multi-modulo | Preparar login unico, modulos y roles por modulo | `proceso` |
| 2 | Base RH | Crear base del submodulo RH y CRUD de colaboradores | `pendiente` |
| 3 | Estructura documental RH | Crear secciones y tipos documentales configurables | `pendiente` |
| 4 | Expediente del colaborador | Construir el expediente documental por colaborador | `pendiente` |
| 5 | Portal del colaborador | Permitir al colaborador ver y cargar sus documentos | `pendiente` |
| 6 | Permisos sensibles y constancias | Cerrar seguridad de sensibles y vigencias de constancias | `pendiente` |
| 7 | Alertas y seguimiento | Implementar alertas, faltantes y vencimientos | `pendiente` |
| 8 | Auditoria e historial | Trazabilidad, historial y control institucional | `pendiente` |

## Dependencias clave

1. Sprint 1 habilita toda la arquitectura de acceso para lo que sigue.
2. Sprint 2 crea la entidad de negocio `colaborador`.
3. Sprint 3 define la estructura documental de RH.
4. Sprint 4 depende de Sprint 2 y Sprint 3.
5. Sprint 5 depende del expediente ya operativo.
6. Sprint 6 depende del modelo documental RH y de acceso por propietario.
7. Sprint 7 depende de estados y vigencias.
8. Sprint 8 depende de los flujos ya cerrados.

## Principios del proyecto

- no romper el modulo actual de Calidad
- no depender del frontend para seguridad real
- separar `modulo` de `rol`
- mantener el visor PDF protegido actual
- construir RH como submodulo propio, no como extension improvisada de categorias
- favorecer configuracion flexible sobre rigidez documental

## Definicion de exito de la V2

La V2 se considera lograda cuando:

- existe acceso multi-modulo operativo
- RH funciona como submodulo separado
- cada colaborador tiene expediente digital propio
- RH puede gestionar todos los expedientes
- el colaborador puede ver y subir sus propios documentos
- documentos sensibles quedan protegidos
- constancias manejan vigencia
- existen alertas y auditoria base

## Bitacora general

| Fecha | Hito | Estado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Se define roadmap completo de V2 | `completada` | Base integral para ejecucion sprint por sprint. |
