/**
 * Email notification service.
 *
 * Uses Nodemailer with SMTP.  Configure via environment variables:
 *
 *   EMAIL_HOST        SMTP hostname          (e.g. smtp.gmail.com)
 *   EMAIL_PORT        SMTP port              (465 for SSL, 587 for STARTTLS)
 *   EMAIL_SECURE      "true" for port 465    (default false → STARTTLS)
 *   EMAIL_USER        SMTP username / address
 *   EMAIL_PASS        SMTP password / app-password
 *   EMAIL_FROM        Sender address         (default: EMAIL_USER)
 *   EMAIL_FROM_NAME   Sender display name    (default: Effutu Election Monitor)
 *
 * If EMAIL_HOST is not set the service silently logs to console so that the
 * app still works in development without an SMTP server.
 */

import nodemailer, { type Transporter } from 'nodemailer';

// ── Singleton transport ──────────────────────────────────────────────────────

let _transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (_transport) return _transport;

  const host = process.env.EMAIL_HOST;
  if (!host) return null; // not configured — fall back to console logging

  _transport = nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return _transport;
}

// ── Core send helper ─────────────────────────────────────────────────────────

interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: MailOptions): Promise<void> {
  const from = `"${process.env.EMAIL_FROM_NAME ?? 'Effutu Election Monitor'}" <${process.env.EMAIL_FROM ?? process.env.EMAIL_USER ?? 'noreply@effutu.gov.gh'}>`;
  const transport = getTransport();

  if (!transport) {
    // Dev / unconfigured — log to console so developers can see what would be sent
    console.log('[Email] Not configured. Would have sent:');
    console.log(`  To:      ${Array.isArray(opts.to) ? opts.to.join(', ') : opts.to}`);
    console.log(`  Subject: ${opts.subject}`);
    console.log(`  Body:    ${opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
    return;
  }

  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

// ── Branded HTML wrapper ─────────────────────────────────────────────────────

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e3a5f; padding: 24px 32px; }
    .header h1 { margin: 0; color: #fff; font-size: 18px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: #93b7d9; font-size: 13px; }
    .body { padding: 28px 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h2 { margin: 0 0 12px; font-size: 17px; color: #111827; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 600; color: #111827; text-align: right; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-orange { background: #ffedd5; color: #9a3412; }
    .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #1e3a5f; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { background: #f9fafb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f0f0f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Effutu Constituency — Election Monitor</h1>
      <p>Secure field monitoring portal</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">This is an automated notification. Do not reply to this email.</div>
  </div>
</body>
</html>`;
}

// ── Typed notification senders ───────────────────────────────────────────────

/** Notify admin(s) that an agent submitted results for a station. */
export async function sendResultsSubmittedEmail(opts: {
  adminEmail: string | string[];
  agentName: string;
  stationCode: string;
  stationName: string;
  resultType: 'PROVISIONAL' | 'FINAL';
  totalVotes: number;
  electionName: string;
}) {
  const badge =
    opts.resultType === 'FINAL'
      ? `<span class="badge badge-green">FINAL</span>`
      : `<span class="badge badge-orange">PROVISIONAL</span>`;

  await sendEmail({
    to: opts.adminEmail,
    subject: `[${opts.resultType}] Results submitted — ${opts.stationCode}`,
    html: wrapHtml(
      'Results Submitted',
      `<h2>Election results submitted</h2>
      <p>An agent has submitted ${badge} results for the following station:</p>
      <div class="detail-row"><span class="detail-label">Agent</span><span class="detail-value">${opts.agentName}</span></div>
      <div class="detail-row"><span class="detail-label">Station</span><span class="detail-value">${opts.stationCode} — ${opts.stationName}</span></div>
      <div class="detail-row"><span class="detail-label">Election</span><span class="detail-value">${opts.electionName}</span></div>
      <div class="detail-row"><span class="detail-label">Total Votes</span><span class="detail-value">${opts.totalVotes.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Result Type</span><span class="detail-value">${badge}</span></div>`,
    ),
  });
}

/** Send a broadcast message to multiple recipients via email. */
export async function sendBroadcastEmail(opts: {
  recipients: string[];
  senderName: string;
  subject: string;
  message: string;
}) {
  if (opts.recipients.length === 0) return;
  await sendEmail({
    to: opts.recipients,
    subject: `[Broadcast] ${opts.subject}`,
    html: wrapHtml(
      opts.subject,
      `<h2>${opts.subject}</h2>
      <p>${opts.message.replace(/\n/g, '<br>')}</p>
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">Sent by: <strong>${opts.senderName}</strong></p>`,
    ),
    text: `${opts.subject}\n\n${opts.message}\n\nSent by: ${opts.senderName}`,
  });
}

/** Send a password reset link. */
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  await sendEmail({
    to: opts.to,
    subject: 'Reset your password — Effutu Election Monitor',
    html: wrapHtml(
      'Password Reset',
      `<h2>Password reset request</h2>
      <p>Hi <strong>${opts.name}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to continue. This link expires in <strong>1 hour</strong>.</p>
      <a href="${opts.resetUrl}" class="btn">Reset Password</a>
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">If you did not request this, you can safely ignore this email.</p>`,
    ),
    text: `Password reset\n\nHi ${opts.name},\n\nReset your password here (expires in 1 hour):\n${opts.resetUrl}\n\nIf you didn't request this, ignore this email.`,
  });
}
