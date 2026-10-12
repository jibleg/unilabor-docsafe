import { Router } from 'express';
import { verifyToken } from '../../middlewares/auth.middleware';
import boardsRoutes from './boards.routes';
import daysRoutes from './days.routes';
import devicesRoutes from './devices.routes';
import employeesRoutes from './employees.routes';
import exportsRoutes from './exports.routes';
import incidentsRoutes from './incidents.routes';
import punchesRoutes from './punches.routes';
import scheduleRoutes from './schedule.routes';
import settingsRoutes from './settings.routes';
import vacationsRoutes from './vacations.routes';
export { default as attendanceAgentRoutes } from './agent.routes';

/** Router autenticado (JWT de usuario) del modulo Control de Asistencias. */
const router = Router();
router.use(verifyToken);
router.use(settingsRoutes);
router.use(employeesRoutes);
router.use(scheduleRoutes);
router.use(daysRoutes);
router.use(punchesRoutes);
router.use(incidentsRoutes);
router.use(vacationsRoutes);
router.use(boardsRoutes);
router.use(exportsRoutes);
router.use(devicesRoutes);

export default router;
