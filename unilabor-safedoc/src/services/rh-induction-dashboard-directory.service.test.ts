import { describe, expect, it } from 'vitest';
import { filterDirectory, groupRosterByEmployee } from './rh-induction-dashboard-directory.service';
import type { InductionRosterRow } from './rh-induction-dashboard.service';
import { directoryQuerySchema } from '../schemas/rh-induction-dashboard.schema';

const row = (overrides: Partial<InductionRosterRow>): InductionRosterRow =>
  ({
    enrollment_id: 1,
    phase_number: 1,
    employee_id: 10,
    employee_name: 'Ana Pérez',
    employee_code: 'E-10',
    position_name: 'Química',
    branch_name: 'Matriz',
    area: 'Laboratorio',
    enrolled_at: '2026-09-01T10:00:00.000Z',
    reading_signed: 3,
    reading_total: 3,
    evaluation_percentage: 90,
    attempts_total: 1,
    certificate_document_id: 5,
    stage: 'APROBADA',
    alerts: [],
    ...overrides,
  }) as InductionRosterRow;

const ROWS: InductionRosterRow[] = [
  row({ enrollment_id: 2, phase_number: 2, stage: 'LECTURA_VENCIDA', alerts: ['LECTURA_VENCIDA'], certificate_document_id: null, enrolled_at: '2026-09-10T10:00:00.000Z' }),
  row({ enrollment_id: 1, phase_number: 1 }),
  ...[1, 2, 3, 4].map((n) => row({ enrollment_id: 10 + n, phase_number: n, employee_id: 20, employee_name: 'Luis Gómez', employee_code: 'E-20' })),
];

describe('groupRosterByEmployee', () => {
  it('agrupa por colaborador con fases ordenadas, fase actual y alertas de atención', () => {
    const [ana, luis] = groupRosterByEmployee(ROWS);
    expect(ana?.phases.map((p) => p.phase_number)).toEqual([1, 2]);
    expect(ana?.approved_count).toBe(1);
    expect(ana?.current_phase_number).toBe(2);
    expect(ana?.current_stage).toBe('LECTURA_VENCIDA');
    expect(ana?.attention_count).toBe(1);
    expect(ana?.last_enrolled_at).toBe('2026-09-10T10:00:00.000Z');
    expect(luis?.approved_count).toBe(4);
    expect(luis?.attention_count).toBe(0);
  });
});

describe('filterDirectory', () => {
  const competencies = new Map([
    [30, { evaluation_id: 9, status: 'CLOSED' as const, evaluation_date: '2026-10-01', evaluator_name: 'Jefa', final_pct: 95, dictamen: 'COMPETENTE_Y_AUTORIZADO', authorization_result: 'AUTORIZADO', closed_at: '2026-10-02T10:00:00.000Z' }],
  ]);
  const all = groupRosterByEmployee(
    [...ROWS, ...[1, 2, 3, 4, 5, 6].map((n) => row({ enrollment_id: 30 + n, phase_number: n, employee_id: 30, employee_name: 'Marta Ruiz', employee_code: 'E-30' }))],
    competencies,
  );
  it('cuenta por estado: en curso, esperando siguiente fase, concluyeron 1-7 y atención', () => {
    const page = filterDirectory(all, { status: 'ALL', page: 1, limit: 20 });
    expect(page.status_counts).toEqual({ ALL: 3, IN_PROGRESS: 1, STALLED: 1, COMPLETED: 1, ATTENTION: 1 });
    expect(filterDirectory(all, { status: 'STALLED', page: 1, limit: 20 }).rows.map((r) => r.employee_name)).toEqual(['Luis Gómez']);
    expect(filterDirectory(all, { status: 'COMPLETED', page: 1, limit: 20 }).rows.map((r) => r.employee_name)).toEqual(['Marta Ruiz']);
    expect(filterDirectory(all, { status: 'ATTENTION', page: 1, limit: 20 }).rows[0]?.employee_name).toBe('Ana Pérez');
  });
  it('la Fase 7 sale de la evaluación de competencia inicial', () => {
    const marta = all.find((r) => r.employee_id === 30);
    expect(marta?.phases.map((p) => p.phase_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(marta?.phases[6]).toMatchObject({ enrollment_id: null, stage: 'APROBADA', evaluation_percentage: 95 });
    expect(marta?.approved_count).toBe(7);
  });
  it('busca sin acentos por nombre o clave', () => {
    expect(filterDirectory(all, { search: 'perez', status: 'ALL', page: 1, limit: 20 }).total).toBe(1);
    expect(filterDirectory(all, { search: 'E-20', status: 'ALL', page: 1, limit: 20 }).rows[0]?.employee_id).toBe(20);
  });
  it('acota la página al total disponible', () => {
    const page = filterDirectory(all, { status: 'ALL', page: 9, limit: 5 });
    expect(page.page).toBe(1);
    expect(page.total_pages).toBe(1);
  });
});

describe('directoryQuerySchema', () => {
  it('aplica defaults y rechaza estados desconocidos', () => {
    expect(directoryQuerySchema.parse({})).toEqual({ q: undefined, status: 'ALL', page: 1, limit: 20 });
    expect(directoryQuerySchema.safeParse({ status: 'OTRO' }).success).toBe(false);
  });
});
