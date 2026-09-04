import pool from '../config/db';
import { sendGenericNotification, sendWhatsAppNotification } from './notification.service';

/**
 * Aviso por WhatsApp (Whapi Cloud) al responsable de una fase de induccion
 * cuando un colaborador queda listo para presentar su evaluacion. El telefono
 * del responsable se captura por fase en `rh_induction_phases`
 * (responsible_name/responsible_phone); si no esta configurado, se omite en
 * silencio (mismo criterio que los recordatorios de mantenimiento/calibracion:
 * best-effort, nunca bloquea el flujo principal).
 */
export const notifyInductionPhaseReady = async (
  enrollmentId: number,
  phaseName: string,
  responsibleLabel: string,
): Promise<void> => {
  const result = await pool.query(
    `SELECT emp.full_name AS employee_name, p.responsible_name, p.responsible_phone
       FROM public.rh_induction_enrollments e
       INNER JOIN public.employees emp ON emp.id = e.employee_id
       INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) {
    return;
  }
  const row = result.rows[0];
  const phone = row.responsible_phone ? String(row.responsible_phone) : null;
  if (!phone) {
    return;
  }
  const greeting = row.responsible_name ? String(row.responsible_name) : responsibleLabel;
  const message =
    `Hola ${greeting}, el colaborador ${row.employee_name} ya completo la lectura de "${phaseName}" ` +
    `y esta listo para presentar la evaluacion de esa fase de induccion. Ingresa a SafeDoc para dar seguimiento.`;

  await sendWhatsAppNotification(phone, message, 'induction_phase_ready');
};

/** Hook best-effort: nunca lanza, para no interrumpir el flujo de induccion. */
export const tryNotifyInductionPhaseReady = async (
  enrollmentId: number,
  phaseName: string,
  responsibleLabel: string,
): Promise<void> => {
  try {
    await notifyInductionPhaseReady(enrollmentId, phaseName, responsibleLabel);
  } catch (error) {
    console.error(`No se pudo notificar por WhatsApp al responsable de la fase (enrollment ${enrollmentId}):`, error);
  }
};

// ---------------------------------------------------------------------------
// Aviso al colaborador: lecturas de induccion asignadas (correo + SMS)
// ---------------------------------------------------------------------------

export interface InductionReadingsAssignedContext {
  employeeName: string;
  phaseNumber: number;
  phaseName: string;
  documentsTotal: number;
  /** ISO; null = la fase no tiene limite de lectura. */
  readingDeadlineAt: string | null;
}

// Formato 24 h ("7 de septiembre de 2026, 09:24"): evita el "a.m." de Intl, que
// al final de una frase produce "a.m.." y alarga el SMS.
export const formatInductionDeadline = (iso: string): string => {
  const date = new Date(iso);
  const day = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const time = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' });
  return `${day}, ${time}`;
};

/** Textos del aviso (puro, sin BD) para poder probarlos en aislamiento. */
export const buildInductionReadingsAssignedMessages = (
  ctx: InductionReadingsAssignedContext,
): { subject: string; emailBody: string; smsBody: string } => {
  const docs = ctx.documentsTotal === 1 ? '1 documento' : `${ctx.documentsTotal} documentos`;
  const deadline = ctx.readingDeadlineAt ? formatInductionDeadline(ctx.readingDeadlineAt) : null;
  const subject = `Induccion - Fase ${ctx.phaseNumber}: tienes ${docs} por leer y firmar`;
  const emailBody =
    `Hola ${ctx.employeeName},\n` +
    `Ya estan disponibles los documentos de la fase "${ctx.phaseName}" del Programa de Induccion: ` +
    `tienes ${docs} por leer y firmar.\n` +
    (deadline
      ? `Fecha limite de lectura: ${deadline}. Al vencer (o al terminar antes la lectura) se abre el cuestionario de la fase.\n`
      : 'Al terminar la lectura se abre el cuestionario de la fase.\n') +
    'Ingresa a SafeDoc, en el menu "Mis lecturas", para leerlos y firmarlos.';
  const smsBody =
    `SafeDoc: tienes ${docs} de Induccion (Fase ${ctx.phaseNumber}) por leer y firmar. ` +
    (deadline ? `Vence el ${deadline}. ` : '') +
    'Entra a SafeDoc > Mis lecturas.';
  return { subject, emailBody, smsBody };
};

/**
 * Aviso por correo + SMS al colaborador cuando sus lecturas de una fase quedan
 * asignadas (al inscribirlo en una fase publicada o al publicar la fase).
 * Un solo mensaje por persona y fase, con el total de documentos y la fecha
 * limite vigente. Sin lecturas asignadas no se avisa.
 */
export const notifyInductionReadingsAssigned = async (enrollmentId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT emp.full_name AS employee_name, COALESCE(NULLIF(emp.email, ''), u.email) AS email, emp.phone,
            p.phase_number, p.name AS phase_name, e.reading_deadline_at,
            (SELECT count(*) FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS documents_total
       FROM public.rh_induction_enrollments e
       INNER JOIN public.employees emp ON emp.id = e.employee_id
       INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
       LEFT JOIN public.users u ON u.id = emp.user_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) {
    return;
  }
  const row = result.rows[0];
  const documentsTotal = Number(row.documents_total);
  if (documentsTotal === 0) {
    return;
  }
  const { subject, emailBody, smsBody } = buildInductionReadingsAssignedMessages({
    employeeName: String(row.employee_name),
    phaseNumber: Number(row.phase_number),
    phaseName: String(row.phase_name),
    documentsTotal,
    readingDeadlineAt: row.reading_deadline_at ? new Date(row.reading_deadline_at).toISOString() : null,
  });
  const emailHtml = emailBody
    .split('\n')
    .map((line) => `<p style="margin:0 0 8px">${line}</p>`)
    .join('');
  await sendGenericNotification(
    { email: row.email ? String(row.email) : null, phone: row.phone ? String(row.phone) : null },
    subject,
    emailHtml,
    smsBody,
    'induction_readings_assigned',
  );
};

// Cola secuencial en memoria: una inscripcion masiva o una publicacion pueden
// disparar decenas de avisos; se envian uno tras otro en segundo plano para
// no saturar a los proveedores (correo/SMS) ni bloquear la respuesta HTTP.
let notificationChain: Promise<void> = Promise.resolve();

/** Encola el aviso (best-effort, nunca lanza ni bloquea el flujo principal). */
export const queueNotifyInductionReadingsAssigned = (enrollmentId: number): void => {
  notificationChain = notificationChain.then(async () => {
    try {
      await notifyInductionReadingsAssigned(enrollmentId);
    } catch (error) {
      console.error(`No se pudo avisar al colaborador sus lecturas de induccion (enrollment ${enrollmentId}):`, error);
    }
  });
};

/** Para pruebas: espera a que la cola de avisos termine. */
export const waitForInductionNotificationQueue = (): Promise<void> => notificationChain;
