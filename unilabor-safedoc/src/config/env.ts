import type { SignOptions } from 'jsonwebtoken';

/**
 * Configuracion y validacion de variables de entorno sensibles.
 *
 * Los getters leen `process.env` en tiempo de llamada (no en import) para no
 * acoplar la validacion a la carga del modulo (util en pruebas). `assertRequiredEnv`
 * se invoca explicitamente al arranque para fallar rapido ante configuracion insegura.
 */

const INSECURE_JWT_SECRET = 'change-me';

export const getJwtSecret = (): string => process.env.JWT_SECRET ?? '';

export const getJwtExpiresIn = (): NonNullable<SignOptions['expiresIn']> =>
  (process.env.JWT_EXPIRES_IN || '8h') as NonNullable<SignOptions['expiresIn']>;

/**
 * Credenciales de LabsMobile (SMS). Opcionales: si faltan, el canal SMS queda
 * deshabilitado (se registra 'skipped') sin afectar el resto del flujo.
 */
export const getLabsMobileConfig = (): { username: string; token: string; sender?: string } | null => {
  const username = process.env.LABSMOBILE_USER?.trim();
  const token = process.env.LABSMOBILE_TOKEN?.trim();
  if (!username || !token) {
    return null;
  }
  const sender = process.env.LABSMOBILE_SENDER?.trim();
  return sender ? { username, token, sender } : { username, token };
};

/**
 * Valida la configuracion critica al arranque. Lanza si falta `JWT_SECRET` o si
 * conserva el valor por defecto inseguro. Llamar antes de `app.listen`.
 */
export const assertRequiredEnv = (): void => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error('JWT_SECRET no esta definido. Configuralo en el .env antes de iniciar el servidor.');
  }

  if (secret === INSECURE_JWT_SECRET) {
    throw new Error(
      `JWT_SECRET tiene el valor por defecto inseguro "${INSECURE_JWT_SECRET}". ` +
        'Genera un secreto fuerte (p. ej. `openssl rand -hex 32`) y actualizalo en el .env.',
    );
  }
};
