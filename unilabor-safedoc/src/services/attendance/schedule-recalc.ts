import { addDays, type DateString } from './engine/time';
import { getAttendanceSettings } from './attendance-settings.service';
import { recalculateAffectedPastDays } from './day-recalculation.service';
import { todayInZone } from './timezone';

/**
 * Recalculo de dias pasados tras un cambio de horario. MEJOR ESFUERZO: un
 * fallo se registra en el log pero nunca rompe la peticion.
 */

export interface RecalcRange {
  employeeId: number;
  from: DateString;
  /** null = sin fin: se acota al dia de hoy. */
  to: DateString | null;
}

export const recalcAfterScheduleChange = async (ranges: readonly RecalcRange[]): Promise<void> => {
  try {
    const settings = await getAttendanceSettings();
    const today = todayInZone(settings.timezone);
    // Solo importan los dias ya vividos; el servicio de calculo los acota igualmente.
    const merged = new Map<number, { from: DateString; to: DateString }>();
    for (const range of ranges) {
      const to = range.to ?? today;
      if (range.from > addDays(today, -1)) continue;
      const current = merged.get(range.employeeId);
      merged.set(range.employeeId, {
        from: current && current.from < range.from ? current.from : range.from,
        to: current && current.to > to ? current.to : to,
      });
    }
    for (const [employeeId, range] of merged) {
      try {
        await recalculateAffectedPastDays(employeeId, range.from, range.to);
      } catch (error) {
        console.error(`[attendance] recalculo de dias afectados fallo (colaborador ${employeeId}):`, error);
      }
    }
  } catch (error) {
    console.error('[attendance] recalculo tras cambio de horario fallo:', error);
  }
};
