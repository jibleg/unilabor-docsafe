import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/db';
import { sendWelcomeEmail } from '../services/email.service';
import { resetPasswordForUserById } from '../services/password.service';
import * as categoryService from '../services/category.service';
import { AuthRequest, UserRole } from '../types';

const allowedRoles: UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

const getStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
};

const parseCategoryIds = (rawValue: unknown): number[] | null => {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  if (!Array.isArray(rawValue)) {
    return null;
  }

  const parsedIds = rawValue.map((value) => Number.parseInt(String(value), 10));
  if (parsedIds.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  return Array.from(new Set(parsedIds));
};

const parseUserId = (rawValue: unknown): string | null => {
  const value = getStringValue(rawValue);
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value.trim();
};

const userCategoriesTableExists = async (client: any): Promise<boolean> => {
  const result = await client.query(`SELECT to_regclass('public.user_categories') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const categoriesStatusColumnExists = async (client: any): Promise<boolean> => {
  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'categories'
        AND column_name = 'is_active'
    ) AS exists;
  `;
  const result = await client.query(query);
  return Boolean(result.rows[0]?.exists);
};

const logUserAudit = async (userId: string | undefined, action: string, ipAddress: string | undefined) => {
  if (!userId) {
    return;
  }

  try {
    await pool.query(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [userId, action, ipAddress ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoria de usuario:', error);
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  const { email, full_name, role, category_ids, categoryIds } = req.body;
  const normalizedRole = String(role ?? '').toUpperCase() as UserRole;
  const rawCategoryIds = category_ids ?? categoryIds;
  const parsedCategoryIds = parseCategoryIds(rawCategoryIds);

  if (!email || !full_name || !normalizedRole) {
    return res.status(400).json({ message: 'Email, nombre y rol son obligatorios' });
  }

  if (!allowedRoles.includes(normalizedRole)) {
    return res.status(400).json({ message: `Rol invalido. Valores permitidos: ${allowedRoles.join(', ')}` });
  }

  if (parsedCategoryIds === null) {
    return res.status(400).json({ message: 'category_ids debe ser un arreglo de IDs numericos validos' });
  }

  if (normalizedRole === 'VIEWER' && parsedCategoryIds.length === 0) {
    return res.status(400).json({ message: 'Un usuario VIEWER debe tener al menos una categoria asignada' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userExists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El correo ya esta registrado' });
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    const query = `
      INSERT INTO users (email, password_hash, full_name, role, must_change_password)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, email, full_name, role, must_change_password;
    `;
    const values = [email, passwordHash, full_name, normalizedRole];
    const result = await client.query(query, values);
    const createdUser = result.rows[0];

    if (parsedCategoryIds.length > 0) {
      const hasUserCategoriesTable = await userCategoriesTableExists(client);
      if (!hasUserCategoriesTable) {
        const missingTableError = new Error('USER_CATEGORIES_TABLE_NOT_AVAILABLE');
        (missingTableError as any).code = 'USER_CATEGORIES_TABLE_NOT_AVAILABLE';
        throw missingTableError;
      }

      const hasCategoryStatusColumn = await categoriesStatusColumnExists(client);
      const categoriesValidationQuery = `
        SELECT COUNT(*)::int AS total,
               COALESCE(
                 json_agg(json_build_object('id', c.id, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL),
                 '[]'::json
               ) AS categories
        FROM categories c
        WHERE c.id = ANY($1::int[])
        ${hasCategoryStatusColumn ? 'AND c.is_active = TRUE' : ''};
      `;
      const categoriesValidation = await client.query(categoriesValidationQuery, [parsedCategoryIds]);
      const validCategories = Number(categoriesValidation.rows[0]?.total ?? 0);

      if (validCategories !== parsedCategoryIds.length) {
        const invalidCategoryError = new Error('INVALID_CATEGORY_IDS');
        (invalidCategoryError as any).code = 'INVALID_CATEGORY_IDS';
        throw invalidCategoryError;
      }

      await client.query(
        `
          INSERT INTO user_categories (user_id, category_id)
          SELECT $1, category_id
          FROM UNNEST($2::int[]) AS category_id
          ON CONFLICT (user_id, category_id) DO NOTHING;
        `,
        [createdUser.id, parsedCategoryIds]
      );
    }

    await client.query('COMMIT');

    try {
      await sendWelcomeEmail(email, full_name, tempPassword);
    } catch (mailError) {
      console.error('Error enviando email:', mailError);
    }

    await logUserAudit(req.user?.id, `USER_CREATE:${createdUser.id}`, req.ip);

    res.status(201).json({
      message: 'Usuario creado exitosamente y notificacion enviada',
      user: {
        ...createdUser,
        category_ids: parsedCategoryIds,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error?.code === 'USER_CATEGORIES_TABLE_NOT_AVAILABLE') {
      return res.status(409).json({
        message: 'La relacion user_categories no existe. Ejecuta la migracion de categorias/usuarios.',
      });
    }

    if (error?.code === 'INVALID_CATEGORY_IDS') {
      return res.status(400).json({
        message: 'Una o mas categorias no existen o estan inactivas.',
      });
    }

    console.error(error);
    res.status(500).json({ message: 'Error interno al crear usuario' });
  } finally {
    client.release();
  }
};

export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const hasUserCategoriesTableResult = await pool.query(
      `SELECT to_regclass('public.user_categories') IS NOT NULL AS exists;`
    );

    const hasUserCategoriesTable = Boolean(hasUserCategoriesTableResult.rows[0]?.exists);

    const query = hasUserCategoriesTable
      ? `
          SELECT
            u.id,
            u.email,
            u.full_name,
            u.role,
            u.is_active,
            u.created_at,
            COALESCE(
              json_agg(
                json_build_object('id', c.id, 'name', c.name)
                ORDER BY c.name
              ) FILTER (WHERE c.id IS NOT NULL),
              '[]'::json
            ) AS categories
          FROM users u
          LEFT JOIN user_categories uc ON uc.user_id = u.id
          LEFT JOIN categories c ON c.id = uc.category_id
          WHERE u.is_active = TRUE
          GROUP BY u.id, u.email, u.full_name, u.role, u.is_active, u.created_at
          ORDER BY u.created_at DESC;
        `
      : 'SELECT id, email, full_name, role, is_active, created_at FROM users WHERE is_active = TRUE ORDER BY created_at DESC';

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};

export const getMyCategories = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id || !req.user.role) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }

  try {
    const categories = await categoryService.listCategoriesForUser(req.user.id, req.user.role);
    res.json(categories);
  } catch (error) {
    console.error('Error obteniendo categorias del usuario autenticado:', error);
    res.status(500).json({ message: 'Error al obtener categorias del usuario' });
  }
};

export const getUserCategoriesById = async (req: AuthRequest, res: Response) => {
  const userId = getStringValue(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  try {
    const categories = await categoryService.getUserCategories(userId);
    res.json(categories);
  } catch (error) {
    console.error('Error obteniendo categorias del usuario:', error);
    res.status(500).json({ message: 'Error al obtener categorias del usuario' });
  }
};

export const replaceUserCategoriesById = async (req: AuthRequest, res: Response) => {
  const userId = getStringValue(req.params.id);
  const rawCategoryIds = req.body?.categoryIds ?? req.body?.category_ids;
  const parsedCategoryIds = parseCategoryIds(rawCategoryIds);

  if (!userId) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  if (parsedCategoryIds === null) {
    return res.status(400).json({ message: 'categoryIds debe ser un arreglo de IDs numericos validos' });
  }

  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const targetRole = String(userResult.rows[0]?.role ?? '').toUpperCase();
    if (targetRole === 'VIEWER' && parsedCategoryIds.length === 0) {
      return res.status(400).json({ message: 'Un usuario VIEWER debe tener al menos una categoria asignada' });
    }

    const categories = await categoryService.replaceUserCategories(userId, parsedCategoryIds);

    await logUserAudit(req.user?.id, `USER_CATEGORY_ASSIGN:${userId}`, req.ip);
    res.json({
      message: 'Categorias del usuario actualizadas correctamente',
      categories,
    });
  } catch (error: any) {
    if (error?.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (error?.code === 'INVALID_CATEGORY_IDS') {
      return res.status(400).json({ message: 'Una o mas categorias no existen o estan inactivas' });
    }

    if (error?.code === 'USER_CATEGORIES_TABLE_NOT_AVAILABLE') {
      return res.status(409).json({
        message: 'La relacion user_categories no existe. Ejecuta la migracion de categorias/usuarios.',
      });
    }

    console.error('Error actualizando categorias del usuario:', error);
    res.status(500).json({ message: 'Error al actualizar categorias del usuario' });
  }
};

export const updateUserById = async (req: AuthRequest, res: Response) => {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  const email = getStringValue(req.body?.email);
  const fullName = getStringValue(req.body?.full_name);
  const role = getStringValue(req.body?.role);

  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedFullName = fullName?.trim();
  const normalizedRole = role?.trim().toUpperCase() as UserRole | undefined;

  if (!normalizedEmail && !normalizedFullName && !normalizedRole) {
    return res.status(400).json({
      message: 'Debes enviar al menos un campo para actualizar: email, full_name o role',
    });
  }

  if (normalizedRole && !allowedRoles.includes(normalizedRole)) {
    return res.status(400).json({ message: `Rol invalido. Valores permitidos: ${allowedRoles.join(', ')}` });
  }

  try {
    if (normalizedEmail) {
      const emailExists = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1',
        [normalizedEmail, userId]
      );
      if (emailExists.rows.length > 0) {
        return res.status(409).json({ message: 'Ya existe otro usuario con ese correo' });
      }
    }

    if (normalizedRole === 'VIEWER') {
      const hasUserCategoriesTable = await pool.query(
        `SELECT to_regclass('public.user_categories') IS NOT NULL AS exists;`
      );
      if (Boolean(hasUserCategoriesTable.rows[0]?.exists)) {
        const categoryCountResult = await pool.query(
          'SELECT COUNT(*)::int AS total FROM user_categories WHERE user_id = $1',
          [userId]
        );
        const categoryCount = Number(categoryCountResult.rows[0]?.total ?? 0);
        if (categoryCount === 0) {
          return res.status(400).json({
            message: 'No puedes asignar rol VIEWER a un usuario sin categorias asociadas',
          });
        }
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (normalizedEmail) {
      values.push(normalizedEmail);
      updates.push(`email = $${values.length}`);
    }

    if (normalizedFullName) {
      values.push(normalizedFullName);
      updates.push(`full_name = $${values.length}`);
    }

    if (normalizedRole) {
      values.push(normalizedRole);
      updates.push(`role = $${values.length}`);
    }

    updates.push('updated_at = NOW()');
    values.push(userId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, email, full_name, role, is_active, must_change_password, created_at, updated_at;
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await logUserAudit(req.user?.id, `USER_UPDATE:${userId}`, req.ip);

    res.json({
      message: 'Usuario actualizado correctamente',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};

export const deleteUserById = async (req: AuthRequest, res: Response) => {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  if (req.user?.id === userId) {
    return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE users
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, full_name, role, is_active, updated_at;
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await logUserAudit(req.user?.id, `USER_DELETE:${userId}`, req.ip);

    res.json({
      message: 'Usuario inactivado correctamente',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
};

export const resetUserPasswordById = async (req: AuthRequest, res: Response) => {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  if (req.user?.id === userId) {
    return res.status(400).json({
      message: 'No puedes restablecer tu propia contrasena desde este endpoint. Usa change-password.',
    });
  }

  const providedPassword = getStringValue(req.body?.temporaryPassword)?.trim();
  if (providedPassword !== null && providedPassword !== undefined && providedPassword.length > 0) {
    if (providedPassword.length < 6) {
      return res.status(400).json({
        message: 'temporaryPassword debe tener al menos 6 caracteres',
      });
    }
  }

  const temporaryPassword =
    providedPassword && providedPassword.length > 0
      ? providedPassword
      : crypto.randomBytes(9).toString('base64url');

  try {
    const resetResult = await resetPasswordForUserById({
      userId,
      temporaryPassword,
    });

    if (!resetResult) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await logUserAudit(req.user?.id, `USER_PASSWORD_RESET:${userId}`, req.ip);

    res.json({
      message: resetResult.emailSent
        ? 'Contrasena restablecida correctamente y correo de notificacion enviado'
        : 'Contrasena restablecida correctamente, pero no se pudo enviar el correo',
      user: resetResult.user,
      temporaryPassword: resetResult.temporaryPassword,
      emailSent: resetResult.emailSent,
    });
  } catch (error) {
    console.error('Error restableciendo contrasena del usuario:', error);
    res.status(500).json({ message: 'Error al restablecer contrasena del usuario' });
  }
};
