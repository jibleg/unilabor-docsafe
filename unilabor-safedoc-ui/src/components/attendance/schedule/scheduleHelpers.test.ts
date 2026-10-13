import { describe, expect, it } from 'vitest';
import {
  crossesMidnight,
  describeWeekdays,
  findOverlaps,
  grossMinutes,
  isoWeekday,
  netHours,
  orderedWeekdays,
  readableTextColor,
  shiftsOverlap,
  windowRange,
} from './scheduleHelpers';
import type { AttendanceShift } from '../../../api/service.api-attendance-schedule';

const shift = (name: string, start_time: string, end_time: string, break_minutes = 0): AttendanceShift => ({
  id: 1, name, start_time, end_time, break_minutes, crosses_midnight: false, shift_type: 'fixed', color_hex: '#000000', is_active: true,
  entry_before_min: 60, entry_after_min: 120, exit_before_min: 60, exit_after_min: 120,
});

describe('scheduleHelpers', () => {
  it('calcula horas netas y cruce de medianoche', () => {
    expect(netHours('08:00', '17:00', 60)).toBe(8);
    expect(grossMinutes('22:00', '06:00')).toBe(480);
    expect(crossesMidnight('22:00', '06:00')).toBe(true);
    expect(crossesMidnight('08:00', '12:00')).toBe(false);
    expect(netHours('08:00', '08:30', 60)).toBe(0);
  });

  it('detecta traslapes', () => {
    expect(shiftsOverlap(shift('A', '08:00', '12:00'), shift('B', '10:00', '14:00'))).toBe(true);
    expect(shiftsOverlap(shift('A', '08:00', '12:00'), shift('B', '12:00', '16:00'))).toBe(false);
    expect(shiftsOverlap(shift('N', '22:00', '06:00'), shift('B', '02:00', '04:00'))).toBe(true);
    expect(findOverlaps([shift('A', '08:00', '12:00'), shift('B', '13:00', '17:00')])).toEqual([]);
  });

  it('ordena los dias segun el inicio de semana', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-11')).toBe(7);
    expect(orderedWeekdays('2026-10-11')).toEqual([7, 1, 2, 3, 4, 5, 6]);
    expect(orderedWeekdays('2026-10-12')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('describe dias y contraste', () => {
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('Lun a Vie');
    expect(describeWeekdays([1, 3, 6])).toBe('Lun, Mié, Sáb');
    expect(readableTextColor('#F9B318')).toBe('#1f2937');
    expect(readableTextColor('#034898')).toBe('#ffffff');
  });
});

describe('windowRange', () => {
  it('calcula el rango de una ventana de checada', () => {
    expect(windowRange('07:00', 60, 120)).toBe('06:00–09:00');
    expect(windowRange('15:00', 60, 120)).toBe('14:00–17:00');
  });
  it('cruza medianoche', () => {
    expect(windowRange('23:30', 30, 90)).toBe('23:00–01:00');
  });
});
