import { describe, expect, it } from 'vitest';
import type { AuthorizedPersonnelListing, AuthorizedPersonnelRow, RhAuthorizationLevel } from '../types/models';
import { EMPTY_AUTHORIZED_FILTERS, describeFilters, filterAuthorizedPersonnel, filterableAuthorizationLevels, hasActiveFilters } from './authorizedPersonnel';

const level = (id: number, isActive = true): RhAuthorizationLevel => ({ id, level_no: id, name: `Nivel ${id}`, description: null, is_active: isActive });

const row = (employeeId: number, levelId: number | null): AuthorizedPersonnelRow =>
  ({
    row_no: employeeId,
    employee_id: employeeId,
    employee_code: `C${employeeId}`,
    full_name: `Colaborador ${employeeId}`,
    branch_name: 'CENTRO',
    position_id: 1,
    position_code: 'P1',
    position_name: 'Puesto 1',
    area_name: 'AREA',
    organizational_level_code: null,
    organizational_level_name: null,
    status_label: 'Activo',
    evaluation_id: employeeId,
    competent: true,
    last_evaluation_date: '2026-01-10',
    authorized_at: levelId ? '2026-01-10' : null,
    valid_until: '2027-01-10',
    days_remaining: 300,
    authorized: levelId !== null,
    authorization_level_id: levelId,
    authorization_level_no: levelId,
    authorization_level_name: levelId ? `Nivel ${levelId}` : null,
    alert: levelId ? 'OK' : 'PENDIENTE_AUTORIZACION',
    alert_text: '',
    alert_tone: 'none',
  }) as AuthorizedPersonnelRow;

const listing = {
  cutoff_date: '2026-03-01',
  warning_days: 60,
  // El nivel 4 esta inactivo pero una fila todavia lo tiene; el 5 esta inactivo y sin uso.
  authorization_levels: [level(1), level(2), level(3), level(4, false), level(5, false)],
  organizational_levels: [],
  rows: [row(1, 1), row(2, 2), row(3, 2), row(4, 4), row(5, null)],
  summary: {} as AuthorizedPersonnelListing['summary'],
} as AuthorizedPersonnelListing;

describe('filtro por nivel de autorizacion', () => {
  it('sin niveles marcados muestra todas las filas, con y sin nivel', () => {
    expect(filterAuthorizedPersonnel(listing, EMPTY_AUTHORIZED_FILTERS)).toHaveLength(5);
    expect(hasActiveFilters(EMPTY_AUTHORIZED_FILTERS)).toBe(false);
  });

  it('admite varios niveles a la vez y excluye las filas sin nivel', () => {
    const filters = { ...EMPTY_AUTHORIZED_FILTERS, levelIds: [1, 2] };
    expect(filterAuthorizedPersonnel(listing, filters).map((item) => item.employee_id)).toEqual([1, 2, 3]);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it('se combina con los demas filtros', () => {
    const filters = { ...EMPTY_AUTHORIZED_FILTERS, levelIds: [2], search: 'colaborador 3' };
    expect(filterAuthorizedPersonnel(listing, filters).map((item) => item.employee_id)).toEqual([3]);
  });

  it('ofrece los niveles activos y los inactivos aun asignados, por numero', () => {
    expect(filterableAuthorizationLevels(listing).map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('leyenda de filtros para el PDF', () => {
  it('describe sede, enfoque, niveles y busqueda en una sola linea', () => {
    const filters = { ...EMPTY_AUTHORIZED_FILTERS, branch: 'CIDE', focus: 'VALID' as const, levelIds: [1, 2], search: 'ana' };
    expect(describeFilters(filters, listing.authorization_levels)).toBe('Sede CIDE · Vigentes · Nivel 1 Nivel 1 / 2 Nivel 2 · Búsqueda "ana"');
  });

  it('sin filtros queda vacia', () => {
    expect(describeFilters(EMPTY_AUTHORIZED_FILTERS, listing.authorization_levels)).toBe('');
  });
});
