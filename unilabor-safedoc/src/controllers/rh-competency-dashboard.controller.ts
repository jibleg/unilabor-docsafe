import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../types';
import { getCompetencyDashboard, getCompetencyEmployeeDetail } from '../services/rh-competency-dashboard.service';

/** Controladores del Tablero de evaluación de competencia (REH-REG-003). */

const employeeParamsSchema = z.object({ employeeId: z.coerce.number().int().positive() });

export const getCompetencyDashboardController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await getCompetencyDashboard());
  } catch (error) {
    console.error('Error cargando el tablero de competencia:', error);
    return res.status(500).json({ message: 'No se pudo cargar el tablero de evaluación de competencia.' });
  }
};

export const getCompetencyEmployeeDetailController = async (req: AuthRequest, res: Response) => {
  const params = employeeParamsSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const detail = await getCompetencyEmployeeDetail(params.data.employeeId);
    if (!detail) {
      return res.status(404).json({ message: 'El colaborador indicado no existe.' });
    }
    return res.json(detail);
  } catch (error) {
    console.error('Error cargando el detalle de competencia del colaborador:', error);
    return res.status(500).json({ message: 'No se pudo cargar el detalle del colaborador.' });
  }
};
