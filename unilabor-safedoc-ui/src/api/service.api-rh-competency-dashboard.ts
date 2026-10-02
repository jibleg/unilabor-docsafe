import api from './axios';
import { unwrapPayload } from './service.shared';
import type { CompetencyDashboard, CompetencyEmployeeDetail } from '../types/competencyDashboard';

/** API del Tablero de evaluación de competencia (REH-REG-003). */

export const getCompetencyDashboard = async (): Promise<CompetencyDashboard> => {
  const response = await api.get('/rh/competency-evaluations/dashboard');
  return unwrapPayload(response.data) as CompetencyDashboard;
};

export const getCompetencyEmployeeDetail = async (employeeId: number): Promise<CompetencyEmployeeDetail> => {
  const response = await api.get(`/rh/competency-evaluations/dashboard/employees/${employeeId}`);
  return unwrapPayload(response.data) as CompetencyEmployeeDetail;
};
