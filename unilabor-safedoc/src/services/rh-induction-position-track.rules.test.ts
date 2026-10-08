import { describe, expect, it } from 'vitest';
import {
  hasPositionInProgress,
  isTrackComplete,
  nextSequence,
  orderPositions,
  planTrackChanges,
  queuedInOrder,
  type TrackEntry,
  type TrackPosition,
} from './rh-induction-position-track.rules';

const position = (position_id: number, assigned_at: string, code = `P${position_id}`): TrackPosition => ({
  position_id,
  assigned_at,
  code,
});
const entry = (overrides: Partial<TrackEntry> & Pick<TrackEntry, 'position_id'>): TrackEntry => ({
  enrollment_id: overrides.position_id * 10,
  sequence: 1,
  queue_status: 'ACTIVE',
  passed: false,
  ...overrides,
});

describe('ruta por puesto (Fases 5-6)', () => {
  it('ordena el puesto mas antiguo primero y desempata por codigo', () => {
    const ordered = orderPositions([
      position(3, '2026-10-05T11:00:00Z', 'CUST'),
      position(1, '2026-09-03T10:00:00Z', 'RQC'),
      position(2, '2026-10-05T11:00:00Z', 'AN-B'),
    ]);
    expect(ordered.map((p) => p.position_id)).toEqual([1, 2, 3]);
  });

  it('conserva el puesto ya inscrito y forma detras los demas por antiguedad', () => {
    // Inscrito hoy en CUST (puesto 3, el mas reciente): CUST se respeta como 1.o.
    const entries = [entry({ position_id: 3, sequence: 1 })];
    const eligible = [position(1, '2026-09-03T10:00:00Z'), position(2, '2026-10-05T10:00:00Z'), position(3, '2026-10-05T11:00:00Z')];
    expect(planTrackChanges(entries, eligible)).toEqual({ toCancel: [], toQueue: [1, 2] });
  });

  it('da de baja (logica) la inscripcion no aprobada de un puesto que ya no esta activo', () => {
    const entries = [entry({ position_id: 7, sequence: 1 })]; // AN-B dado de baja
    const eligible = [position(8, '2026-10-07T10:00:00Z')]; // AN-A nuevo
    expect(planTrackChanges(entries, eligible)).toEqual({ toCancel: [70], toQueue: [8] });
  });

  it('nunca da de baja una inscripcion ya aprobada (su constancia sigue vigente)', () => {
    const entries = [entry({ position_id: 7, passed: true })];
    expect(planTrackChanges(entries, []).toCancel).toEqual([]);
  });

  it('un puesto vuelto a asignar tras cancelarse abre una inscripcion nueva', () => {
    const entries = [entry({ position_id: 7, queue_status: 'CANCELLED' })];
    expect(planTrackChanges(entries, [position(7, '2026-10-07T10:00:00Z')]).toQueue).toEqual([7]);
  });

  it('el siguiente puesto espera mientras haya uno en curso (incluido reprobado)', () => {
    expect(hasPositionInProgress([entry({ position_id: 1 })])).toBe(true);
    expect(hasPositionInProgress([entry({ position_id: 1, passed: true })])).toBe(false);
    expect(hasPositionInProgress([entry({ position_id: 1, queue_status: 'QUEUED' })])).toBe(false);
  });

  it('activa la cola en orden de secuencia', () => {
    const queue = queuedInOrder([
      entry({ position_id: 3, sequence: 3, queue_status: 'QUEUED' }),
      entry({ position_id: 2, sequence: 2, queue_status: 'QUEUED' }),
      entry({ position_id: 1, sequence: 1, passed: true }),
    ]);
    expect(queue.map((e) => e.position_id)).toEqual([2, 3]);
  });

  it('la fase solo esta completa con TODOS los puestos elegibles aprobados', () => {
    const eligible = [position(1, '2026-09-03T10:00:00Z'), position(2, '2026-10-05T10:00:00Z')];
    expect(isTrackComplete([entry({ position_id: 1, passed: true })], eligible)).toBe(false);
    expect(
      isTrackComplete([entry({ position_id: 1, passed: true }), entry({ position_id: 2, sequence: 2, queue_status: 'QUEUED' })], eligible),
    ).toBe(false);
    expect(
      isTrackComplete([entry({ position_id: 1, passed: true }), entry({ position_id: 2, sequence: 2, passed: true })], eligible),
    ).toBe(true);
    expect(isTrackComplete([], [])).toBe(false);
  });

  it('las canceladas no bloquean la fase', () => {
    const eligible = [position(1, '2026-09-03T10:00:00Z')];
    const entries = [entry({ position_id: 1, passed: true }), entry({ position_id: 9, queue_status: 'CANCELLED' })];
    expect(isTrackComplete(entries, eligible)).toBe(true);
  });

  it('la siguiente secuencia continua la mas alta (incluidas canceladas)', () => {
    expect(nextSequence([entry({ position_id: 1, sequence: 1 }), entry({ position_id: 2, sequence: 4, queue_status: 'CANCELLED' })])).toBe(5);
    expect(nextSequence([])).toBe(1);
  });
});
