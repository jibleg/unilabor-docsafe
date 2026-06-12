import { Router } from 'express';
import { login, recoverPassword } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema, recoverPasswordSchema } from '../schemas/auth.schema';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), login);
router.post('/recover-password', validate(recoverPasswordSchema), recoverPassword);

export default router;
