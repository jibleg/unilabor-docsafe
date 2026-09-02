import cron from 'node-cron';
import pool from '../config/db';
import { sweepExpiredInductionReadings } from './rh-induction.service';

/**
 * Scheduler in-process del programa de Induccion: abre la evaluacion de las
 * inscripciones cuyo limite de lectura vencio sin completarse. El mismo
 * chequeo corre lazy al consultar el progreso (colaborador o RH); este cron
 * garantiza la apertura aunque nadie visite las paginas. Idempotente.
 */

const tablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.rh_induction_enrollments') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

export const runInductionReadingSweep = async (): Promise<void> => {
  try {
    if (!(await tablesExist())) {
      return;
    }
    const opened = await sweepExpiredInductionReadings();
    if (opened > 0) {
      console.log(`Induccion: ${opened} inscripcion(es) con lectura vencida pasaron a evaluacion.`);
    }
  } catch (error) {
    console.error('Error en el barrido de lecturas de induccion vencidas:', error);
  }
};

export const startInductionScheduler = (): void => {
  cron.schedule('*/10 * * * *', () => {
    void runInductionReadingSweep();
  });
  console.log('Scheduler de induccion (lecturas con limite) activo (cron "*/10 * * * *").');
};
