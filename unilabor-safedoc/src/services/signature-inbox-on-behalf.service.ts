import pool from '../config/db';

// -----------------------------------------------------------------------------
// Buzon de firmas - firma por imagen a nombre del firmante.
//
// Recursos Humanos resguarda la firma de todo el personal en archivos de imagen.
// Quien tiene el permiso RH.SIGNATURE_INBOX.SIGN_ON_BEHALF abre el buzon de
// cualquier firmante y coloca su firma cargando ese archivo. El buzon, las
// reglas de roles y el cierre automatico son los mismos: solo cambia de quien es
// el buzon. Cada firma asi colocada queda marcada (on_behalf) y auditada con el
// usuario que la coloco.
// -----------------------------------------------------------------------------

export const SIGN_ON_BEHALF_PERMISSION = 'RH.SIGNATURE_INBOX.SIGN_ON_BEHALF';

export interface PendingSigner {
  employee_id: number;
  full_name: string;
  employee_code: string;
  is_active: boolean;
  /** Registros que esperan su firma (uno aunque ocupe dos roles en el). */
  pending: number;
}

/** Un renglon por (registro, rol) que sigue sin firma vigente, con el colaborador que ocupa el rol. */
const PENDING_SLOTS = `
  SELECT 'SUPERVISION' AS kind, c.id, slot.employee_id
    FROM public.rh_supervision_checklists c
   CROSS JOIN LATERAL (VALUES ('SUPERVISOR', c.supervisor_employee_id),
                              ('AREA_RESPONSIBLE', c.area_responsible_employee_id),
                              ('EMPLOYEE', c.employee_id)) AS slot(role, employee_id)
   WHERE c.status = 'PENDING_SIGNATURES' AND slot.employee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rh_supervision_checklist_signatures sg
                      WHERE sg.checklist_id = c.id AND sg.invalidated_at IS NULL AND sg.signer_role = slot.role)
  UNION ALL
  SELECT 'COMPETENCY_EVALUATION', d.id, slot.employee_id
    FROM public.rh_competency_evaluations d
   CROSS JOIN LATERAL (VALUES ('EMPLOYEE', d.employee_id),
                              ('EVALUATOR', d.evaluator_employee_id),
                              ('AREA', d.area_signatory_employee_id),
                              ('RH', d.rh_signatory_employee_id),
                              ('DIRECTOR', d.director_signatory_employee_id)) AS slot(role, employee_id)
   WHERE d.status = 'DRAFT' AND d.signature_requested_at IS NOT NULL AND slot.employee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rh_document_signatures s
                      WHERE s.document_kind = 'COMPETENCY_EVALUATION' AND s.document_id = d.id
                        AND s.invalidated_at IS NULL AND s.signer_role = slot.role)
  UNION ALL
  SELECT 'ASSIGNMENT_LETTER', d.id, slot.employee_id
    FROM public.rh_assignment_letters d
   CROSS JOIN LATERAL (VALUES ('EMPLOYEE', d.employee_id),
                              ('AREA', d.area_signatory_employee_id),
                              ('DIRECTOR', d.director_signatory_employee_id)) AS slot(role, employee_id)
   WHERE d.status = 'DRAFT' AND d.signature_requested_at IS NOT NULL AND slot.employee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rh_document_signatures s
                      WHERE s.document_kind = 'ASSIGNMENT_LETTER' AND s.document_id = d.id
                        AND s.invalidated_at IS NULL AND s.signer_role = slot.role)`;

/** Firmantes con registros en espera de su firma, del que mas tiene al que menos. */
export const listPendingSigners = async (): Promise<PendingSigner[]> => {
  const result = await pool.query(
    `SELECT emp.id AS employee_id, emp.full_name, emp.employee_code, COALESCE(emp.is_active, FALSE) AS is_active,
            COUNT(DISTINCT (slots.kind, slots.id))::int AS pending
       FROM (${PENDING_SLOTS}) slots
       JOIN public.employees emp ON emp.id = slots.employee_id
      GROUP BY emp.id, emp.full_name, emp.employee_code, emp.is_active
      ORDER BY pending DESC, emp.full_name ASC;`,
  );
  return result.rows.map((row) => ({
    employee_id: Number(row.employee_id),
    full_name: String(row.full_name ?? ''),
    employee_code: String(row.employee_code ?? ''),
    is_active: Boolean(row.is_active),
    pending: Number(row.pending),
  }));
};

/** Nombre del colaborador a cuyo nombre se firma (null si no existe). */
export const findSignerName = async (employeeId: number): Promise<string | null> => {
  const result = await pool.query(`SELECT full_name FROM public.employees WHERE id = $1;`, [employeeId]);
  return result.rows.length > 0 ? String(result.rows[0].full_name ?? '') : null;
};
