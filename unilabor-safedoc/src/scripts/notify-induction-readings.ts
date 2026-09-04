/**
 * Reenvia (o envia por primera vez) el aviso por correo + SMS "tienes N
 * documentos de Induccion por leer y firmar" a los inscritos de una fase que
 * aun no terminan la lectura ni tienen examen abierto. Util cuando la fase se
 * publico antes de que existiera el aviso automatico, o para un recordatorio
 * puntual decidido por RH.
 *
 * Uso (local, ts-node):  npm run notify:induction-readings -- --phase 1 [--dry-run]
 * Uso (prod, dist):      node dist/scripts/notify-induction-readings.js --phase 1 [--dry-run]
 *
 * Respeta NOTIFY_ENABLED (con false solo bitacorea como skipped) y registra
 * cada envio en la bandeja de salida (notification_log, template
 * induction_readings_assigned).
 */
import pool from '../config/db';
import {
  queueNotifyInductionReadingsAssigned,
  waitForInductionNotificationQueue,
} from '../services/rh-induction-notification.service';

const parseArgs = (): { phaseNumber: number; dryRun: boolean } => {
  const args = process.argv.slice(2);
  const phaseIndex = args.indexOf('--phase');
  const phaseNumber = phaseIndex >= 0 ? Number.parseInt(args[phaseIndex + 1] ?? '', 10) : Number.NaN;
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 7) {
    console.error('Uso: --phase <1-7> [--dry-run]');
    process.exit(1);
  }
  return { phaseNumber, dryRun: args.includes('--dry-run') };
};

const main = async (): Promise<void> => {
  const { phaseNumber, dryRun } = parseArgs();
  const pending = await pool.query(
    `SELECT e.id, emp.full_name, emp.phone, COALESCE(NULLIF(emp.email, ''), u.email) AS email,
            e.reading_deadline_at, p.published_at
       FROM public.rh_induction_enrollments e
       INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
       INNER JOIN public.employees emp ON emp.id = e.employee_id
       LEFT JOIN public.users u ON u.id = emp.user_id
      WHERE p.phase_number = $1
        AND p.published_at IS NOT NULL
        AND e.evaluation_assignment_id IS NULL
        AND e.reading_completed_at IS NULL
        AND EXISTS (SELECT 1 FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id)
      ORDER BY emp.full_name ASC;`,
    [phaseNumber],
  );
  console.log(
    `Fase ${phaseNumber}: ${pending.rows.length} inscrito(s) pendiente(s) de lectura` +
      ` (${pending.rows.filter((row) => row.phone).length} con telefono, ${pending.rows.filter((row) => row.email).length} con correo).`,
  );
  for (const row of pending.rows) {
    console.log(
      `  - ${row.full_name} | tel: ${row.phone ?? '-'} | correo: ${row.email ?? '-'} | limite: ${row.reading_deadline_at ?? 'sin limite'}`,
    );
  }
  if (dryRun) {
    console.log('Modo --dry-run: no se envio nada.');
    return;
  }
  for (const row of pending.rows) {
    queueNotifyInductionReadingsAssigned(Number(row.id));
  }
  await waitForInductionNotificationQueue();
  const outbox = await pool.query(
    `SELECT status, count(*) AS total FROM public.notification_log
      WHERE template = 'induction_readings_assigned' AND sent_at > NOW() - interval '10 minutes'
      GROUP BY status ORDER BY status;`,
  );
  console.log('Bandeja de salida (ultimos 10 min, induction_readings_assigned):');
  for (const row of outbox.rows) {
    console.log(`  ${row.status}: ${row.total}`);
  }
};

main()
  .catch((error) => {
    console.error('Error enviando avisos de lectura de induccion:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
