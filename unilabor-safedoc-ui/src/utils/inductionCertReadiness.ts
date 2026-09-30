import type { RhInductionCertificateReadiness } from '../api/service.api-rh-induction';

const nameList = (people: Array<{ full_name: string }>): string => {
  const names = people.slice(0, 6).map((person) => person.full_name).join(', ');
  return people.length > 6 ? `${names} y ${people.length - 6} más` : names;
};

/** Faltantes que dejarían incompletas las constancias de la fase (vacío = lista para emitir). */
export const certReadinessIssues = (readiness: RhInductionCertificateReadiness): string[] => {
  const issues: string[] = [];
  if (!readiness.duration_ok) {
    issues.push('Falta capturar la Duración de la fase: el campo DURACIÓN saldrá vacío ("—").');
  }
  readiness.courses
    .filter((course) => course.signatures_count < 3)
    .forEach((course) => {
      issues.push(`${course.label}: solo ${course.signatures_count} de 3 firmas configuradas en la plantilla de constancia (Capacitaciones).`);
    });
  if (readiness.employees_missing_branch.length > 0) {
    issues.push(
      `${readiness.employees_missing_branch.length} inscrito(s) sin SUCURSAL capturada (RH → Empleados): ${nameList(readiness.employees_missing_branch)}.`,
    );
  }
  if (readiness.employees_missing_position.length > 0) {
    issues.push(
      `${readiness.employees_missing_position.length} inscrito(s) sin PUESTO activo asignado: ${nameList(readiness.employees_missing_position)}.`,
    );
  }
  return issues;
};
