import cron from 'node-cron';
import pool from '../../config/db';
import { getAttendanceSettings } from './attendance-settings.service';
import { recalculateRange, type RecalculationSummary } from './day-recalculation.service';
import { addDays } from './engine/time';
import { todayInZone } from './timezone';
import { openVacationPeriodsForAll } from './vacation-periods.service';

/**
 * Proceso nocturno del Control de Asistencias: recalcula los ultimos 3 dias
 * (hasta ayer) y abre los periodos de vacaciones por aniversario. Idempotente.
 * ATTENDANCE_ENABLED=false lo apaga; ATTENDANCE_CRON define el horario.
 */

const RECALCULATION_DAYS = 3;
const DEFAULT_CRON = '30 3 * * *';

export interface NightlyJobResult {
  skipped: boolean;
  from?: string;
  to?: string;
  recalculation?: RecalculationSummary;
  vacationPeriods?: number | null;
}

const tablesExist = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('attendance.daily_results') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

export const runAttendanceNightlyJob = async (now: Date = new Date()): Promise<NightlyJobResult> => {
  if (!(await tablesExist())) {
    return { skipped: true };
  }
  const settings = await getAttendanceSettings();
  const today = todayInZone(settings.timezone, now);
  const to = addDays(today, -1);
  const from = addDays(to, -(RECALCULATION_DAYS - 1));

  const recalculation = await recalculateRange({ from, to });

  let vacationPeriods: number | null = null;
  try {
    vacationPeriods = await openVacationPeriodsForAll(today);
  } catch (error) {
    console.error('Asistencias: fallo la apertura de periodos de vacaciones:', error);
  }

  console.log(
    `Asistencias: recalculo nocturno ${from}..${to} -> ${recalculation.employees} colaborador(es), ` +
      `${recalculation.days} dia(s); periodos de vacaciones tocados: ${vacationPeriods ?? 'error'}.`,
  );
  return { skipped: false, from, to, recalculation, vacationPeriods };
};

export const startAttendanceScheduler = (): void => {
  if (process.env.ATTENDANCE_ENABLED === 'false') {
    console.log('Scheduler de asistencias desactivado (ATTENDANCE_ENABLED=false).');
    return;
  }
  const expression = process.env.ATTENDANCE_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.error(`Scheduler de asistencias: expresion cron invalida "${expression}".`);
    return;
  }
  cron.schedule(expression, () => {
    runAttendanceNightlyJob().catch((error) => {
      console.error('Error en el proceso nocturno de asistencias:', error);
    });
  });
  console.log(`Scheduler de asistencias activo (cron "${expression}").`);
};
