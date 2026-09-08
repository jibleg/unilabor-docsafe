/**
 * Emite (o reemite) la constancia de una evaluacion ACREDITADA que no la tiene
 * y la archiva en el expediente del colaborador, con el mismo motor que usa el
 * sistema al calificar (issueCertificateForAssignment: constancia oficial de
 * Induccion o de capacitacion segun el curso). Idempotente: si ya existe, la
 * devuelve sin duplicarla.
 *
 * Util cuando una evaluacion se cerro por script (sin pasar por el backend) o
 * cuando la emision automatica fallo al calificar.
 *
 * Uso (local, ts-node):
 *   npm run issue:certificate -- --assignment 123 [--dry-run]
 *   npm run issue:certificate -- --email b_alguien@unilabor.mx --phase 1 [--dry-run]
 * Uso (prod, dist, en el servidor de la app: el PDF se escribe en uploads/):
 *   node dist/scripts/issue-certificate.js --email b_alguien@unilabor.mx --phase 1
 */
import pool from '../config/db';
import { issueCertificateForAssignment } from '../services/certificate-issuance.service';

interface Args {
  assignmentId: number | null;
  email: string | null;
  phaseNumber: number | null;
  dryRun: boolean;
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const value = (flag: string): string | null => {
    const index = args.indexOf(flag);
    return index >= 0 ? (args[index + 1] ?? null) : null;
  };
  const assignmentRaw = value('--assignment');
  const phaseRaw = value('--phase');
  const parsed: Args = {
    assignmentId: assignmentRaw ? Number.parseInt(assignmentRaw, 10) : null,
    email: value('--email')?.trim().toLowerCase() ?? null,
    phaseNumber: phaseRaw ? Number.parseInt(phaseRaw, 10) : null,
    dryRun: args.includes('--dry-run'),
  };
  const byAssignment = parsed.assignmentId !== null && Number.isInteger(parsed.assignmentId) && parsed.assignmentId > 0;
  const byEmail = parsed.email !== null && parsed.phaseNumber !== null && Number.isInteger(parsed.phaseNumber);
  if (!byAssignment && !byEmail) {
    console.error('Uso: --assignment <id> | --email <correo> --phase <1-7>   [--dry-run]');
    process.exit(1);
  }
  return parsed;
};

const resolveAssignmentId = async (args: Args): Promise<number> => {
  if (args.assignmentId) {
    return args.assignmentId;
  }
  const result = await pool.query(
    `SELECT en.evaluation_assignment_id AS id, emp.full_name
       FROM public.users u
       JOIN public.employees emp ON emp.user_id = u.id
       JOIN public.rh_induction_enrollments en ON en.employee_id = emp.id
       JOIN public.rh_induction_phases ph ON ph.id = en.phase_id AND ph.phase_number = $2
      WHERE LOWER(u.email) = $1
      LIMIT 1;`,
    [args.email, args.phaseNumber],
  );
  const row = result.rows[0];
  if (!row?.id) {
    throw new Error(`No se encontro evaluacion ligada a la inscripcion de ${args.email} en la fase ${args.phaseNumber}.`);
  }
  console.log(`Colaborador: ${row.full_name} -> evaluacion ${row.id}`);
  return Number(row.id);
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const assignmentId = await resolveAssignmentId(args);

  const before = await pool.query(
    `SELECT a.status, a.percentage, a.certificate_document_id, e.full_name, t.title
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.employees e ON e.id = a.employee_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  const row = before.rows[0];
  if (!row) {
    throw new Error(`La evaluacion ${assignmentId} no existe.`);
  }
  console.log(`Evaluacion ${assignmentId}: ${row.full_name} · ${row.title} · estado ${row.status} · ${row.percentage ?? '-'}%`);
  if (String(row.status) !== 'passed') {
    throw new Error('Solo se emite constancia de evaluaciones acreditadas (passed).');
  }
  if (row.certificate_document_id) {
    console.log(`Ya tiene constancia: documento ${row.certificate_document_id}. Nada que hacer.`);
    return;
  }
  if (args.dryRun) {
    console.log('[dry-run] Se emitiria la constancia y se archivaria en el expediente. Sin cambios.');
    return;
  }

  const documentId = await issueCertificateForAssignment(assignmentId);
  if (!documentId) {
    throw new Error('El motor no emitio la constancia (revisa tipo documental y usuario emisor).');
  }
  const doc = await pool.query(
    `SELECT id, title, file_path FROM public.employee_documents WHERE id = $1;`,
    [documentId],
  );
  console.log(`Constancia emitida: documento ${documentId} · "${doc.rows[0]?.title}" · ${doc.rows[0]?.file_path}`);
};

main()
  .catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
