import pool from '../config/db';
import { sendWhatsAppNotification } from './notification.service';

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
