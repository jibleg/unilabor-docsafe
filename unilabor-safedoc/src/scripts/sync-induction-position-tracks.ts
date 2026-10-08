/**
 * Arma (o re-sincroniza) la ruta por puesto de las Fases 5-6 de todos los
 * colaboradores que ya estan dentro de esas fases (migracion 20261007_01):
 * su inscripcion actual queda como 1.er puesto y los demas puestos activos se
 * forman en cola por antiguedad; las inscripciones no aprobadas de puestos
 * dados de baja pasan a CANCELLED (baja logica) y se activa el siguiente.
 * No borra ni modifica lecturas, evaluaciones ni constancias.
 *
 * Uso: node dist/scripts/sync-induction-position-tracks.js [--dry-run]
 */
import pool from '../config/db';
import { planTrackChanges, hasPositionInProgress, queuedInOrder } from '../services/rh-induction-position-track.rules';
import {
  loadEligiblePositions,
  loadTrackEntries,
  loadTrackPhase,
  syncEmployeePositionTrack,
  type PositionTrackPhase,
} from '../services/rh-induction-position-track.service';

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  for (const phaseNumber of [5, 6] as PositionTrackPhase[]) {
    const phase = await loadTrackPhase(phaseNumber);
    const employees = await pool.query(
      `SELECT DISTINCT e.employee_id, emp.full_name
         FROM public.rh_induction_enrollments e
         JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active = TRUE
        WHERE e.phase_id = $1 AND e.position_id IS NOT NULL
        ORDER BY emp.full_name;`,
      [phase.id],
    );
    console.log(`\n== Fase ${phaseNumber}: ${employees.rows.length} colaborador(es) dentro de la fase`);
    let queued = 0;
    let cancelled = 0;
    let activated = 0;
    const failures: string[] = [];
    for (const row of employees.rows) {
      const employeeId = Number(row.employee_id);
      const entries = await loadTrackEntries(employeeId, phase.id);
      const eligible = await loadEligiblePositions(employeeId, phaseNumber);
      const changes = planTrackChanges(entries, eligible);
      const code = (positionId: number) =>
        entries.find((entry) => entry.position_id === positionId)?.position_code ??
        eligible.find((position) => position.position_id === positionId)?.code ??
        String(positionId);
      const current = entries.filter((entry) => entry.queue_status !== 'CANCELLED').map((entry) => entry.position_code);
      if (changes.toCancel.length === 0 && changes.toQueue.length === 0 && (hasPositionInProgress(entries) || queuedInOrder(entries).length === 0)) {
        continue;
      }
      const cancelCodes = entries.filter((entry) => changes.toCancel.includes(entry.enrollment_id)).map((entry) => entry.position_code);
      console.log(
        `${row.full_name}: ruta [${current.join(' -> ')}]` +
          (changes.toQueue.length ? ` + cola [${changes.toQueue.map(code).join(' -> ')}]` : '') +
          (cancelCodes.length ? ` | baja logica [${cancelCodes.join(', ')}]` : ''),
      );
      queued += changes.toQueue.length;
      cancelled += changes.toCancel.length;
      if (!dryRun) {
        // Un fallo con un colaborador no detiene a los demas: se reporta y se sigue
        // (el script es re-ejecutable y completa lo que falte).
        try {
          const result = await syncEmployeePositionTrack(employeeId, phaseNumber, null);
          if (result.activated) activated += 1;
          if (result.waiting_reason) console.log(`   (en espera: ${result.waiting_reason})`);
        } catch (error: any) {
          failures.push(`${row.full_name}: ${error?.publicMessage ?? error?.message ?? error}`);
          console.error(`   ERROR con ${row.full_name}:`, error);
        }
      }
    }
    console.log(`Fase ${phaseNumber}: +${queued} en cola, ${cancelled} baja(s) logica(s)${dryRun ? ' [dry-run]' : `, ${activated} puesto(s) activado(s)`}`);
    if (failures.length > 0) {
      console.log(`Fase ${phaseNumber}: ${failures.length} colaborador(es) con error (vuelve a correr el script para completarlos):`);
      failures.forEach((failure) => console.log(`  - ${failure}`));
      process.exitCode = 1;
    }
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
