# Manual de Operacion - Evaluaciones de Capacitacion y Constancias (ISO 15189:2022)

Modulo dentro de RH para evaluar la competencia del personal tras una capacitacion,
generar la constancia de forma automatica y dejar trazabilidad para auditoria.

## Roles

- **RH ADMIN / EDITOR**: disena capacitaciones, evaluaciones y constancias; asigna;
  califica preguntas abiertas; autoriza extemporaneos; consulta panel y bitacora.
- **Colaborador (VIEWER)**: responde sus evaluaciones y consulta sus constancias.

## 1. Crear una capacitacion y su evaluacion

1. RH > **Capacitaciones** > "Nueva capacitacion" (titulo, descripcion, vigencia de
   la constancia en meses; 12 = anual recomendado por ISO).
2. Expandir la capacitacion > "Nueva evaluacion". En el editor:
   - Calificacion minima (default **80%**), ventana para responder (default **72h**).
   - Entrega de preguntas: **todo el banco** o un **subconjunto aleatorio** (N de M).
   - Banco de preguntas: opcion unica / multiple / verdadero-falso (se auto-califican)
     y **abiertas** (las califica RH).
   - Cambiar estado a **Publicada** para poder asignarla.

## 2. Disenar la constancia (con preliminar)

1. En la fila de la capacitacion, boton **Constancia** (icono diploma).
2. Editar titulo, cuerpo (placeholders `{{nombre}}`, `{{capacitacion}}`, `{{fecha}}`,
   `{{calificacion}}`, `{{vigencia}}`), orientacion, logo y 1..4 firmas (nombre,
   cargo, imagen opcional).
3. "Generar preliminar" muestra el PDF con datos de muestra para ajustar antes de usar.
   Si no se disena, se usa una plantilla por defecto con el logo Unilabor.

## 3. Asignar a colaboradores

1. En la fila de la evaluacion, boton **Asignar** > seleccionar colaboradores > "Asignar".
2. Cada colaborador recibe correo + SMS (si tiene telefono y LabsMobile esta
   configurado) avisando que tiene **72 horas**. La asignacion es **idempotente**:
   no se duplica si ya tiene una vigente.

## 4. El colaborador responde

1. Al ingresar ve un **aviso** y un **badge** en "Mis evaluaciones".
2. Responde (una pregunta a la vez, desde cualquier dispositivo) y envia. **Intento unico.**
3. Resultado:
   - Solo objetivas: se califica al instante (>= minimo = **acreditado**).
   - Con abiertas: queda **en revision** por RH.
   - < minimo = **no acreditado**; RH recibe aviso para recapacitacion.

## 5. Calificacion manual (preguntas abiertas)

RH > **Calificacion** > abrir la evaluacion > asignar puntos a cada respuesta abierta >
"Calificar y cerrar". El sistema recalcula y resuelve acreditado / no acreditado.

## 6. Constancia automatica

Al **acreditar** (>= minimo) se genera la constancia con datos reales y vigencia, se
**archiva sola** en la seccion Constancias del expediente del colaborador, y queda
visible al instante ("Ver constancia" en resultados y en Mis evaluaciones).

## 7. Vencimiento y extemporaneo (72h)

- Un proceso automatico envia **recordatorio** cuando faltan <= 24h y marca **vencidas**
  las no realizadas (avisando a RH).
- El colaborador puede **Solicitar autorizacion** sobre una vencida.
- RH > **Extemporaneos** > "Autorizar" reabre la ventana (mismo intento).

## 8. Seguimiento y auditoria (ISO)

- RH > **Panel capacitacion**: cumplimiento por capacitacion y **trazabilidad**
  (colaborador, estado, calificacion, constancia y vigencia), exportable a **CSV**.
- RH > **Notificaciones**: bitacora de correos/SMS (enviado / fallido / omitido).
- Los eventos clave (asignacion, envio, calificacion, autorizacion extemporanea,
  generacion de constancia) quedan en la auditoria (`access_logs`).

## Configuracion (operaciones)

- **Correo (SparkPost)**: SMTP relay. `SMTP_HOST=smtp.sparkpostmail.com`
  (EU: `smtp.eu.sparkpostmail.com`), `SMTP_PORT=587`, `SMTP_SECURE=false`,
  `SMTP_USER=SMTP_Injection`, `SMTP_PASS=<API key de SparkPost>`. El remitente
  `EMAIL_FROM` debe usar un **dominio verificado en SparkPost** (SPF/DKIM).
- **SMS (LabsMobile)**: `LABSMOBILE_USER`, `LABSMOBILE_TOKEN`, `LABSMOBILE_SENDER`
  (opcional). Sin estas variables el SMS se registra como "omitido" y el resto del
  flujo sigue funcionando (el correo usa el SMTP ya configurado).
- **Aviso a RH**: `NOTIFY_RH_EMAIL` (opcional; por defecto el correo de quien asigno
  o un administrador activo).
- **Scheduler**: activo por defecto cada 15 min; `SCHEDULER_ENABLED=false` lo apaga
  (util en despliegues multi-instancia para no duplicar), `SCHEDULER_CRON` ajusta la
  frecuencia.
- **Migraciones**: aplicar con `npm run migrate` en el backend antes de operar.
