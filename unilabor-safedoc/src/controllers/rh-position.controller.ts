import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  addPositionCompetency,
  addPositionDocument,
  createPosition,
  deletePosition,
  deletePositionCompetency,
  findDocumentByCode,
  getPositionById,
  listPositions,
  removePositionDocument,
  updatePosition,
} from '../services/rh-position.service';
import {
  assignPositionToEmployee,
  endEmployeePosition,
  listEmployeePositions,
} from '../services/rh-employee-position.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_POSITION_INVALID: 400,
  RH_POSITION_CODE_TAKEN: 409,
  RH_POSITION_IN_USE: 409,
  RH_POSITION_COMPETENCY_INVALID: 400,
  RH_POSITION_DOCUMENT_DUPLICATE: 409,
  RH_POSITION_DOCUMENT_NOT_FOUND: 400,
  RH_EMPLOYEE_POSITION_ALREADY_ACTIVE: 409,
  RH_EMPLOYEE_POSITION_NOT_FOUND: 400,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({ message: error?.publicMessage || 'No se pudo completar la operacion.' });
};

export const listPositionsController = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.include_inactive ?? '') === 'true';
    return res.json({ positions: await listPositions(includeInactive) });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error listando puestos:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los puestos.' });
  }
};

export const getPositionByIdController = async (req: AuthRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'ID de puesto invalido.' });
  }
  try {
    const position = await getPositionById(id);
    if (!position) {
      return res.status(404).json({ message: 'Puesto no encontrado.' });
    }
    return res.json({ position });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error consultando puesto:', error);
    return res.status(500).json({ message: 'No se pudo consultar el puesto.' });
  }
};

export const createPositionController = async (req: AuthRequest, res: Response) => {
  try {
    const position = await createPosition(req.body ?? {});
    return res.status(201).json({ message: 'Puesto creado correctamente.', position });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error creando puesto:', error);
    return res.status(500).json({ message: 'No se pudo crear el puesto.' });
  }
};

export const updatePositionController = async (req: AuthRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'ID de puesto invalido.' });
  }
  try {
    const position = await updatePosition(id, req.body ?? {});
    if (!position) {
      return res.status(404).json({ message: 'Puesto no encontrado.' });
    }
    return res.json({ message: 'Puesto actualizado correctamente.', position });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error actualizando puesto:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el puesto.' });
  }
};

export const deletePositionController = async (req: AuthRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'ID de puesto invalido.' });
  }
  try {
    const deleted = await deletePosition(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Puesto no encontrado.' });
    }
    return res.json({ message: 'Puesto eliminado correctamente.' });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error eliminando puesto:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el puesto.' });
  }
};

export const addPositionCompetencyController = async (req: AuthRequest, res: Response) => {
  const positionId = parsePositiveInt(req.params.id);
  if (!positionId) {
    return res.status(400).json({ message: 'ID de puesto invalido.' });
  }
  try {
    const rawCriticality = String(req.body?.criticality ?? 'M').toUpperCase();
    const competency = await addPositionCompetency(
      positionId,
      String(req.body?.competency_text ?? ''),
      Number(req.body?.sort_order ?? 0),
      rawCriticality === 'A' || rawCriticality === 'B' ? rawCriticality : 'M',
    );
    return res.status(201).json({ message: 'Competencia agregada correctamente.', competency });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error agregando competencia:', error);
    return res.status(500).json({ message: 'No se pudo agregar la competencia.' });
  }
};

export const deletePositionCompetencyController = async (req: AuthRequest, res: Response) => {
  const competencyId = parsePositiveInt(req.params.competencyId);
  if (!competencyId) {
    return res.status(400).json({ message: 'ID de competencia invalido.' });
  }
  try {
    const deleted = await deletePositionCompetency(competencyId);
    if (!deleted) {
      return res.status(404).json({ message: 'Competencia no encontrada.' });
    }
    return res.json({ message: 'Competencia eliminada correctamente.' });
  } catch (error: any) {
    console.error('Error eliminando competencia:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la competencia.' });
  }
};

export const lookupDocumentByCodeController = async (req: AuthRequest, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (!code) {
    return res.status(400).json({ message: 'El codigo es obligatorio.' });
  }
  try {
    const document = await findDocumentByCode(code);
    if (!document) {
      return res.status(404).json({ message: 'No existe un documento vigente con ese codigo.' });
    }
    return res.json({ document });
  } catch (error: any) {
    console.error('Error buscando documento por codigo:', error);
    return res.status(500).json({ message: 'No se pudo buscar el documento.' });
  }
};

export const addPositionDocumentController = async (req: AuthRequest, res: Response) => {
  const positionId = parsePositiveInt(req.params.id);
  const documentId = typeof req.body?.document_id === 'string' ? req.body.document_id.trim() : '';
  if (!positionId || !documentId) {
    return res.status(400).json({ message: 'ID de puesto y de documento son obligatorios.' });
  }
  try {
    const document = await addPositionDocument(positionId, documentId, Number(req.body?.sort_order ?? 0));
    return res.status(201).json({ message: 'Documento agregado al puesto correctamente.', document });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error agregando documento al puesto:', error);
    return res.status(500).json({ message: 'No se pudo agregar el documento.' });
  }
};

export const removePositionDocumentController = async (req: AuthRequest, res: Response) => {
  const positionDocumentId = parsePositiveInt(req.params.positionDocumentId);
  if (!positionDocumentId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }
  try {
    const removed = await removePositionDocument(positionDocumentId);
    if (!removed) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }
    return res.json({ message: 'Documento quitado del puesto correctamente.' });
  } catch (error: any) {
    console.error('Error quitando documento del puesto:', error);
    return res.status(500).json({ message: 'No se pudo quitar el documento.' });
  }
};

export const listEmployeePositionsController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const includeInactive = String(req.query.include_inactive ?? '') === 'true';
    return res.json({ positions: await listEmployeePositions(employeeId, includeInactive) });
  } catch (error: any) {
    console.error('Error listando puestos del colaborador:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los puestos del colaborador.' });
  }
};

export const assignEmployeePositionController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  const positionId = parsePositiveInt(req.body?.position_id);
  if (!employeeId || !positionId) {
    return res.status(400).json({ message: 'Colaborador y puesto son obligatorios.' });
  }
  try {
    const assignment = await assignPositionToEmployee(employeeId, positionId, req.user?.id ?? null);
    return res.status(201).json({ message: 'Puesto asignado correctamente.', assignment });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error asignando puesto:', error);
    return res.status(500).json({ message: 'No se pudo asignar el puesto.' });
  }
};

export const endEmployeePositionController = async (req: AuthRequest, res: Response) => {
  const employeePositionId = parsePositiveInt(req.params.employeePositionId);
  if (!employeePositionId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }
  try {
    const ended = await endEmployeePosition(employeePositionId);
    if (!ended) {
      return res.status(404).json({ message: 'Asignacion no encontrada o ya finalizada.' });
    }
    return res.json({ message: 'Puesto finalizado correctamente.' });
  } catch (error: any) {
    console.error('Error finalizando puesto:', error);
    return res.status(500).json({ message: 'No se pudo finalizar el puesto.' });
  }
};
