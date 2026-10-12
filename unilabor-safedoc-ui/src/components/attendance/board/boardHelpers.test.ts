import { describe, expect, it } from 'vitest';
import { buildCommitmentParams } from '../../../api/service.api-attendance-boards';
import {
  clampPercent, formatDifference, formatMinutes, formatPercent, parsePeriod, percentColor, sortPeopleByStatus,
  BAD_COLOR, GOOD_COLOR, MUTED_COLOR, WARN_COLOR,
} from './boardHelpers';

describe('boardHelpers', () => {
  it('colorea porcentajes segun umbrales', () => {
    expect(percentColor(97)).toBe(GOOD_COLOR);
    expect(percentColor(95)).toBe(GOOD_COLOR);
    expect(percentColor(80)).toBe(WARN_COLOR);
    expect(percentColor(69)).toBe(BAD_COLOR);
    expect(percentColor(null)).toBe(MUTED_COLOR);
    expect(percentColor(85, { attendance: 1, punctuality: 1, exits: 1, exemplary: 90, attention: 86 })).toBe(BAD_COLOR);
  });

  it('formatea porcentajes, minutos y diferencias', () => {
    expect(formatPercent(82.4)).toBe('82%');
    expect(formatPercent(null)).toBe('—');
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(125)).toBe('2 h 5 min');
    expect(formatDifference(3)).toBe('+3 pts');
    expect(formatDifference(-2)).toBe('-2 pts');
    expect(formatDifference(0)).toBe('igual al equipo');
  });

  it('ordena personas por estado y nombre sin mutar', () => {
    const input = [
      { status: 'left' as const, full_name: 'Zeta' },
      { status: 'late' as const, full_name: 'Beta' },
      { status: 'late' as const, full_name: 'Alfa' },
    ];
    const sorted = sortPeopleByStatus(input);
    expect(sorted.map((p) => p.full_name)).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(input[0]?.full_name).toBe('Zeta');
  });

  it('parsea periodos invalidos a month', () => {
    expect(parsePeriod('quarter')).toBe('quarter');
    expect(parsePeriod('foo')).toBe('month');
    expect(parsePeriod(null)).toBe('month');
  });

  it('arma la query del compromiso', () => {
    expect(buildCommitmentParams({ period: 'month', anchor: '2026-10-01', from: 'x', branch_id: '', employee_id: '4' }))
      .toEqual({ period: 'month', anchor: '2026-10-01', employee_id: '4' });
    expect(buildCommitmentParams({ period: 'custom', anchor: '2026-10-01', from: '2026-09-01', to: '2026-09-30' }))
      .toEqual({ period: 'custom', from: '2026-09-01', to: '2026-09-30' });
  });
});
