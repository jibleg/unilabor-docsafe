import type { Request, Response } from 'express';
import { getCommitmentBoard } from '../../services/attendance/board-commitment.service';
import { getLiveBoard } from '../../services/attendance/board-live.service';
import {
  commitmentQuerySchema, liveBoardQuerySchema, parseQuery,
} from '../../schemas/attendance/boards.schema';
import { handleAttendanceError } from './attendance-http';

export const getLive = async (req: Request, res: Response) => {
  try {
    const query = parseQuery(liveBoardQuerySchema, req.query);
    return res.json(await getLiveBoard({ date: query.date, branchId: query.branch_id }));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener el tablero en vivo');
  }
};

export const getCommitment = async (req: Request, res: Response) => {
  try {
    const query = parseQuery(commitmentQuerySchema, req.query);
    return res.json(
      await getCommitmentBoard({
        period: query.period, anchor: query.anchor, from: query.from, to: query.to,
        branchId: query.branch_id, employeeId: query.employee_id,
      }),
    );
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener el tablero de compromiso');
  }
};
