import pool from '../config/db';

/**
 * Relacion M:N colaborador<->puesto (decision confirmada: multi-puesto real,
 * un colaborador puede tener 2+ puestos activos a la vez). `employees.position`
 * (texto libre) no se toca: sigue mostrandose donde ya se muestra, solo deja
 * de ser el insumo de induccion.
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface RhEmployeePositionRecord {
  id: number;
  employee_id: number;
  position_id: number;
  position_name: string;
  position_code: string;
  assigned_at: string;
  is_active: boolean;
  ended_at: string | null;
}

const mapRow = (row: any): RhEmployeePositionRecord => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  position_id: Number(row.position_id),
  position_name: String(row.position_name),
  position_code: String(row.position_code),
  assigned_at: String(row.assigned_at),
  is_active: Boolean(row.is_active),
  ended_at: row.ended_at ? String(row.ended_at) : null,
});

const SELECT_BASE = `
  SELECT ep.id, ep.employee_id, ep.position_id, ep.assigned_at, ep.is_active, ep.ended_at,
         p.name AS position_name, p.code AS position_code
    FROM public.rh_employee_positions ep
    INNER JOIN public.rh_positions p ON p.id = ep.position_id
`;

export const listEmployeePositions = async (
  employeeId: number,
  includeInactive = false,
): Promise<RhEmployeePositionRecord[]> => {
  const whereClause = includeInactive ? 'WHERE ep.employee_id = $1' : 'WHERE ep.employee_id = $1 AND ep.is_active = TRUE';
  const result = await pool.query(`${SELECT_BASE} ${whereClause} ORDER BY ep.assigned_at DESC;`, [employeeId]);
  return result.rows.map(mapRow);
};

/** Lista, por puesto, los empleados con ese puesto activo (para provisionar induccion por puesto). */
export const listEmployeesByPosition = async (positionId: number): Promise<RhEmployeePositionRecord[]> => {
  const result = await pool.query(
    `${SELECT_BASE} WHERE ep.position_id = $1 AND ep.is_active = TRUE ORDER BY ep.assigned_at DESC;`,
    [positionId],
  );
  return result.rows.map(mapRow);
};

export const assignPositionToEmployee = async (
  employeeId: number,
  positionId: number,
  assignedByUserId?: string | null,
): Promise<RhEmployeePositionRecord> => {
  const existing = await pool.query(
    `SELECT id FROM public.rh_employee_positions
      WHERE employee_id = $1 AND position_id = $2 AND is_active = TRUE LIMIT 1;`,
    [employeeId, positionId],
  );
  if (existing.rows.length > 0) {
    throwCoded('RH_EMPLOYEE_POSITION_ALREADY_ACTIVE', 'El colaborador ya tiene este puesto activo.');
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO public.rh_employee_positions (employee_id, position_id, assigned_by_user_id)
       VALUES ($1, $2, $3) RETURNING id;`,
      [employeeId, positionId, assignedByUserId ?? null],
    );
    const result = await pool.query(`${SELECT_BASE} WHERE ep.id = $1;`, [Number(inserted.rows[0].id)]);
    return mapRow(result.rows[0]);
  } catch (error: any) {
    if (error?.code === '23503') {
      throwCoded('RH_EMPLOYEE_POSITION_NOT_FOUND', 'El colaborador o el puesto no existen.');
    }
    throw error;
  }
};

export const endEmployeePosition = async (employeePositionId: number): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE public.rh_employee_positions
        SET is_active = FALSE, ended_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE;`,
    [employeePositionId],
  );
  return (result.rowCount ?? 0) > 0;
};
