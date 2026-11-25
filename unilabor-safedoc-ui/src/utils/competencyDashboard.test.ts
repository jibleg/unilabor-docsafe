import { describe, expect, it } from 'vitest';
import type { CompetencyDashboardEmployee, CompetencyStanding } from '../types/competencyDashboard';
import { coverageByPosition, positionBreakdown, standingInPosition } from './competencyDashboard';

const employee = (id: number, standing: CompetencyStanding, positions: Array<[number, CompetencyStanding]>): CompetencyDashboardEmployee =>
  ({
    employee_id: id,
    full_name: `Colaborador ${id}`,
    employee_code: `C${id}`,
    area: null,
    branch_name: null,
    positions: positions.map(([positionId]) => ({ id: positionId, name: `Puesto ${positionId}` })),
    standing,
    has_draft: false,
    evaluations_count: 0,
    current_evaluation_id: null,
    valid_until: null,
    days_to_expiry: null,
    position_standings: positions.map(([positionId, positionStanding]) => ({
      position_id: positionId,
      position_name: `Puesto ${positionId}`,
      standing: positionStanding,
      current_evaluation_id: null,
      valid_until: null,
      days_to_expiry: null,
    })),
  }) as CompetencyDashboardEmployee;

const employees = [
  // Competente en uno de dos puestos: su estado general es el peor.
  employee(1, 'SIN_EVALUACION', [[10, 'VIGENTE'], [20, 'SIN_EVALUACION']]),
  employee(2, 'VIGENTE', [[10, 'VIGENTE']]),
  employee(3, 'EN_CAPTURA', [[20, 'EN_CAPTURA'], [30, 'POR_VENCER']]),
];

describe('desglose de competencia por puesto', () => {
  it('cuenta cada puesto asignado por separado', () => {
    const breakdown = positionBreakdown(employees);
    expect(breakdown.total).toBe(5);
    expect(breakdown.competent).toBe(3);
    expect(breakdown.counts.VIGENTE).toBe(2);
    expect(breakdown.counts.POR_VENCER).toBe(1);
    expect(breakdown.counts.SIN_EVALUACION).toBe(1);
    expect(breakdown.counts.EN_CAPTURA).toBe(1);
  });

  it('señala a quien es competente en algún puesto pero no en todos', () => {
    expect(positionBreakdown(employees).partial_employees).toBe(2);
  });

  it('con un puesto elegido solo cuenta ese puesto', () => {
    const breakdown = positionBreakdown(employees, '20');
    expect(breakdown.total).toBe(2);
    expect(breakdown.competent).toBe(0);
  });

  it('la cobertura usa el estado del colaborador en ese puesto, no el general', () => {
    const row = coverageByPosition(employees).find((item) => item.position_id === 10)!;
    expect(row.total).toBe(2);
    expect(row.counts.VIGENTE).toBe(2);
    expect(row.counts.SIN_EVALUACION).toBe(0);
  });

  it('sin estado por puesto usa el general', () => {
    const legacy = { ...employees[1], position_standings: undefined } as CompetencyDashboardEmployee;
    expect(standingInPosition(legacy, 10)).toBe('VIGENTE');
  });
});
