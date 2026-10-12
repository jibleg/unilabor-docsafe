import { describe, expect, it } from 'vitest';
import {
  calculateDay,
  dayWindow,
  normalizePunches,
  pairPunches,
  type DayInput,
  type EnginePunch,
} from './day-calculator';
import { markLateAccumulation } from './late-accumulation';
import {
  assignmentApplies,
  hasScheduleOn,
  resolveDay,
  type EngineAssignment,
  type EngineShift,
} from './schedule';
import { DEFAULT_ATTENDANCE_SETTINGS, mergeSettings, validateSettingValue } from './settings';
import { addDays, dateToLocalMs, isoWeekday, startOfWeek } from './time';

const MIN = 60_000;
const settings = DEFAULT_ATTENDANCE_SETTINGS;

const shifts = new Map<number, EngineShift>([
  [1, { id: 1, name: 'Matutino', startTime: '08:00', endTime: '17:00', breakMinutes: 60, flexible: false, isActive: true }],
  [2, { id: 2, name: 'Manana', startTime: '09:00', endTime: '13:00', breakMinutes: 0, flexible: false, isActive: true }],
  [3, { id: 3, name: 'Tarde', startTime: '16:00', endTime: '20:00', breakMinutes: 0, flexible: false, isActive: true }],
  [4, { id: 4, name: 'Noche', startTime: '22:00', endTime: '06:00', breakMinutes: 0, flexible: false, isActive: true }],
  [5, { id: 5, name: 'Flexible', startTime: '08:00', endTime: '16:00', breakMinutes: 0, flexible: true, isActive: true }],
  [6, { id: 6, name: 'Inactivo', startTime: '08:00', endTime: '16:00', breakMinutes: 0, flexible: false, isActive: false }],
]);

const weekdayAssignment = (id: number, shiftId: number | null, extra: Partial<EngineAssignment> = {}): EngineAssignment => ({
  id,
  shiftId,
  startDate: '2026-01-05', // lunes
  endDate: null,
  repeatsWeekly: true,
  weekInterval: 1,
  weekdays: [1, 2, 3, 4, 5],
  ...extra,
});

// 2026-10-12 es lunes.
const MONDAY = '2026-10-12';

const at = (date: string, hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return dateToLocalMs(date) + (h * 60 + m) * MIN;
};

let refCounter = 0;
const punch = (date: string, hhmm: string, type: EnginePunch['type'] = null, reviewStatus: EnginePunch['reviewStatus'] = 'none'): EnginePunch => ({
  ref: ++refCounter,
  at: at(date, hhmm),
  type,
  reviewStatus,
});

const dayInput = (overrides: Partial<DayInput> & { assignments?: EngineAssignment[] }): DayInput => {
  const assignments = overrides.assignments ?? [weekdayAssignment(1, 1)];
  const date = overrides.workDate ?? MONDAY;
  return {
    workDate: date,
    plan: resolveDay(assignments, shifts, date, 'sunday'),
    hasSchedule: hasScheduleOn(assignments, date),
    isHoliday: false,
    punches: [],
    fullDayIncident: null,
    authorizedOvertimeHours: 0,
    settings,
    ...overrides,
  };
};

describe('time helpers', () => {
  it('calcula dia ISO e inicio de semana', () => {
    expect(isoWeekday(MONDAY)).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(startOfWeek('2026-10-14', 'sunday')).toBe('2026-10-11');
    expect(startOfWeek('2026-10-14', 'monday')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-11', 'sunday')).toBe('2026-10-11');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('resolucion de horario', () => {
  it('aplica solo en los dias de la semana marcados', () => {
    const a = weekdayAssignment(1, 1);
    expect(assignmentApplies(a, MONDAY, 'sunday')).toBe(true);
    expect(assignmentApplies(a, '2026-10-17', 'sunday')).toBe(false); // sabado
  });

  it('respeta el intervalo de semanas', () => {
    const a = weekdayAssignment(1, 1, { startDate: '2026-10-05', weekInterval: 2 });
    expect(assignmentApplies(a, '2026-10-05', 'monday')).toBe(true);
    expect(assignmentApplies(a, MONDAY, 'monday')).toBe(false); // semana siguiente
    expect(assignmentApplies(a, '2026-10-19', 'monday')).toBe(true);
  });

  it('un dia suelto reemplaza las recurrentes', () => {
    const recurring = weekdayAssignment(1, 1);
    const single = weekdayAssignment(2, 5, { repeatsWeekly: false, startDate: MONDAY, endDate: MONDAY });
    const plan = resolveDay([recurring, single], shifts, MONDAY, 'sunday');
    expect(plan.segments.map((s) => s.shiftId)).toEqual([5]);
  });

  it('descanso anula los turnos', () => {
    const plan = resolveDay([weekdayAssignment(1, 1), weekdayAssignment(2, null)], shifts, MONDAY, 'sunday');
    expect(plan.isRestDay).toBe(true);
    expect(plan.segments).toHaveLength(0);
  });

  it('jornada partida: tramos ordenados, sin duplicar el mismo turno', () => {
    const plan = resolveDay(
      [weekdayAssignment(1, 3), weekdayAssignment(2, 2), weekdayAssignment(3, 2)],
      shifts,
      MONDAY,
      'sunday',
    );
    expect(plan.segments.map((s) => s.shiftId)).toEqual([2, 3]);
  });

  it('turno nocturno cruza medianoche', () => {
    const plan = resolveDay([weekdayAssignment(1, 4)], shifts, MONDAY, 'sunday');
    expect(plan.segments[0]?.crossesMidnight).toBe(true);
    expect(plan.segments[0]?.endMinute).toBe(6 * 60 + 1440);
  });

  it('ignora turnos inactivos', () => {
    const plan = resolveDay([weekdayAssignment(1, 6)], shifts, MONDAY, 'sunday');
    expect(plan.segments).toHaveLength(0);
  });

  it('hasScheduleOn exige un turno vigente en los ultimos 60 dias', () => {
    expect(hasScheduleOn([], MONDAY)).toBe(false);
    expect(hasScheduleOn([weekdayAssignment(1, null)], MONDAY)).toBe(false);
    expect(hasScheduleOn([weekdayAssignment(1, 1, { endDate: '2026-06-01' })], MONDAY)).toBe(false);
    expect(hasScheduleOn([weekdayAssignment(1, 1)], MONDAY)).toBe(true);
  });
});

describe('checadas', () => {
  it('descarta rechazadas y colapsa rebotes', () => {
    const punches = [
      punch(MONDAY, '08:00', null),
      { ...punch(MONDAY, '08:00', null), at: at(MONDAY, '08:00') + 30_000 }, // rebote 30 s
      punch(MONDAY, '08:05', null, 'rejected'),
      punch(MONDAY, '17:00', null),
    ];
    expect(normalizePunches(punches, 60)).toHaveLength(2);
  });

  it('empareja primera entrada y ultima salida', () => {
    const pair = pairPunches([punch(MONDAY, '08:00', 'in'), punch(MONDAY, '12:00', 'break_start'), punch(MONDAY, '17:05', 'out')]);
    expect(pair.entry?.at).toBe(at(MONDAY, '08:00'));
    expect(pair.exit?.at).toBe(at(MONDAY, '17:05'));
  });

  it('una sola checada es entrada sin salida', () => {
    const pair = pairPunches([punch(MONDAY, '08:00')]);
    expect(pair.entry).not.toBeNull();
    expect(pair.exit).toBeNull();
  });

  it('ventana del dia usa el corte; nocturno usa mediodia', () => {
    expect(dayWindow(MONDAY, '04:00', false).from).toBe(at(MONDAY, '04:00'));
    expect(dayWindow(MONDAY, '04:00', true).from).toBe(at(MONDAY, '12:00'));
  });
});

describe('calculo del dia', () => {
  it('asistencia puntual', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '07:58'), punch(MONDAY, '17:02')] }));
    expect(r.dayResult).toBe('present');
    expect(r.workedHours).toBeCloseTo(8.07, 2); // 07:58-17:02 = 9.07 h menos 1 h de descanso
  });

  it('retardo dentro de la tolerancia no cuenta', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:10'), punch(MONDAY, '17:00')] }));
    expect(r.dayResult).toBe('present');
    expect(r.lateMinutes).toBe(0);
  });

  it('retardo registra los minutos completos', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:20'), punch(MONDAY, '17:00')] }));
    expect(r.dayResult).toBe('late');
    expect(r.lateMinutes).toBe(20);
  });

  it('entrada mas tarde que el maximo es falta', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:45'), punch(MONDAY, '17:00')] }));
    expect(r.dayResult).toBe('absent');
    expect(r.reason).toBe('excessive_late');
  });

  it('salida anticipada', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:00'), punch(MONDAY, '16:30')] }));
    expect(r.dayResult).toBe('early_departure');
    expect(r.earlyDepartureMinutes).toBe(30);
  });

  it('retardo + salida anticipada: gana retardo y se guardan ambos', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:20'), punch(MONDAY, '16:30')] }));
    expect(r.dayResult).toBe('late');
    expect(r.lateMinutes).toBe(20);
    expect(r.earlyDepartureMinutes).toBe(30);
  });

  it('sin checadas es falta', () => {
    expect(calculateDay(dayInput({})).dayResult).toBe('absent');
  });

  it('entrada sin salida es falta por defecto y asistencia con revision si se configura', () => {
    const only = [punch(MONDAY, '08:00')];
    expect(calculateDay(dayInput({ punches: only })).reason).toBe('missing_exit');
    const tolerant = calculateDay(dayInput({ punches: only, settings: { ...settings, missing_exit_result: 'present' } }));
    expect(tolerant.dayResult).toBe('present');
    expect(tolerant.hasPendingReview).toBe(true);
  });

  it('jornada menor a la minima es falta', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:00'), punch(MONDAY, '11:00')] }));
    expect(r.dayResult).toBe('absent');
  });

  it('turno flexible solo cuenta horas', () => {
    const assignments = [weekdayAssignment(1, 5)];
    const r = calculateDay(dayInput({ assignments, punches: [punch(MONDAY, '10:30'), punch(MONDAY, '16:00')] }));
    expect(r.dayResult).toBe('present');
    expect(r.lateMinutes).toBe(0);
    expect(r.workedHours).toBe(5.5);
  });

  it('incidencia de dia completo gana sobre todo', () => {
    const r = calculateDay(dayInput({ fullDayIncident: { id: 9, code: 'vacation', countsAsAttendance: true } }));
    expect(r.dayResult).toBe('incident');
    expect(r.incidentId).toBe(9);
  });

  it('festivo, descanso y sin horario', () => {
    expect(calculateDay(dayInput({ isHoliday: true })).dayResult).toBe('holiday');
    const rest = calculateDay(dayInput({ assignments: [weekdayAssignment(1, 1), weekdayAssignment(2, null)] }));
    expect(rest.dayResult).toBe('rest_day');
    expect(calculateDay(dayInput({ assignments: [] })).dayResult).toBe('no_schedule');
  });

  it('sabado sin turno programado no es falta', () => {
    const saturday = '2026-10-17';
    const r = calculateDay(dayInput({ workDate: saturday }));
    expect(r.dayResult).not.toBe('absent');
  });

  it('jornada partida: falta parcial cuando falta un tramo', () => {
    const assignments = [weekdayAssignment(1, 2), weekdayAssignment(2, 3)];
    const r = calculateDay(dayInput({ assignments, punches: [punch(MONDAY, '09:00'), punch(MONDAY, '13:00')] }));
    expect(r.dayResult).toBe('partial_absence');
    expect(r.segments).toHaveLength(2);
    const strict = calculateDay(dayInput({ assignments, punches: [punch(MONDAY, '09:00'), punch(MONDAY, '13:00')], settings: { ...settings, missing_segment_result: 'absent' } }));
    expect(strict.dayResult).toBe('absent');
  });

  it('jornada partida completa: asistencia y horas sumadas', () => {
    const assignments = [weekdayAssignment(1, 2), weekdayAssignment(2, 3)];
    const r = calculateDay(
      dayInput({ assignments, punches: [punch(MONDAY, '09:00'), punch(MONDAY, '13:00'), punch(MONDAY, '16:00'), punch(MONDAY, '20:00')] }),
    );
    expect(r.dayResult).toBe('present');
    expect(r.workedHours).toBe(8);
  });

  it('turno nocturno: entrada 22:00 y salida 06:00 del dia siguiente', () => {
    const assignments = [weekdayAssignment(1, 4)];
    const next = addDays(MONDAY, 1);
    const r = calculateDay(dayInput({ assignments, punches: [punch(MONDAY, '21:55'), punch(next, '06:03')] }));
    expect(r.dayResult).toBe('present');
    expect(r.workedHours).toBeCloseTo(8.13, 1);
  });

  it('horas extra solo con autorizacion y topadas por lo trabajado', () => {
    const punches = [punch(MONDAY, '08:00'), punch(MONDAY, '19:00')]; // 11 h - 1 h = 10 h, esperadas 8 h
    expect(calculateDay(dayInput({ punches })).overtimeHours).toBe(0);
    expect(calculateDay(dayInput({ punches, authorizedOvertimeHours: 1 })).overtimeHours).toBe(1);
    expect(calculateDay(dayInput({ punches, authorizedOvertimeHours: 5 })).overtimeHours).toBe(2);
  });

  it('checada pendiente de revision marca el dia pero cuenta', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:00', null, 'pending'), punch(MONDAY, '17:00')] }));
    expect(r.hasPendingReview).toBe(true);
    expect(r.dayResult).toBe('present');
  });

  it('checada rechazada no cuenta', () => {
    const r = calculateDay(dayInput({ punches: [punch(MONDAY, '08:00', null, 'rejected'), punch(MONDAY, '17:00', null, 'rejected')] }));
    expect(r.dayResult).toBe('absent');
  });

  it('es idempotente', () => {
    const input = dayInput({ punches: [punch(MONDAY, '08:20'), punch(MONDAY, '16:30')] });
    expect(calculateDay(input)).toEqual(calculateDay(input));
  });
});

describe('falta por retardos acumulados', () => {
  const lates = (dates: string[]) => dates.map((date) => ({ date, dayResult: 'late' as const }));
  const base = { late_per_absence: 3, late_period: 'month' as const, week_start: 'sunday' as const };

  it('marca el tercer retardo del mes', () => {
    const marked = markLateAccumulation(lates(['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-20']), base);
    expect([...marked]).toEqual(['2026-10-09']);
  });

  it('marca el sexto tambien y reinicia por mes', () => {
    const marked = markLateAccumulation(
      lates(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-11-01', '2026-11-02']),
      base,
    );
    expect([...marked].sort()).toEqual(['2026-10-03', '2026-10-06']);
  });

  it('por quincena', () => {
    const marked = markLateAccumulation(lates(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']), { ...base, late_period: 'fortnight' });
    expect([...marked]).toEqual(['2026-10-18']);
  });

  it('desactivado con 0', () => {
    expect(markLateAccumulation(lates(['2026-10-01', '2026-10-02', '2026-10-03']), { ...base, late_per_absence: 0 }).size).toBe(0);
  });

  it('solo cuentan los retardos', () => {
    const outcomes = [
      { date: '2026-10-01', dayResult: 'late' as const },
      { date: '2026-10-02', dayResult: 'absent' as const },
      { date: '2026-10-03', dayResult: 'late' as const },
      { date: '2026-10-04', dayResult: 'present' as const },
      { date: '2026-10-05', dayResult: 'late' as const },
    ];
    expect([...markLateAccumulation(outcomes, base)]).toEqual(['2026-10-05']);
  });
});

describe('parametros', () => {
  it('valida rangos, enums y hora', () => {
    expect(validateSettingValue('tolerance_min', 15)).toBe(15);
    expect(() => validateSettingValue('tolerance_min', 500)).toThrow();
    expect(() => validateSettingValue('tolerance_min', 1.5)).toThrow();
    expect(() => validateSettingValue('late_period', 'year')).toThrow();
    expect(() => validateSettingValue('cutoff_time', '25:00')).toThrow();
    expect(() => validateSettingValue('timezone', 'No/Existe')).toThrow();
    expect(() => validateSettingValue('desconocido', 1)).toThrow();
  });

  it('mergeSettings usa defaults y descarta valores invalidos', () => {
    const merged = mergeSettings({ tolerance_min: 5, late_period: 'bad', otra: 1 });
    expect(merged.tolerance_min).toBe(5);
    expect(merged.late_period).toBe('month');
  });
});
