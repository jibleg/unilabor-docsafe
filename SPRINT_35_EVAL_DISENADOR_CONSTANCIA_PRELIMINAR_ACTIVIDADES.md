# Sprint 35 - Disenador de Constancia y Vista Preliminar

Estado general del sprint: `completada`

Objetivo:
Integrar el motor de generacion de PDF e implementar el disenador de constancia: mientras RH disena la evaluacion, puede configurar la plantilla de la constancia (logo, textos con placeholders, una o varias firmas) y visualizar un preliminar (render del PDF con datos de muestra) para ajustar firmas, texto y logo antes de publicar. El mismo motor de render se reusara para la generacion real (Sprint 36).

Dependencia:
Requiere Sprint 31 (capacitacion/plantilla a la que se asocia la constancia). Aporta el motor PDF para Sprint 36.

## Bloque 1 - Modelo de datos

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-48 | Tabla `certificate_templates` | `completada` | Ligada a capacitacion/plantilla: `title_text`, `body_text` (con placeholders {{nombre}},{{capacitacion}},{{fecha}},{{calificacion}},{{vigencia}}), `logo_path`, `orientation` ('landscape'|'portrait'), timestamps. |
| EVAL-49 | Tabla `certificate_template_signatures` | `completada` | 1..N firmas: `template_id`, `signatory_name`, `role`, `signature_image_path`, `sort_order`. |

## Bloque 2 - Backend (motor PDF + plantilla)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-50 | Integrar pdfkit | `completada` | Dependencia backend. Servicio `certificate-render.service.ts` que dado (plantilla + datos) produce el PDF. Reusable por preliminar y generacion real. |
| EVAL-51 | Resolucion de placeholders | `completada` | Sustituir {{nombre}}/{{capacitacion}}/{{fecha}}/{{calificacion}}/{{vigencia}} y componer logo + firmas (imagenes) en el layout. |
| EVAL-52 | CRUD de plantilla de constancia | `completada` | Endpoints para guardar plantilla y firmas; subir logo/imagenes de firma reusando el patron de upload (`upload.middleware.ts`, validar imagen). Zod. |
| EVAL-53 | Endpoint de preliminar | `completada` | `GET /rh/certificate-templates/:id/preview`: render del PDF con datos de muestra ("Juan Perez", hoy, 95%, vigencia 12m). Devuelve PDF inline. |

## Bloque 3 - Frontend (disenador + preview)

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-54 | Editor de plantilla de constancia | `completada` | Dentro del diseno de la evaluacion: textos con placeholders, carga de logo, alta de firmas (nombre/cargo/imagen). |
| EVAL-55 | Vista preliminar | `completada` | Boton "Ver preliminar" que muestra el PDF de muestra en el visor existente (`@react-pdf-viewer`), para ajustar antes de publicar. |

## Bloque 4 - Cierre

| ID | Actividad | Estado | Notas |
| --- | --- | --- | --- |
| EVAL-56 | Pruebas | `completada` | Backend: resolucion de placeholders y que el preview genere un PDF valido (no vacio). |
| EVAL-57 | Build, lint y commit/push | `completada` | Verdes. Migraciones aplicadas. |

## Definicion de terminado

- existe plantilla de constancia disenable (logo, textos, firmas)
- RH puede ver un preliminar con datos de muestra y ajustar antes de publicar
- el motor de render queda listo para reusarse en la generacion real
- builds, tests y lint verdes

## Bitacora

| Fecha | Actividad | Estado actualizado | Comentario |
| --- | --- | --- | --- |
| 2026-06-17 | Archivo del Sprint 35 creado | `pendiente` | Disenador de constancia + preliminar; integra motor PDF (pdfkit). |
| 2026-06-17 | Sprint 35 ejecutado completo | `completada` | Migraciones `sql/20260617_09..10` (certificate_templates 1:1 por curso + certificate_template_signatures). Dependencia **pdfkit** instalada. Backend: `certificate-render.service.ts` (motor reutilizable: marco decorativo, logo subido o asset Unilabor por defecto, placeholders {{nombre}}/{{capacitacion}}/{{fecha}}/{{calificacion}}/{{vigencia}}, 1..4 firmas con linea/nombre/cargo/imagen; devuelve Buffer), `certificate-template.service.ts` (get con defaults no persistidos, upsert ON CONFLICT + reemplazo de firmas, buildPreviewRenderInput con datos de muestra), `certificate.controller.ts`, multer `uploadCertificateImage` (uploads/certificates, jpg/png/webp 3MB), rutas en training.routes `/:courseId/certificate` (GET/PUT), `/certificate/image` (POST), `/certificate/preview` (GET PDF inline). Frontend: `CertificateDesignerModal` (editor de textos/orientacion/logo/firmas + preliminar en iframe via blob; guarda antes de previsualizar), boton 'Constancia' (Award) por capacitacion en RhTrainingsPage. Backend 85 tests / frontend 26, builds+lint OK. Smoke e2e: upsert con 2 firmas, preview genera PDF valido (%PDF-, 8.7KB) verificado visualmente (logo+titulo+cuerpo+firmas correctos). |
