import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db';
import { AuthRequest } from '../types';

const avatarUploadDirectory = process.env.DIRECTORY_UPLOAD_AVATAR || 'uploads/avatars';
const avatarRootPath = path.resolve(process.cwd(), avatarUploadDirectory);

const resolveAvatarPath = (storedPath: string): string => {
  const absolutePath = path.isAbsolute(storedPath)
    ? path.normalize(storedPath)
    : path.resolve(process.cwd(), storedPath);

  const normalizedRoot = avatarRootPath.endsWith(path.sep)
    ? avatarRootPath
    : `${avatarRootPath}${path.sep}`;

  if (absolutePath !== avatarRootPath && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error('INVALID_AVATAR_PATH');
  }

  return absolutePath;
};

const removeAvatarIfExists = async (storedPath: string | null | undefined) => {
  if (!storedPath) {
    return;
  }

  try {
    const avatarPath = resolveAvatarPath(storedPath);
    await fs.promises.unlink(avatarPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }

    if (error?.message === 'INVALID_AVATAR_PATH') {
      console.error('Ruta de avatar invalida, no se elimina archivo:', storedPath);
      return;
    }

    console.error('No se pudo eliminar avatar anterior:', error);
  }
};

const getUserProfileById = async (userId: string) => {
  const result = await pool.query(
    `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        must_change_password,
        avatar_path,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const logProfileAudit = async (userId: string | undefined, action: string, ipAddress: string | undefined) => {
  if (!userId) {
    return;
  }

  try {
    await pool.query(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [userId, action, ipAddress ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoria de perfil:', error);
  }
};

const isAvatarColumnMissingError = (error: any): boolean => {
  return error?.code === '42703' && String(error?.message ?? '').includes('avatar_path');
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
  const { newPassword } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ message: 'La nueva contrasena debe tener al menos 6 caracteres' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(String(newPassword), salt);

    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );

    await logProfileAudit(userId, 'PASSWORD_CHANGE', req.ip);
    res.json({ message: 'Contrasena actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizando contrasena:', error);
    res.status(500).json({ message: 'Error al actualizar contrasena' });
  }
};

export const getMyProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  try {
    const profile = await getUserProfileById(userId);

    if (!profile) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(profile);
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      return res.status(409).json({
        message: 'La columna users.avatar_path no existe. Ejecuta la migracion de avatar de usuario.',
      });
    }

    console.error('Error obteniendo perfil del usuario:', error);
    res.status(500).json({ message: 'Error al obtener perfil del usuario' });
  }
};

export const uploadMyAvatar = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const file = req.file;

  if (!userId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  if (!file) {
    return res.status(400).json({ message: 'Debes enviar un archivo de avatar' });
  }

  try {
    const userResult = await pool.query('SELECT avatar_path FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (userResult.rows.length === 0) {
      await fs.promises.unlink(file.path).catch(() => undefined);
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const previousAvatarPath = userResult.rows[0]?.avatar_path as string | null;

    const updateResult = await pool.query(
      `
        UPDATE users
        SET avatar_path = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, full_name, role, avatar_path, updated_at;
      `,
      [file.path, userId]
    );

    await removeAvatarIfExists(previousAvatarPath);
    await logProfileAudit(userId, 'AVATAR_UPLOAD', req.ip);

    res.json({
      message: 'Avatar actualizado correctamente',
      user: updateResult.rows[0],
    });
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      return res.status(409).json({
        message: 'La columna users.avatar_path no existe. Ejecuta la migracion de avatar de usuario.',
      });
    }

    await fs.promises.unlink(file.path).catch(() => undefined);
    console.error('Error subiendo avatar:', error);
    res.status(500).json({ message: 'Error al subir avatar' });
  }
};

export const getMyAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Sesion invalida o expirada' });
    return;
  }

  try {
    const userResult = await pool.query('SELECT avatar_path FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    const avatarPath = userResult.rows[0]?.avatar_path as string | null;
    if (!avatarPath) {
      res.status(404).json({ message: 'El usuario no tiene avatar configurado' });
      return;
    }

    const resolvedPath = resolveAvatarPath(avatarPath);

    await fs.promises.access(resolvedPath, fs.constants.F_OK);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(resolvedPath);
  } catch (error: any) {
    if (isAvatarColumnMissingError(error)) {
      res.status(409).json({
        message: 'La columna users.avatar_path no existe. Ejecuta la migracion de avatar de usuario.',
      });
      return;
    }

    if (error?.code === 'ENOENT') {
      res.status(404).json({ message: 'Avatar no encontrado fisicamente' });
      return;
    }

    if (error?.message === 'INVALID_AVATAR_PATH') {
      res.status(500).json({ message: 'Ruta de avatar invalida en base de datos' });
      return;
    }

    console.error('Error obteniendo avatar:', error);
    res.status(500).json({ message: 'Error al obtener avatar' });
  }
};

export const deleteMyAvatar = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  try {
    const userResult = await pool.query('SELECT avatar_path FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const previousAvatarPath = userResult.rows[0]?.avatar_path as string | null;
    if (!previousAvatarPath) {
      return res.status(200).json({ message: 'El usuario ya no tiene avatar configurado' });
    }

    await pool.query(
      `
        UPDATE users
        SET avatar_path = NULL, updated_at = NOW()
        WHERE id = $1;
      `,
      [userId]
    );

    await removeAvatarIfExists(previousAvatarPath);
    await logProfileAudit(userId, 'AVATAR_DELETE', req.ip);

    res.json({ message: 'Avatar eliminado correctamente' });
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      return res.status(409).json({
        message: 'La columna users.avatar_path no existe. Ejecuta la migracion de avatar de usuario.',
      });
    }

    console.error('Error eliminando avatar:', error);
    res.status(500).json({ message: 'Error al eliminar avatar' });
  }
};
