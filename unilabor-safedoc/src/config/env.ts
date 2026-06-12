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
