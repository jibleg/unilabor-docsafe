import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

  await transporter.sendMail({
    from: '"SafeDoc Admin" <noreply@safedoc.io>',
    to: input.email,
    subject,
    html,
    attachments,
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
