import { Router } from 'express';
import { authenticateAgent } from '../../middlewares/attendance-agent.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  heartbeatController, orderResultController, punchesController, takeOrdersController,
} from '../../controllers/attendance/agent.controller';
import { heartbeatSchema, punchesBodySchema } from '../../schemas/attendance/agent.schema';

/**
 * Rutas del agente HikVision local: /api/attendance/agent/*.
 * NO usan verifyToken (JWT de usuario): autentican con la clave del agente
 * (Authorization: Bearer <64 hex>) mediante su propio middleware.
 */
const router = Router();
router.use(authenticateAgent);

router.post('/heartbeat', validate(heartbeatSchema), heartbeatController);
router.get('/orders', takeOrdersController);
router.post('/orders/:id/result', orderResultController);
router.post('/punches', validate(punchesBodySchema), punchesController);

export default router;
