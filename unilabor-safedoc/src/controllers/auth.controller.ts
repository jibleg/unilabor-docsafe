import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { listUserModuleAccess } from '../services/module-access.service';
import { recoverPasswordByEmail } from '../services/password.service';

const getTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const logAuthAudit = async (userId: string, action: string, ipAddress: string | undefined) => {
  try {
    await pool.query(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [userId, action, ipAddress ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoria de autenticacion:', error);
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son requeridos' });
  }

  try {
    // Consulta SQL pura para obtener el usuario
    const query = `
      SELECT id, full_name, email, password_hash, role, must_change_password
      FROM users 
      WHERE email = $1 AND is_active = TRUE
    `;
    const result = await pool.query(query, [email]);
    const user = result.rows[0];

    // Verificar si el usuario existe
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Comparar contraseña con el hash de la base de datos
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Generar el token JWT con expiración de 8 horas
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        mustChangePassword: user.must_change_password 
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    // Registrar el acceso en la tabla de auditoría (Opcional pero recomendado)
    const availableModules = await listUserModuleAccess(user.id, user.role);
    await logAuthAudit(user.id, 'LOGIN', req.ip);

    // Responder con el token y datos básicos del usuario
    res.json({
      message: 'Ingreso exitoso',
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.must_change_password
      },
      availableModules
    });

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const recoverPassword = async (req: Request, res: Response) => {
  const email = getTrimmedString(req.body?.email);

  if (!email) {
    return res.status(400).json({ message: 'Email es requerido' });
  }

  const genericMessage =
    'Si el correo existe y esta activo, recibiras una contrasena temporal para recuperar el acceso';

  try {
    const result = await recoverPasswordByEmail({ email });

    if (result.userId && result.emailSent) {
      await logAuthAudit(result.userId, 'PASSWORD_RECOVERY_REQUEST', req.ip);
    }

    res.json({ message: genericMessage });
  } catch (error) {
    console.error('Error en recuperacion de contrasena:', error);
    res.json({ message: genericMessage });
  }
};
