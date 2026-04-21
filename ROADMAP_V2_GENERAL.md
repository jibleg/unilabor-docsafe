# Roadmap V2 - SafeDoc UniLabor

Estado general del proyecto: `completada`

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
| 1 | Acceso multi-modulo | Preparar login unico, modulos y roles por modulo | `completada` |
| 2 | Base RH | Crear base del submodulo RH y CRUD de colaboradores | `completada` |
| 3 | Estructura documental RH | Crear secciones y tipos documentales configurables | `completada` |
| 4 | Expediente del colaborador | Construir el expediente documental por colaborador | `completada` |
| 5 | Portal del colaborador | Permitir al colaborador ver y cargar sus documentos | `completada` |
| 6 | Permisos sensibles y constancias | Cerrar seguridad de sensibles y vigencias de constancias | `completada` |
| 7 | Alertas y seguimiento | Implementar alertas, faltantes y vencimientos | `completada` |
| 8 | Auditoria e historial | Trazabilidad, historial y control institucional | `completada` |
| 9 | Acceso documental por colaborador | Crear matriz de secciones y documentos asignados por colaborador | `completada` |
| 10 | Aplicacion de permisos en expediente | Aplicar la matriz en expediente, portal, cargas y alertas | `completada` |
| 11 | UI de configuracion documental | Permitir a RH configurar expediente personalizado por colaborador | `completada` |
| 12 | QA y cierre PMV+ | Validar, documentar y preparar prueba de usuario | `completada` |

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

Estado de cierre:

- acceso multi-modulo operativo y validado
- RH operativo como submodulo separado
- expediente digital por colaborador implementado
- portal del colaborador implementado
- seguridad de sensibles y vigencias implementada
- alertas y auditoria RH implementadas
- la V2 funcional queda cerrada en codigo y documentacion

Estado PMV+:

- cada colaborador puede tener secciones documentales personalizadas
- cada colaborador puede tener tipos documentales personalizados por seccion
- expediente, portal, cargas, historial y alertas respetan la matriz asignada
- RH puede configurar la matriz desde la pantalla de colaboradores

## Bitacora general

| Fecha | Hito | Estado | Comentario |
| --- | --- | --- | --- |
| 2026-04-16 | Se define roadmap completo de V2 | `completada` | Base integral para ejecucion sprint por sprint. |
| 2026-04-17 | Sprints 1 a 7 implementados en la base del producto | `completada` | Se cerraron acceso multi-modulo, base RH, estructura documental, expediente, portal, sensibles y alertas. |
| 2026-04-20 | Sprint 8 implementado y V2 funcionalmente cerrada | `completada` | Se agregaron auditoria multi-modulo, historial RH y trazabilidad institucional. |
| 2026-04-21 | Fase PMV+ de expediente personalizado implementada | `completada` | Se agregaron matriz documental por colaborador, aplicacion de permisos, UI de configuracion RH y entorno de validacion. |
