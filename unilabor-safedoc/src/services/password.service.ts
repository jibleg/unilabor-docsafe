import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PoolClient } from 'pg';
import pool from '../config/db';
import { sendPasswordRecoveryEmail, sendPasswordResetEmail } from './email.service';

type PasswordNotificationVariant = 'admin-reset' | 'recovery';

interface PasswordResetTargetUser {
  id: string;
  email: string;
  full_name: string;
}

interface UpdatedUserPasswordRecord {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  updated_at: string;
}

interface ResetPasswordForUserByIdOptions {
  userId: string;
  temporaryPassword?: string;
  rollbackOnEmailFailure?: boolean;
}

interface RecoverPasswordByEmailOptions {
  email: string;
}

export interface PasswordResetResult {
  user: UpdatedUserPasswordRecord;
  temporaryPassword: string;
  emailSent: boolean;
}

export interface PasswordRecoveryResult {
  userId: string | null;
  emailSent: boolean;
}

const generateTemporaryPassword = (): string => crypto.randomBytes(9).toString('base64url');

const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const fetchUserById = async (
  client: PoolClient,
  userId: string
): Promise<PasswordResetTargetUser | null> => {
  const result = await client.query(
    `
      SELECT id, email, full_name
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE;
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const fetchActiveUserByEmail = async (
  client: PoolClient,
  email: string
): Promise<PasswordResetTargetUser | null> => {
  const result = await client.query(
    `
      SELECT id, email, full_name
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND is_active = TRUE
      LIMIT 1
      FOR UPDATE;
    `,
    [email]
  );

  return result.rows[0] ?? null;
};

const updateUserTemporaryPassword = async (
  client: PoolClient,
  userId: string,
  passwordHash: string
): Promise<UpdatedUserPasswordRecord | null> => {
  const result = await client.query(
    `
      UPDATE users
      SET
        password_hash = $1,
        must_change_password = TRUE,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, full_name, role, is_active, must_change_password, updated_at;
    `,
    [passwordHash, userId]
  );

  return result.rows[0] ?? null;
};

const sendTemporaryPasswordNotification = async (
  targetUser: PasswordResetTargetUser,
  temporaryPassword: string,
  variant: PasswordNotificationVariant
) => {
  if (variant === 'recovery') {
    await sendPasswordRecoveryEmail(targetUser.email, targetUser.full_name, temporaryPassword);
    return;
  }

  await sendPasswordResetEmail(targetUser.email, targetUser.full_name, temporaryPassword);
};

export const resetPasswordForUserById = async ({
  userId,
  temporaryPassword,
  rollbackOnEmailFailure = false,
}: ResetPasswordForUserByIdOptions): Promise<PasswordResetResult | null> => {
  const client = await pool.connect();
  let shouldRollback = false;

  try {
    await client.query('BEGIN');
    shouldRollback = true;

    const targetUser = await fetchUserById(client, userId);
    if (!targetUser) {
      await client.query('ROLLBACK');
      shouldRollback = false;
      return null;
    }

    const resolvedTemporaryPassword =
      temporaryPassword && temporaryPassword.length > 0 ? temporaryPassword : generateTemporaryPassword();
    const passwordHash = await hashPassword(resolvedTemporaryPassword);
    const updatedUser = await updateUserTemporaryPassword(client, userId, passwordHash);

    if (!updatedUser) {
      throw new Error('PASSWORD_RESET_UPDATE_FAILED');
    }

    let emailSent = false;

    try {
      await sendTemporaryPasswordNotification(targetUser, resolvedTemporaryPassword, 'admin-reset');
      emailSent = true;
    } catch (error) {
      if (rollbackOnEmailFailure) {
        await client.query('ROLLBACK');
        shouldRollback = false;

        const wrappedError = new Error('PASSWORD_RESET_EMAIL_FAILED');
        (wrappedError as any).code = 'PASSWORD_RESET_EMAIL_FAILED';
        (wrappedError as any).cause = error;
        throw wrappedError;
      }

      console.error('Error enviando correo de reset de contrasena:', error);
    }

    await client.query('COMMIT');
    shouldRollback = false;

    return {
      user: updatedUser,
      temporaryPassword: resolvedTemporaryPassword,
      emailSent,
    };
  } catch (error) {
    if (shouldRollback) {
      await client.query('ROLLBACK').catch(() => undefined);
    }

    throw error;
  } finally {
    client.release();
  }
};

export const recoverPasswordByEmail = async ({
  email,
}: RecoverPasswordByEmailOptions): Promise<PasswordRecoveryResult> => {
  const client = await pool.connect();
  let shouldRollback = false;

  try {
    await client.query('BEGIN');
    shouldRollback = true;

    const targetUser = await fetchActiveUserByEmail(client, email);
    if (!targetUser) {
      await client.query('ROLLBACK');
      shouldRollback = false;
      return {
        userId: null,
        emailSent: false,
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const updatedUser = await updateUserTemporaryPassword(client, targetUser.id, passwordHash);

    if (!updatedUser) {
      throw new Error('PASSWORD_RECOVERY_UPDATE_FAILED');
    }

    await sendTemporaryPasswordNotification(targetUser, temporaryPassword, 'recovery');
    await client.query('COMMIT');
    shouldRollback = false;

    return {
      userId: targetUser.id,
      emailSent: true,
    };
  } catch (error) {
    if (shouldRollback) {
      await client.query('ROLLBACK').catch(() => undefined);
    }

    throw error;
  } finally {
    client.release();
  }
};
