import pool from '../config/db';

// -----------------------------------------------------------------------------
// Firmas de la constancia de la Fase 6 (una por puesto acreditado):
//   1. Coordinacion de Recursos Humanos: la firma de RH de la plantilla de
//      constancia del curso del puesto (nombre, cargo e imagen configurables).
//   2. Supervisor / Auditor y 3. Responsable del Area: los mismos de la lista
//      ANA-REG-060 FINAL que acredito el puesto, con la firma que trazaron en ella.
// Si el puesto se acredito sin lista (captura manual de la practica), se
// conservan las firmas de la plantilla.
// -----------------------------------------------------------------------------

export interface CertificateSignature {
  name: string;
  role: string | null;
  imagePath: string | null;
}

/** La firma de Recursos Humanos de la plantilla (por cargo); si no hay, la primera. */
const pickHumanResourcesSignature = (signatures: CertificateSignature[]): CertificateSignature | null =>
  signatures.find((signature) => /recursos\s+humanos/i.test(`${signature.role ?? ''} ${signature.name}`)) ?? signatures[0] ?? null;

export const PHASE6_CERTIFICATE_CAPTIONS = ['Nombre y firma', 'Nombre y firma', 'Nombre y firma'];

/**
 * Firmas de la constancia de la Fase 6 para la evaluacion practica acreditada
 * (`assignmentId`), o null si no hay lista ANA-REG-060 final cerrada.
 */
export const loadPhase6CertificateSignatures = async (
  assignmentId: number,
  templateSignatures: CertificateSignature[],
): Promise<CertificateSignature[] | null> => {
  const result = await pool.query(
    `SELECT c.supervisor_name, c.supervisor_signature_path, c.area_responsible_name, c.area_responsible_signature_path,
            pa.name AS process_area_name
       FROM public.rh_induction_enrollments e
       JOIN public.rh_supervision_checklists c ON c.enrollment_id = e.id AND c.status = 'CLOSED' AND c.is_final = TRUE
       JOIN public.rh_positions rp ON rp.id = c.position_id
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
      WHERE e.evaluation_assignment_id = $1
      ORDER BY c.closed_at DESC
      LIMIT 1;`,
    [assignmentId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const humanResources = pickHumanResourcesSignature(templateSignatures);
  return [
    humanResources ?? { name: '', role: 'Coordinación de Recursos Humanos', imagePath: null },
    {
      name: String(row.supervisor_name ?? ''),
      role: 'Supervisor / Auditor',
      imagePath: row.supervisor_signature_path ? String(row.supervisor_signature_path) : null,
    },
    {
      name: String(row.area_responsible_name ?? ''),
      role: row.process_area_name ? `Responsable del Área ${String(row.process_area_name)}` : 'Responsable del Área',
      imagePath: row.area_responsible_signature_path ? String(row.area_responsible_signature_path) : null,
    },
  ];
};
