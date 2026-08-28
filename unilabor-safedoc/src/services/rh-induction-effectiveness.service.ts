import pool from '../config/db';

/**
 * Eficacia del programa de induccion (REH-REG-005, hoja INDUCCION filas
 * 101-110). La ema la exige expresamente ("no basta con demostrar que la
 * induccion se impartio: hay que demostrar que sirvio") y el manual
 * REH-MAN-002 no la contempla. RH la captura cuando corresponde; no hay gate
 * automatico todavia porque la Fase 7 (que dispararia el seguimiento formal)
 * no esta construida.
 */

export interface RhInductionEffectivenessReview {
  id: number;
  employee_id: number;
  review_date: string;
  method: string;
  result_percentage: number | null;
  performs_as_expected: boolean | null;
  evidence_notes: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
}

const mapRow = (row: any): RhInductionEffectivenessReview => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  review_date: String(row.review_date),
  method: String(row.method),
  result_percentage:
    row.result_percentage !== null && row.result_percentage !== undefined ? Number(row.result_percentage) : null,
  performs_as_expected: row.performs_as_expected === null || row.performs_as_expected === undefined
    ? null
    : Boolean(row.performs_as_expected),
  evidence_notes: row.evidence_notes ? String(row.evidence_notes) : null,
  reviewed_by_user_id: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
  created_at: String(row.created_at),
});

export const listEffectivenessReviews = async (employeeId: number): Promise<RhInductionEffectivenessReview[]> => {
  const result = await pool.query(
    `SELECT id, employee_id, review_date, method, result_percentage, performs_as_expected,
            evidence_notes, reviewed_by_user_id, created_at
       FROM public.rh_induction_effectiveness_reviews
      WHERE employee_id = $1
      ORDER BY review_date DESC, id DESC;`,
    [employeeId],
  );
  return result.rows.map(mapRow);
};

export interface CreateEffectivenessReviewInput {
  employeeId: number;
  reviewDate: string;
  method: string;
  resultPercentage: number | null;
  performsAsExpected: boolean | null;
  evidenceNotes: string | null;
  reviewedByUserId: string;
}

export const createEffectivenessReview = async (
  input: CreateEffectivenessReviewInput,
): Promise<RhInductionEffectivenessReview> => {
  const result = await pool.query(
    `INSERT INTO public.rh_induction_effectiveness_reviews
       (employee_id, review_date, method, result_percentage, performs_as_expected, evidence_notes, reviewed_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, employee_id, review_date, method, result_percentage, performs_as_expected,
               evidence_notes, reviewed_by_user_id, created_at;`,
    [
      input.employeeId,
      input.reviewDate,
      input.method,
      input.resultPercentage,
      input.performsAsExpected,
      input.evidenceNotes,
      input.reviewedByUserId,
    ],
  );
  return mapRow(result.rows[0]);
};
