import { Router } from 'express';
import { login, recoverPassword } from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/login
router.post('/login', login);
router.post('/recover-password', recoverPassword);

export default router;
