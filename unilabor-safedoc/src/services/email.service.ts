import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { getEmailFrom, getSparkpostConfig } from '../config/env';
import { recordOutbound } from './outbox.service';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  // secure=true solo para el puerto 465; SparkPost/STARTTLS usan 587 con secure=false.
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587', 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailAttachment {
  filename: string;
  path: string;
  cid?: string;
}

const mimeByExtension = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

interface EmailMeta {
  template?: string;
  assignmentId?: number | null;
  bodyText?: string;
}

const stripHtml = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Entrega un correo por SparkPost (API HTTP) si hay credenciales; en su defecto
 * usa el SMTP configurado (Nodemailer) como respaldo. Las imagenes con `cid`
 * (p. ej. el logo) se mandan como inline_images en la API de SparkPost.
 * Cada intento (exito o fallo) queda registrado en la bandeja de salida.
 */
const deliverEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[] = [],
  meta: EmailMeta = {},
): Promise<void> => {
  try {
    await sendEmailTransport(to, subject, html, attachments);
    await recordOutbound({
      channel: 'email',
      recipient: to,
      subject,
      body: meta.bodyText ?? stripHtml(html).slice(0, 2000),
      template: meta.template ?? 'email',
      assignmentId: meta.assignmentId ?? null,
      status: 'sent',
    });
  } catch (error) {
    await recordOutbound({
      channel: 'email',
      recipient: to,
      subject,
      body: meta.bodyText ?? stripHtml(html).slice(0, 2000),
      template: meta.template ?? 'email',
      assignmentId: meta.assignmentId ?? null,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/** Envio crudo: SparkPost API si hay credenciales; si no, SMTP de respaldo. */
const sendEmailTransport = async (
  to: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[] = [],
): Promise<void> => {
  const sparkpost = getSparkpostConfig();
  const from = getEmailFrom();

  if (sparkpost) {
    const inlineImages: Array<{ type: string; name: string; data: string }> = [];
    const apiAttachments: Array<{ type: string; name: string; data: string }> = [];
    for (const attachment of attachments) {
      const data = fs.readFileSync(attachment.path).toString('base64');
      const item = { type: mimeByExtension(attachment.path), name: attachment.cid || attachment.filename, data };
      (attachment.cid ? inlineImages : apiAttachments).push(item);
    }
    const response = await fetch(`${sparkpost.apiBase}/transmissions`, {
      method: 'POST',
      headers: { Authorization: sparkpost.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          from: { email: from.email, name: from.name },
          subject,
          html,
          ...(inlineImages.length > 0 ? { inline_images: inlineImages } : {}),
          ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
        },
        recipients: [{ address: { email: to } }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`SparkPost HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }
    return;
  }

  await transporter.sendMail({
    from: from.name ? `"${from.name}" <${from.email}>` : from.email,
    to,
    subject,
    html,
    attachments,
  });
};

type CredentialEmailVariant = 'welcome' | 'reset' | 'recovery';

interface CredentialEmailInput {
  email: string;
  name: string;
  tempPass: string;
  variant: CredentialEmailVariant;
}

interface EmailBrandAssets {
  hasLogo: boolean;
  attachments: Array<{ filename: string; path: string; cid: string }>;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const resolveLogoAsset = (): EmailBrandAssets => {
  const logoCandidates = [
    path.resolve(process.cwd(), 'src/assets/unilabor-logo.png'),
    path.resolve(process.cwd(), 'dist/assets/unilabor-logo.png'),
  ];

  const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));

  if (!logoPath) {
    return {
      hasLogo: false,
      attachments: [],
    };
  }

  return {
    hasLogo: true,
    attachments: [
      {
        filename: 'unilabor-logo.png',
        path: logoPath,
        cid: 'unilabor-logo',
      },
    ],
  };
};

const badge = (label: string, background: string, color: string): string => {
  return `
    <span
      style="
        display:inline-block;
        width:22px;
        height:22px;
        border-radius:999px;
        background:${background};
        color:${color};
        font-size:12px;
        font-weight:700;
        line-height:22px;
        text-align:center;
        font-family:Arial, Helvetica, sans-serif;
      "
    >${label}</span>
  `;
};

const buildEmailTemplate = ({ email, name, tempPass, variant }: CredentialEmailInput) => {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeTempPass = escapeHtml(tempPass);
  const currentYear = new Date().getFullYear();

  const assets = resolveLogoAsset();

  const isWelcome = variant === 'welcome';
  const isRecovery = variant === 'recovery';
  const title = isWelcome
    ? 'Bienvenido a SafeDoc'
    : isRecovery
      ? 'Recuperacion de contrasena'
      : 'Restablecimiento de acceso';
  const subtitle = isWelcome
    ? 'Tu cuenta fue creada correctamente por un administrador.'
    : isRecovery
      ? 'Recibimos una solicitud para recuperar tu cuenta.'
      : 'Tu contrasena fue restablecida por un administrador.';

  const intro = isWelcome
    ? 'Usa estas credenciales para iniciar sesion en la plataforma.'
    : 'Usa esta contrasena temporal para volver a entrar a la plataforma.';

  const actionNote = isRecovery
    ? 'Por seguridad, al iniciar sesion sera obligatorio cambiar la contrasena temporal. Si no solicitaste esta recuperacion, contacta al administrador del sistema.'
    : 'Por seguridad, al iniciar sesion sera obligatorio cambiar la contrasena temporal.';

  const subject = isWelcome
    ? 'Tus credenciales de acceso - SafeDoc'
    : isRecovery
      ? 'Recuperacion de contrasena - SafeDoc'
      : 'Restablecimiento de contrasena - SafeDoc';

  const accentColor = isWelcome ? '#2563EB' : isRecovery ? '#0F766E' : '#B45309';
  const accentSoft = isWelcome ? '#DBEAFE' : isRecovery ? '#CCFBF1' : '#FEF3C7';

  const logoSection = assets.hasLogo
    ? `
      <img
        src="cid:unilabor-logo"
        alt="Unilabor"
        style="display:block; max-width:180px; width:180px; height:auto; margin:0 auto 14px auto;"
      />
    `
    : `
      <div style="text-align:center; font-size:22px; font-weight:700; color:#111827; margin-bottom:14px;">
        Unilabor
      </div>
    `;

  const html = `
    <div style="margin:0; padding:24px; background:#F3F4F6;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; margin:0 auto; background:#FFFFFF; border-radius:14px; overflow:hidden; border:1px solid #E5E7EB;">
        <tr>
          <td style="height:8px; background:${accentColor};"></td>
        </tr>

        <tr>
          <td style="padding:28px 28px 8px 28px;">
            ${logoSection}
            <h1 style="margin:0; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:24px; color:#111827;">${title}</h1>
            <p style="margin:8px 0 0 0; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#4B5563;">${subtitle}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 0 28px; font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:15px; line-height:1.6;">
            <p style="margin:0 0 8px 0;">Hola <strong>${safeName}</strong>,</p>
            <p style="margin:0 0 16px 0;">${intro}</p>

            <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px; padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:30px; vertical-align:top;">${badge('U', '#E0E7FF', '#1D4ED8')}</td>
                  <td style="font-size:14px; color:#374151; padding-top:2px;">
                    <strong style="color:#111827;">Usuario:</strong> ${safeEmail}
                  </td>
                </tr>
                <tr><td colspan="2" style="height:10px;"></td></tr>
                <tr>
                  <td style="width:30px; vertical-align:top;">${badge('P', '#FCE7F3', '#BE185D')}</td>
                  <td style="font-size:14px; color:#374151; padding-top:2px;">
                    <strong style="color:#111827;">Contrasena temporal:</strong>
                    <span style="display:inline-block; margin-left:6px; padding:3px 8px; border-radius:8px; background:#111827; color:#FFFFFF; font-family:Consolas, monospace; font-size:13px; letter-spacing:0.2px;">${safeTempPass}</span>
                  </td>
                </tr>
              </table>
            </div>

            <div style="margin-top:14px; background:${accentSoft}; border:1px solid ${accentColor}; border-radius:12px; padding:12px 14px; font-size:13px; color:#374151;">
              <span style="display:inline-block; margin-right:8px;">${badge('!', '#FFFFFF', accentColor)}</span>
              ${actionNote}
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 26px 28px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#6B7280; text-align:center;">
            <p style="margin:0 0 6px 0;">Este es un mensaje automatico. Por favor no respondas este correo.</p>
            <p style="margin:0;">&copy; ${currentYear} Unilabor. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    subject,
    html,
    attachments: assets.attachments,
  };
};

const sendCredentialEmail = async (input: CredentialEmailInput) => {
  const { subject, html, attachments } = buildEmailTemplate(input);
  await deliverEmail(input.email, subject, html, attachments, {
    template: `credential_${input.variant}`,
    bodyText: `Correo de credenciales (${input.variant}) para ${input.name}.`,
  });
};

export interface GenericEmailMeta {
  template?: string;
  assignmentId?: number | null;
  bodyText?: string;
}

/**
 * Envio de correo generico (texto/HTML simple). Reusa el transporter SMTP y el
 * logo de marca. Usado por las notificaciones del modulo de evaluaciones.
 * `meta` alimenta la bandeja de salida (tipo, asignacion y texto plano).
 */
export const sendGenericEmail = async (
  to: string,
  subject: string,
  bodyHtml: string,
  meta: GenericEmailMeta = {},
): Promise<void> => {
  const brand = resolveLogoAsset();
  const logoHtml = brand.hasLogo
    ? '<div style="text-align:center;margin-bottom:16px"><img src="cid:unilabor-logo" alt="Unilabor" style="height:48px"/></div>'
    : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2d3d">${logoHtml}${bodyHtml}<p style="margin-top:24px;font-size:12px;color:#7b8794">SafeDoc - Unilabor</p></div>`;
  await deliverEmail(to, subject, html, brand.attachments, {
    template: meta.template ?? 'generic',
    assignmentId: meta.assignmentId ?? null,
    bodyText: meta.bodyText ?? stripHtml(bodyHtml).slice(0, 2000),
  });
};

export const sendWelcomeEmail = async (email: string, name: string, tempPass: string) => {
  await sendCredentialEmail({
    email,
    name,
    tempPass,
    variant: 'welcome',
  });
};

export const sendPasswordResetEmail = async (email: string, name: string, tempPass: string) => {
  await sendCredentialEmail({
    email,
    name,
    tempPass,
    variant: 'reset',
  });
};

export const sendPasswordRecoveryEmail = async (email: string, name: string, tempPass: string) => {
  await sendCredentialEmail({
    email,
    name,
    tempPass,
    variant: 'recovery',
  });
};
