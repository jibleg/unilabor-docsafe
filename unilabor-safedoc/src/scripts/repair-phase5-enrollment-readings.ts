/**
 * Completa las lecturas de inscripciones de Fase 5 que quedaron a medias
 * (incidencia 2026-10-06: la asignacion se cortaba en un documento reemplazado
 * o por dos avances simultaneos). Solo AGREGA lo que falta: documentos vigentes
 * del puesto sin lectura, sincroniza el plazo, avisa por SMS y refresca el
 * estado. No borra ni modifica lecturas existentes.
 *
 * Uso (prod, en el servidor de la app):
 *   node dist/scripts/repair-phase5-enrollment-readings.js [--dry-run] [--no-notify]
 */
import pool from '../config/db';
import { assignEnrollmentReadings, refreshEnrollmentReadingStatus } from '../services/rh-induction.service';
import {
  queueNotifyInductionReadingsAssigned,
  waitForInductionNotificationQueue,
} from '../services/rh-induction-notification.service';
import { syncInductionReadingDeadlines } from '../services/rh-induction-reading-deadline.service';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notify = !args.includes('--no-notify');

const main = async () => {
  const pending = await pool.query(
    `SELECT e.id AS enrollment_id, e.enrolled_by_user_id, emp.full_name, emp.user_id, rp.id AS position_id, rp.code,
            (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS assigned
       FROM public.rh_induction_enrollments e
       INNER JOIN public.rh_induction_phases ph ON ph.id = e.phase_id AND ph.phase_number = 5
       INNER JOIN public.employees emp ON emp.id = e.employee_id
       INNER JOIN public.rh_induction_phase_positions pp ON pp.phase_id = ph.id AND pp.training_course_id = e.training_course_id
       INNER JOIN public.rh_positions rp ON rp.id = pp.position_id
      WHERE e.readings_start_at IS NULL OR e.readings_start_at <= NOW()
      ORDER BY e.id;`,
  );

  for (const row of pending.rows) {
    const docs = await pool.query(
      `SELECT pd.document_id, d.title
         FROM public.rh_position_documents pd
         INNER JOIN public.documents d ON d.id = pd.document_id
        WHERE pd.position_id = $1 AND d.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM public.rh_induction_reading_items ri
                           WHERE ri.enrollment_id = $2 AND ri.document_id = pd.document_id)
        ORDER BY pd.sort_order, pd.id;`,
      [row.position_id, row.enrollment_id],
    );
    if (docs.rows.length === 0) {
      continue;
    }
    const label = `${row.enrollment_id} ${row.code} ${row.full_name}: ${row.assigned} asignados, faltan ${docs.rows.length}`;
    if (dryRun || !row.user_id) {
      console.log(`${dryRun ? '[dry-run] ' : '[sin usuario] '}${label}`);
      continue;
    }
    const documents = docs.rows.map((doc) => ({ document_id: String(doc.document_id), title: String(doc.title) }));
    await assignEnrollmentReadings(Number(row.enrollment_id), String(row.user_id), documents, String(row.enrolled_by_user_id));
    await syncInductionReadingDeadlines({ enrollmentId: Number(row.enrollment_id) });
    if (notify) {
      queueNotifyInductionReadingsAssigned(Number(row.enrollment_id));
    }
    await refreshEnrollmentReadingStatus(Number(row.enrollment_id));
    console.log(`OK ${label}`);
  }
  await waitForInductionNotificationQueue();
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
