import type { Response } from 'express';
import {
  incidentTypeIdParamsSchema,
  incidentTypesQuerySchema,
  type CreateIncidentTypeInput,
  type UpdateIncidentTypeInput,
} from '../../schemas/attendance/incident-types.schema';
import {
  createIncidentType,
  listIncidentTypes,
  updateIncidentType,
} from '../../services/attendance/incident-types.service';
import type { AuthRequest } from '../../types';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './catalog-input';

export const listIncidentTypesController = async (req: AuthRequest, res: Response) => {
  try {
    const query = parseInput(incidentTypesQuerySchema, req.query);
    return res.json({ incident_types: await listIncidentTypes(query.include_inactive === 'true') });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron obtener los tipos de incidencia.');
  }
};

export const createIncidentTypeController = async (req: AuthRequest, res: Response) => {
  try {
    const incidentType = await createIncidentType(req.body as CreateIncidentTypeInput, req.user!.id);
    return res.status(201).json({ incident_type: incidentType });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo crear el tipo de incidencia.');
  }
};

export const updateIncidentTypeController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(incidentTypeIdParamsSchema, req.params);
    const incidentType = await updateIncidentType(id, req.body as UpdateIncidentTypeInput, req.user!.id);
    return res.json({ incident_type: incidentType });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar el tipo de incidencia.');
  }
};
