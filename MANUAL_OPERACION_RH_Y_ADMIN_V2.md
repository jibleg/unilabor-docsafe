# Manual de Operacion SafeDoc V2 para RH y ADMIN

Fecha de actualizacion: `2026-04-20`

## 1. Objetivo del manual

Este manual describe el uso operativo de SafeDoc V2 para perfiles administrativos, con foco en:

- administracion general del sistema
- operacion del modulo `RH`
- rutas clave
- permisos por perfil
- flujo de uso recomendado

## 2. Alcance funcional de SafeDoc V2

SafeDoc V2 opera con dos modulos:

- `QUALITY`: gestion documental institucional y de calidad
- `RH`: expediente digital del colaborador

La plataforma comparte:

- login unico
- control de acceso por modulo
- visor PDF protegido
- auditoria institucional

## 3. Perfiles operativos relevantes

### 3.1 ADMIN

Capacidades generales:

- administrar usuarios
- asignar modulos
- operar `QUALITY`
- operar `RH`
- consultar auditoria

### 3.2 EDITOR

Capacidades segun modulo asignado:

- en `QUALITY`: administrar documentos y categorias segun acceso
- en `RH`: gestionar colaboradores, expedientes, alertas y auditoria RH

### 3.3 VIEWER

Capacidades:

- consultar solo su expediente propio en `RH`
- cargar sus propios documentos
- visualizar sus documentos, incluidos sensibles propios

## 4. Matriz operativa de permisos

| Funcion | ADMIN | EDITOR RH | VIEWER RH |
| --- | --- | --- | --- |
| Entrar a `RH` | Si | Si | Si, si tiene modulo RH |
| Ver dashboard RH | Si | Si | No |
| Gestionar colaboradores | Si | Si | No |
| Ver expediente de cualquier colaborador | Si | Si | No |
| Cargar documentos en expediente ajeno | Si | Si | No |
| Ver alertas RH globales | Si | Si | No |
| Ver auditoria RH | Si | Si | No |
| Ver mi expediente | Si | Si | Si |
| Cargar mis documentos | Si | Si | Si |
| Ver documentos sensibles propios | Si | Si | Si |
| Ver documentos sensibles ajenos | Si | Si | No |

| Funcion | ADMIN QUALITY | EDITOR QUALITY | VIEWER QUALITY |
| --- | --- | --- | --- |
| Ver documentos de calidad | Si | Si | Si, segun categoria |
| Publicar documentos | Si | Si | No |
| Editar metadata o reemplazar documento | Si | Si | No |
| Administrar usuarios | Si | No | No |
| Ver auditoria QUALITY | Si | No | No |

## 5. Rutas clave del sistema

### 5.1 Rutas generales

- `/login`
- `/select-module`
- `/change-password`

### 5.2 Rutas del modulo QUALITY

- `/quality/dashboard`
- `/quality/profile`
- `/quality/documents`
- `/quality/categories`
- `/quality/users`
- `/quality/audit`

### 5.3 Rutas del modulo RH

- `/rh/dashboard`
- `/rh/employees`
- `/rh/expedients`
- `/rh/alerts`
- `/rh/audit`
- `/rh/my-expedient`
- `/rh/document-sections`
- `/rh/document-types`
- `/rh/profile`

## 6. Flujo operativo recomendado para ADMIN

### 6.1 Alta de usuario

1. Ingresar a `QUALITY`.
2. Abrir `/quality/users`.
3. Crear usuario con correo, nombre, rol y modulos habilitados.
4. Asignar `QUALITY`, `RH` o ambos segun necesidad operativa.

### 6.2 Alta de colaborador RH

1. Entrar al modulo `RH`.
2. Abrir `/rh/employees`.
3. Crear colaborador con codigo, nombre, correo, area y puesto.
4. Vincular el `user_id` cuando el colaborador ya tenga cuenta del sistema.

### 6.3 Configuracion documental RH

1. Abrir `/rh/document-sections`.
2. Crear o ajustar secciones del expediente.
3. Abrir `/rh/document-types`.
4. Configurar tipos con estas banderas cuando aplique:
   - obligatorio
   - sensible
   - con vencimiento

### 6.4 Operacion del expediente RH

1. Abrir `/rh/expedients`.
2. Seleccionar colaborador.
3. Revisar:
   - resumen del expediente
   - alertas del colaborador
   - movimientos recientes
4. Cargar documento nuevo o reemplazar vigente.
5. Consultar historial del documento desde el boton `Historial`.
6. Visualizar PDF con visor seguro.

### 6.5 Seguimiento y control

1. Abrir `/rh/alerts` para priorizar faltantes, por vencer y vencidos.
2. Abrir `/rh/audit` para consultar trazabilidad RH.
3. Abrir `/quality/audit` para auditoria del modulo de calidad.

## 7. Flujo operativo recomendado para RH

### 7.1 Revision diaria

1. Entrar a `/rh/dashboard`.
2. Revisar volumen de alertas activas.
3. Abrir `/rh/alerts`.
4. Filtrar por colaborador, area o estado.

### 7.2 Regularizacion de expediente

1. Entrar a `/rh/expedients`.
2. Seleccionar colaborador.
3. Revisar tipos pendientes.
4. Cargar documento faltante o reemplazar version anterior.
5. Confirmar que el panel de alertas y el resumen se actualicen.

### 7.3 Trazabilidad

1. Revisar `Ultimos movimientos del expediente`.
2. Consultar historial por documento cuando se requiera verificar versiones.
3. Usar `/rh/audit` para revisar visualizaciones, cargas y movimientos.

## 8. Flujo operativo del colaborador

1. Ingresar con su cuenta.
2. Si solo tiene `RH`, entra directo al modulo.
3. Abrir `/rh/my-expedient`.
4. Revisar su expediente.
5. Cargar o reemplazar sus propios documentos.
6. Visualizar PDFs propios desde el visor protegido.

## 9. Reglas operativas importantes

- La seguridad real se valida en backend; no depende solo del frontend.
- Un `VIEWER` no puede abrir expedientes ajenos aunque intente acceder por URL.
- Los documentos sensibles ajenos no son visibles para el colaborador.
- Los tipos con vigencia exigen fecha de emision y fecha de vencimiento.
- Un reemplazo documental conserva historial; la version anterior queda historica.
- Las alertas RH distinguen faltantes, por vencer y vencidos.
- La auditoria RH y QUALITY se consulta por modulo.

## 10. Endpoints utiles para soporte tecnico

### 10.1 RH

- `GET /api/rh/alerts`
- `GET /api/rh/employees/:id/alerts`
- `GET /api/rh/employees/:id/expedient`
- `GET /api/rh/employees/:id/documents`
- `GET /api/rh/employees/:id/document-types/:documentTypeId/history`
- `POST /api/rh/employees/:id/documents`
- `GET /api/rh/me/expedient`
- `POST /api/rh/me/documents`
- `GET /api/rh/documents/:documentId/view`

### 10.2 Auditoria

- `GET /api/audit/logs?module_code=QUALITY`
- `GET /api/audit/logs?module_code=RH`
- `GET /api/audit/logs?module_code=RH&employee_id={id}`

## 11. Checklist operativo de cierre diario RH

- revisar alertas vencidas
- revisar alertas por vencer
- revisar expedientes incompletos
- confirmar cargas del dia
- validar movimientos recientes en expedientes criticos
- consultar auditoria RH si hubo incidencias

## 12. Consideraciones de despliegue

- aplicar todas las migraciones SQL del proyecto
- aplicar `unilabor-safedoc/sql/20260420_audit_module_context.sql`
- validar acceso por modulo en usuarios administrativos
- validar compilacion de backend y frontend antes de liberar cambios

## 13. Cierre

SafeDoc V2 queda operativamente preparada para:

- administracion institucional de documentos
- operacion RH sobre expedientes digitales
- consulta del colaborador sobre su expediente propio
- seguimiento por alertas
- trazabilidad por auditoria e historial
