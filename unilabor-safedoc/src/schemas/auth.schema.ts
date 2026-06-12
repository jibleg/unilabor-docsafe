import { z } from 'zod';

// Login: el email se valida como string no vacio (la verificacion real es contra
// la BD); no forzamos formato estricto para no rechazar usuarios existentes.
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'El email es requerido'),
  password: z.string().min(1, 'La contrasena es requerida'),
});

export const recoverPasswordSchema = z.object({
  email: z.string().trim().min(1, 'El email es requerido').pipe(z.email('Email invalido')),
});
