import { Router } from 'express';
import { getMyAccess, login, recoverPassword } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { verifyToken } from '../middlewares/auth.middleware';
import { loginSchema, recoverPasswordSchema } from '../schemas/auth.schema';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), login);
router.post('/recover-password', validate(recoverPasswordSchema), recoverPassword);
// GET /api/auth/me/access - refresca modulos + permisos del usuario autenticado
router.get('/me/access', verifyToken, getMyAccess);

export default router;
