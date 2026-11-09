// =============================================================================
// Mail transport for the authentication module
// =============================================================================
// Password recovery needs to deliver a reset link. This module wraps nodemailer
// and supports two modes, chosen automatically from the environment:
//
//   1. SMTP configured  (SMTP_HOST set)
//        -> real delivery through your provider (Gmail, Mailtrap, SES, ...).
//
//   2. No SMTP configured
//        -> "console" transport: the message is written to the server log
//           instead of being sent. This keeps local development working without
//           credentials, and it NEVER pretends an email was delivered - the
//           caller can check `isMailerConfigured()` and the API reports the
//           truth in its response.
//
// Security: the reset token is only ever written to the log in development
// mode. Set NODE_ENV=production and configure SMTP_HOST before going live, or
// the reset links will simply not reach your users.
// =============================================================================
import "dotenv/config";
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";

const MAIL_FROM =
  process.env.MAIL_FROM?.trim() || "Online Marketplace <no-reply@localhost>";
const APP_NAME = process.env.APP_NAME?.trim() || "Online Marketplace";

/** True when a real SMTP server is configured. */
export function isMailerConfigured() {
  return Boolean(SMTP_HOST);
}

/** True when running outside production (used to decide on token logging). */
export function isDevelopment() {
  return (process.env.NODE_ENV || "development") !== "production";
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (isMailerConfigured()) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, // true for 465, false for 587/STARTTLS
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    return transporter;
  }

  // Development fallback: nothing leaves the machine.
  transporter = nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

/**
 * Send an email.
 * @returns {Promise<{ delivered: boolean, transport: string, preview?: string }>}
 *   `delivered` is false when there is no SMTP host - the caller must not claim
 *   an email was sent in that case.
 */
export async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  if (!isMailerConfigured()) {
    // jsonTransport: show what *would* have been sent so a developer can copy
    // the reset link out of the terminal.
    console.log(
      `\n[mailer] SMTP_HOST is not configured - email NOT delivered.` +
        `\n[mailer] to: ${to}\n[mailer] subject: ${subject}\n[mailer] body:\n${text}\n`,
    );
    return { delivered: false, transport: "console", preview: info.message };
  }

  return { delivered: true, transport: "smtp", messageId: info.messageId };
}

/** Branded password-reset email. */
export function buildPasswordResetEmail({ name, resetUrl, expiresMinutes }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = [
    greeting,
    "",
    `We received a request to reset your ${APP_NAME} password.`,
    "Open the link below to choose a new password:",
    "",
    resetUrl,
    "",
    `This link expires in ${expiresMinutes} minutes and can only be used once.`,
    "If you did not request a password reset you can safely ignore this email -",
    "your password will not change.",
    "",
    `- ${APP_NAME}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2933">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(16,24,40,.08)">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:20px">Reset your password</h1>
          <p style="margin:0 0 20px;line-height:1.6;color:#52606d">${greeting} we received a request to reset your ${APP_NAME} password.</p>
          <p style="margin:0 0 24px">
            <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600">Choose a new password</a>
          </p>
          <p style="margin:0 0 6px;font-size:13px;color:#7b8794;line-height:1.6">This link expires in ${expiresMinutes} minutes and can only be used once.</p>
          <p style="margin:0;font-size:13px;color:#7b8794;line-height:1.6">If you did not request this, you can ignore this email - your password will not change.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

export default { sendMail, isMailerConfigured, isDevelopment, buildPasswordResetEmail };
