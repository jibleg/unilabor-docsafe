import { describe, expect, it } from 'vitest';
import { detectScheduleConflicts, formatDateShort, summarizeConflicts } from './conflicts';
import type { EngineAssignment, EngineShift } from './schedule';

const mkShift = (id: number, name: string, startTime: string, endTime: string, isActive = true): EngineShift => ({
  id, name, startTime, endTime, breakMinutes: 0, flexible: false, isActive,
});

const shifts = new Map<number, EngineShift>([
  [1, mkShift(1, 'A', '10:00', '14:00')],
  [2, mkShift(2, 'B', '08:00', '12:00')],
  [3, mkShift(3, 'C', '14:00', '18:00')],
  [4, mkShift(4, 'Noche', '22:00', '06:00')],
  [5, mkShift(5, 'Madrugada', '04:00', '08:00')],
  [6, mkShift(6, 'Tarde', '18:00', '23:00')],
  [7, mkShift(7, 'D', '19:00', '21:00')],
]);

// 2026-10-12 es lunes
const MON = '2026-10-12';
const TUE = '2026-10-13';

let seq = 100;
const rec = (shiftId: number | null, extra: Partial<EngineAssignment> = {}): EngineAssignment => ({
  id: seq++, shiftId, startDate: MON, endDate: null, repeatsWeekly: true, weekInterval: 1,
  weekdays: [1, 2, 3, 4, 5], ...extra,
});
const single = (shiftId: number | null, date = MON, extra: Partial<EngineAssignment> = {}): EngineAssignment =>
  rec(shiftId, { startDate: date, endDate: date, repeatsWeekly: false, weekdays: [], ...extra });

const check = (
  existing: EngineAssignment[],
  candidate: EngineAssignment,
  opts: { max?: number; ignore?: number; horizon?: number } = {},
) =>
  detectScheduleConflicts({
    existing, candidate, shiftsById: shifts, maxShiftsPerDay: opts.max ?? 3, weekStart: 'sunday',
    ...(opts.ignore !== undefined ? { ignoreAssignmentId: opts.ignore } : {}),
    ...(opts.horizon !== undefined ? { horizonDays: opts.horizon } : {}),
  });

describe('detectScheduleConflicts', () => {
  it('sin programacion previa no hay conflicto', () => {
    expect(check([], rec(1))).toEqual([]);
  });

  it('turnos contiguos (fin = inicio) no se traslapan', () => {
    expect(check([single(1)], single(3))).toEqual([]);
  });

  it('detecta traslape el mismo dia entre dias sueltos', () => {
    const result = check([single(2)], single(1));
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe(MON);
    expect(result[0]?.message).toContain('«A» 10:00-14:00 se encima con «B» 08:00-12:00');
  });

  it('recurrente nueva se traslapa con recurrente existente en cada dia aplicable', () => {
    const result = check([rec(2)], rec(1, { weekdays: [1, 2] }));
    expect(result.length).toBeGreaterThan(50); // 366 dias de horizonte, lun y mar
    expect(new Set(result.map((c) => c.date)).size).toBe(result.length);
  });

  it('dia suelto nuevo NO compite con recurrentes (las reemplaza)', () => {
    expect(check([rec(2)], single(1))).toEqual([]);
  });

  it('dia suelto compite solo con otros dias sueltos', () => {
    const result = check([rec(2), single(2)], single(1));
    expect(result).toHaveLength(1);
  });

  it('recurrente nueva compite con lo que el dia ya resuelve (suelto)', () => {
    const result = check([rec(7), single(2, MON)], rec(1, { weekdays: [1], endDate: MON }));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('«B»');
  });

  it('turno sobre dia de descanso es conflicto', () => {
    const result = check([rec(null)], rec(1, { weekdays: [1], endDate: MON }));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('descanso');
  });

  it('descanso sobre dia con turnos pide eliminar primero los turnos', () => {
    const result = check([single(1)], single(null));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('elimina primero los turnos');
  });

  it('descanso sobre descanso es conflicto', () => {
    expect(check([single(null)], single(null))).toHaveLength(1);
  });

  it('descanso sobre dia sin programacion es valido', () => {
    expect(check([], single(null))).toEqual([]);
  });

  it('mismo turno repetido es conflicto', () => {
    const result = check([single(1)], single(1));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('ya esta programado');
  });

  it('mas de max_turnos_dia es conflicto', () => {
    const existing = [single(2), single(3), single(6)];
    const ok = check(existing, single(4, '2026-10-12'), { max: 4 }).filter((c) => c.message.includes('maximo'));
    expect(ok).toEqual([]);
    const result = check(existing, single(7), { max: 3 }).filter((c) => c.message.includes('maximo'));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('3 turno');
  });

  it('turno nocturno se compara con el dia siguiente', () => {
    // Noche lun 22:00-06:00 vs Madrugada martes 04:00-08:00
    const result = check([single(4, MON)], single(5, TUE));
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe(TUE);
    expect(result[0]?.message).toContain('del dia anterior');
  });

  it('turno de madrugada existente choca con noche nueva del dia previo', () => {
    const result = check([single(5, TUE)], single(4, MON));
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe(MON);
    expect(result[0]?.message).toContain('del dia siguiente');
  });

  it('noche seguida de turno que empieza al terminar no choca', () => {
    // Noche termina 06:00; B inicia 08:00 => sin traslape
    expect(check([single(4, MON)], single(2, TUE))).toEqual([]);
  });

  it('noche consecutiva (mismo turno dos dias seguidos) no choca consigo misma', () => {
    expect(check([single(4, MON)], single(4, TUE))).toEqual([]);
  });

  it('ignora la propia asignacion al editar', () => {
    const own = single(1);
    expect(check([own], { ...own, shiftId: 1 }, { ignore: own.id })).toEqual([]);
    const edited = { ...own, shiftId: 2 };
    expect(check([own], edited, { ignore: own.id })).toEqual([]);
  });

  it('ignora la propia asignacion por id aunque la candidata sea otra forma', () => {
    const own = rec(1);
    const candidate = { ...own, shiftId: 3 };
    expect(check([own, rec(2)], candidate, { ignore: own.id })).toEqual([]);
  });

  it('respeta la fecha fin de la candidata', () => {
    const result = check([rec(2)], rec(1, { endDate: '2026-10-14' }));
    expect(result.map((c) => c.date)).toEqual([MON, TUE, '2026-10-14']);
  });

  it('sin fecha fin simula 366 dias (conflicto lejano visible, mas alla no)', () => {
    const existing = [rec(2, { startDate: '2027-10-11', weekdays: [1] })]; // lunes a 364 dias
    const near = check(existing, rec(1, { weekdays: [1] }));
    expect(near.some((c) => c.date === '2027-10-11')).toBe(true);
    const far = [rec(2, { startDate: '2027-12-01', weekdays: [1] })];
    expect(check(far, rec(1, { weekdays: [1] }))).toEqual([]);
  });

  it('horizonte personalizado', () => {
    const result = check([rec(2)], rec(1), { horizon: 7 });
    expect(result).toHaveLength(5);
  });

  it('week_interval: solo semanas alternas', () => {
    const result = check([rec(2, { weekInterval: 2, weekdays: [1] })], rec(1, { weekdays: [1], endDate: '2026-10-26' }));
    expect(result.map((c) => c.date)).toEqual([MON, '2026-10-26']);
  });

  it('ignora turnos inactivos del existente (no compiten)', () => {
    const inactive = new Map(shifts).set(2, mkShift(2, 'B', '08:00', '12:00', false));
    const result = detectScheduleConflicts({
      existing: [single(2)], candidate: single(1), shiftsById: inactive, maxShiftsPerDay: 3, weekStart: 'sunday',
    });
    expect(result).toEqual([]);
  });

  it('puede reportar varios mensajes en un mismo dia', () => {
    const result = check([single(2), single(3), single(6)], single(1), { max: 3 });
    const messages = result.map((c) => c.message).join('|');
    expect(messages).toContain('maximo');
    expect(messages).toContain('se encima');
  });
});

describe('summarizeConflicts', () => {
  it('vacio devuelve cadena vacia', () => {
    expect(summarizeConflicts([])).toBe('');
  });

  it('formatea fecha corta en espanol', () => {
    expect(formatDateShort(MON)).toBe('lun 12 oct');
    expect(formatDateShort('2026-10-18')).toBe('dom 18 oct');
  });

  it('resume un dia', () => {
    const conflicts = check([single(2)], single(1));
    expect(summarizeConflicts(conflicts)).toBe(
      'horario incoherente en 1 dia(s) — lun 12 oct: «A» 10:00-14:00 se encima con «B» 08:00-12:00',
    );
  });

  it('muestra hasta 3 dias y resume el resto', () => {
    const conflicts = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((date) => ({ date, message: 'x' }));
    const text = summarizeConflicts(conflicts);
    expect(text).toContain('en 5 dia(s)');
    expect(text).toContain('mie 14 oct');
    expect(text).not.toContain('jue 15 oct');
    expect(text).toContain('(y 2 dia(s) mas)');
  });

  it('agrupa varios mensajes del mismo dia', () => {
    const text = summarizeConflicts([
      { date: MON, message: 'uno' },
      { date: MON, message: 'dos' },
    ]);
    expect(text).toBe('horario incoherente en 1 dia(s) — lun 12 oct: uno; dos');
  });
});
