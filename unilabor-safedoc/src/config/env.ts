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
export const getLabsMobileConfig = ():
  | { username: string; token: string; sender?: string; apiBase: string }
  | null => {
  const username = (process.env.LABSMOBILE_USERNAME || process.env.LABSMOBILE_USER)?.trim();
  const token = (process.env.LABSMOBILE_API_TOKEN || process.env.LABSMOBILE_TOKEN)?.trim();
  if (!username || !token) {
    return null;
  }
  const sender = process.env.LABSMOBILE_SENDER?.trim();
  const apiBase = process.env.LABSMOBILE_API_BASE?.trim() || 'https://api.labsmobile.com/json/send';
  return sender ? { username, token, sender, apiBase } : { username, token, apiBase };
};

/**
 * Credenciales de Whapi Cloud (WhatsApp) para el canal 'whatsapp' de
 * notification.service.ts. Opcional: sin token, el envio cae a 'skipped' con
 * WHATSAPP_NOT_CONFIGURED, mismo criterio que SMS sin configurar.
 */
export const getWhapiConfig = (): { token: string; apiBase: string } | null => {
  const token = process.env.WHAPI_TOKEN?.trim();
  if (!token) {
    return null;
  }
  const apiBase = process.env.WHAPI_API_BASE?.trim() || 'https://gate.whapi.cloud';
  return { token, apiBase };
};

/**
 * Credenciales de SparkPost (correo via API HTTP). Opcionales: si faltan, el
 * envio cae al SMTP configurado (Nodemailer) como respaldo.
 */
export const getSparkpostConfig = (): { apiKey: string; apiBase: string } | null => {
  const apiKey = process.env.SPARKPOST_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const apiBase = process.env.SPARKPOST_API_BASE?.trim() || 'https://api.sparkpost.com/api/v1';
  return { apiKey, apiBase };
};

/** Remitente de correo (dominio debe estar verificado en SparkPost). */
export const getEmailFrom = (): { email: string; name: string } => {
  const raw = process.env.EMAIL_FROM?.trim() || 'noreply@safedoc.io';
  const match = raw.match(/<([^>]+)>/);
  const email = match ? match[1]!.trim() : raw;
  const name = process.env.EMAIL_FROM_NAME?.trim() || (match ? raw.replace(/<[^>]+>/, '').trim().replace(/"/g, '') : 'SafeDoc');
  return { email, name };
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
