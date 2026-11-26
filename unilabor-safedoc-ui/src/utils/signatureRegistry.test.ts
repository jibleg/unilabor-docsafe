import { describe, expect, it } from 'vitest';
import type { SignatureRegistryListing, SignatureRegistryRow, SignatureRegistryStatus } from '../types/models';
import { EMPTY_SIGNATURE_FILTERS, NO_DISCIPLINE, describeFilters, filterSignatureRegistry, hasActiveFilters } from './signatureRegistry';

const row = (employeeId: number, status: SignatureRegistryStatus, overrides: Partial<SignatureRegistryRow> = {}): SignatureRegistryRow => ({
  row_no: employeeId,
  employee_id: employeeId,
  employee_code: `C${employeeId}`,
  full_name: `Colaborador ${employeeId}`,
  branch_name: 'CIDE',
  position_id: 1,
  position_code: 'RQC',
  position_name: 'Responsable de química clínica',
  area_name: 'ANALÍTICA',
  employee_active: true,
  position_active: true,
  retired: status === 'DADA_DE_BAJA',
  discipline_id: 1,
  discipline_name: 'Química clínica',
  is_discipline_responsible: true,
  signing_scope_text: 'Validación técnica de resultados.',
  notes: null,
  letter_id: 1,
  letter_folio: 'REH-REG-008-00001',
  start_date: '2026-07-30',
  evaluation_id: 1,
  last_evaluation_date: '2026-07-15',
  valid_until: '2027-07-15',
  end_or_change_date: null,
  end_or_change_kind: null,
  signature_specimen: null,
  initials_specimen: null,
  status,
  status_label: status,
  status_tone: 'green',
  expires_on: null,
  days_remaining: null,
  missing: [],
  ...overrides,
});

const listing: SignatureRegistryListing = {
  cutoff_date: '2026-11-26',
  warning_days: 60,
  rows: [
    row(1, 'VIGENTE'),
    row(2, 'POR_VENCER', { branch_name: 'CENTRO', discipline_id: null, discipline_name: null }),
    row(3, 'INCOMPLETA', { discipline_id: 2, discipline_name: 'Uroanálisis' }),
    row(4, 'DADA_DE_BAJA'),
  ],
  summary: { rows_total: 4, people_total: 4, active_rows: 3, retired_rows: 1, by_status: { DADA_DE_BAJA: 1, INCOMPLETA: 1, SIN_EVALUACION: 0, VENCIDA: 0, POR_VENCER: 1, VIGENTE: 1 } },
  disciplines: [
    { id: 1, code: 'QUIMICA_CLINICA', name: 'Química clínica', sort_order: 1, is_active: true },
    { id: 2, code: 'UROANALISIS', name: 'Uroanálisis', sort_order: 4, is_active: true },
  ],
};

describe('filterSignatureRegistry', () => {
  it('oculta las dadas de baja salvo con el interruptor', () => {
    expect(filterSignatureRegistry(listing, EMPTY_SIGNATURE_FILTERS).map((item) => item.employee_id)).toEqual([1, 2, 3]);
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, showRetired: true })).toHaveLength(4);
  });

  it('el filtro de estado acota solo las filas vigentes; la baja sigue al interruptor', () => {
    const rows = filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, statuses: ['VIGENTE'], showRetired: true });
    expect(rows.map((item) => item.employee_id)).toEqual([1, 4]);
  });

  it('filtra por sucursal, disciplina (incluida "sin disciplina") y busqueda sin acentos', () => {
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, branch: 'CENTRO' }).map((item) => item.employee_id)).toEqual([2]);
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, discipline: NO_DISCIPLINE }).map((item) => item.employee_id)).toEqual([2]);
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, discipline: '2' }).map((item) => item.employee_id)).toEqual([3]);
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, search: 'validacion tecnica' })).toHaveLength(3);
    expect(filterSignatureRegistry(listing, { ...EMPTY_SIGNATURE_FILTERS, search: 'colaborador 3' }).map((item) => item.employee_id)).toEqual([3]);
  });
});

describe('describeFilters / hasActiveFilters', () => {
  it('describe los filtros para la leyenda de extracto del PDF', () => {
    expect(describeFilters(EMPTY_SIGNATURE_FILTERS, listing)).toBe('Sin dadas de baja');
    expect(describeFilters({ search: ' ana ', branch: 'CIDE', discipline: '2', statuses: ['VENCIDA', 'POR_VENCER'], showRetired: true }, listing)).toBe(
      'Sucursal CIDE · Disciplina Uroanálisis · Estado Vencida / Por vencer · Con dadas de baja · Búsqueda "ana"',
    );
    expect(describeFilters({ ...EMPTY_SIGNATURE_FILTERS, discipline: NO_DISCIPLINE }, listing)).toBe('Sin disciplina · Sin dadas de baja');
  });

  it('sabe cuando hay filtros aplicados', () => {
    expect(hasActiveFilters(EMPTY_SIGNATURE_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_SIGNATURE_FILTERS, showRetired: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_SIGNATURE_FILTERS, statuses: ['VIGENTE'] })).toBe(true);
  });
});
