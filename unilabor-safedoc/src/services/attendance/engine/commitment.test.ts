import { describe, expect, it } from 'vitest';
import type { DayResult } from './day-calculator';
import {
  bestPunctualStreak, commitmentIndex, compareRanking, currentPunctualStreak, levelOf, pct,
  summarizeCommitment, trendByBlock, type CommitmentRow, type CommitmentWeights,
} from './commitment';

const W: CommitmentWeights = { attendance: 40, punctuality: 40, exits: 20, exemplary: 95, attention: 70 };

let seq = 0;
const row = (workDate: string, dayResult: DayResult, extra: Partial<CommitmentRow> = {}): CommitmentRow => {
  seq += 1;
  return {
    employeeId: 1, workDate, dayResult, isLateAccumulationAbsence: false, lateMinutes: 0,
    workedHours: null, overtimeHours: 0,
    hasClockOut: ['present', 'late', 'early_departure'].includes(dayResult), ...extra,
  };
};

describe('pct / nivel / indice', () => {
  it('pct redondea y devuelve null sin denominador', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBeNull();
  });
  it('niveles segun umbrales', () => {
    expect(levelOf(null, W)).toBe('no_data');
    expect(levelOf(95, W)).toBe('exemplary');
    expect(levelOf(94, W)).toBe('committed');
    expect(levelOf(83, W)).toBe('committed'); // (95+70)/2 = 82.5
    expect(levelOf(82, W)).toBe('regular');
    expect(levelOf(70, W)).toBe('regular');
    expect(levelOf(69, W)).toBe('attention');
  });
  it('indice ponderado y fallbacks', () => {
    expect(commitmentIndex(100, 50, 100, W)).toBe(80);
    expect(commitmentIndex(80, null, null, W)).toBe(80);
    expect(commitmentIndex(null, 90, 90, W)).toBeNull();
    expect(commitmentIndex(90, 90, 90, { attendance: 0, punctuality: 0, exits: 0 })).toBeNull();
    expect(commitmentIndex(100, 0, 100, { attendance: 1, punctuality: 1, exits: 0 })).toBe(50);
  });
});

describe('summarizeCommitment', () => {
  it('sin filas: todo en cero/null', () => {
    const s = summarizeCommitment([], W);
    expect(s.expected).toBe(0);
    expect(s.index).toBeNull();
    expect(s.level).toBe('no_data');
  });

  it('ignora descanso/festivo/sin horario y separa incidencias de esperados', () => {
    const s = summarizeCommitment([
      row('2026-10-01', 'rest_day'), row('2026-10-02', 'holiday'), row('2026-10-03', 'no_schedule'),
      row('2026-10-04', 'incident'), row('2026-10-05', 'present'),
    ], W);
    expect(s.expected).toBe(1);
    expect(s.incidents).toBe(1);
    expect(s.index).toBe(100);
  });

  it('asistencias, puntuales, salidas y faltas', () => {
    const s = summarizeCommitment([
      row('2026-10-01', 'present'),
      row('2026-10-02', 'late', { lateMinutes: 20 }),
      row('2026-10-03', 'early_departure'),
      row('2026-10-04', 'present', { hasClockOut: false }),
      row('2026-10-05', 'partial_absence'),
      row('2026-10-06', 'absent'),
    ], W);
    expect(s.expected).toBe(6);
    expect(s.present).toBe(4);
    expect(s.attendances).toBe(4.5);
    expect(s.punctual).toBe(3); // present, early, present sin salida
    expect(s.lates).toBe(1);
    expect(s.lateMinutes).toBe(20);
    expect(s.earlyDepartures).toBe(1);
    expect(s.missingExit).toBe(1);
    expect(s.completeExits).toBe(2);
    expect(s.absences).toBe(1);
    expect(s.partialAbsences).toBe(1);
    expect(s.pctAttendance).toBe(75);
    expect(s.pctPunctuality).toBe(50);
    expect(s.pctExits).toBe(50);
    expect(s.index).toBe(Math.round((75 * 40 + 50 * 40 + 50 * 20) / 100));
  });

  it('la falta por retardos acumulados cuenta como falta y no como puntual', () => {
    const s = summarizeCommitment([
      row('2026-10-01', 'late'),
      row('2026-10-02', 'late', { isLateAccumulationAbsence: true }),
      row('2026-10-03', 'present', { isLateAccumulationAbsence: true }),
    ], W);
    expect(s.absences).toBe(2);
    expect(s.lates).toBe(2);
    expect(s.punctual).toBe(0);
  });

  it('horas y horas extra con un decimal', () => {
    const s = summarizeCommitment([
      row('2026-10-01', 'present', { workedHours: 8.04, overtimeHours: 1.26 }),
      row('2026-10-02', 'holiday', { workedHours: 4 }),
    ], W);
    expect(s.hours).toBe(12);
    expect(s.overtimeHours).toBe(1.3);
  });

  it('sin presentes: salidas null y el indice usa asistencia', () => {
    const s = summarizeCommitment([row('2026-10-01', 'absent')], W);
    expect(s.pctExits).toBeNull();
    expect(s.index).toBe(0);
    expect(s.level).toBe('attention');
  });
});

describe('rachas', () => {
  const rows = [
    row('2026-10-01', 'present'), row('2026-10-02', 'present'), row('2026-10-03', 'rest_day'),
    row('2026-10-04', 'late'), row('2026-10-05', 'present'), row('2026-10-06', 'incident'),
    row('2026-10-07', 'early_departure'), row('2026-10-08', 'holiday'), row('2026-10-09', 'present'),
  ];
  it('racha actual omite descansos/festivos/incidencias y corta en retardo', () => {
    expect(currentPunctualStreak(rows)).toBe(3);
  });
  it('mejor racha', () => {
    expect(bestPunctualStreak(rows)).toBe(3);
    expect(bestPunctualStreak([row('2026-10-01', 'present'), row('2026-10-02', 'present'), row('2026-10-03', 'absent'), row('2026-10-04', 'present')])).toBe(2);
  });
  it('falta parcial y falta por retardos cortan', () => {
    expect(currentPunctualStreak([row('2026-10-01', 'present'), row('2026-10-02', 'partial_absence')])).toBe(0);
    expect(currentPunctualStreak([row('2026-10-01', 'present'), row('2026-10-02', 'present', { isLateAccumulationAbsence: true })])).toBe(0);
  });
  it('sin filas = 0', () => {
    expect(currentPunctualStreak([])).toBe(0);
    expect(bestPunctualStreak([])).toBe(0);
  });
});

describe('compareRanking', () => {
  const e = (name: string, index: number | null, absences = 0, lates = 0, currentStreak = 0) => ({
    name, summary: { index, absences, lates, currentStreak },
  });
  it('ordena por indice, faltas, retardos, racha y nombre; nulls al final', () => {
    const list = [
      e('Zoe', 90, 1), e('Ana', null), e('Beto', 90, 0, 2), e('Carla', 90, 0, 1, 1),
      e('Dani', 90, 0, 1, 5), e('Eli', 95, 3), e('Aldo', 90, 0, 1, 5),
    ];
    list.sort(compareRanking);
    expect(list.map((x) => x.name)).toEqual(['Eli', 'Aldo', 'Dani', 'Carla', 'Beto', 'Zoe', 'Ana']);
  });
});

describe('trendByBlock', () => {
  const rows = [
    row('2026-10-05', 'present'), row('2026-10-05', 'rest_day'), row('2026-10-06', 'late'),
    row('2026-10-07', 'absent'), row('2026-10-08', 'late', { isLateAccumulationAbsence: true }),
    row('2026-10-09', 'incident'), row('2026-10-20', 'partial_absence'),
  ];
  it('por dia, con la falta por retardos como falta', () => {
    const t = trendByBlock(rows, 'day', 'sunday');
    expect(t.map((b) => b.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-20']);
    expect(t.find((b) => b.date === '2026-10-08')).toMatchObject({ absences: 1, lates: 0 });
    expect(t.find((b) => b.date === '2026-10-05')).toMatchObject({ attendances: 1 });
  });
  it('por semana y por mes', () => {
    const w = trendByBlock(rows, 'week', 'sunday');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ date: '2026-10-04', attendances: 1, lates: 1, absences: 2, incidents: 1 });
    const m = trendByBlock(rows, 'month', 'sunday');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ label: 'oct', absences: 3 });
  });
});
