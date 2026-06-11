import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import crypto from 'node:crypto'
import { env } from '../env'

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

export function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM)
}

function isSendGridConfigured() {
  return Boolean(env.SENDGRID_API_KEY && env.SMTP_FROM)
}

function isBrevoConfigured() {
  return Boolean(env.BREVO_API_KEY && env.SMTP_FROM)
}

function keyFingerprint(value: string | undefined) {
  if (!value) return 'missing'
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

export function isEmailConfigured() {
  return isBrevoConfigured() || isSendGridConfigured() || isSmtpConfigured()
}

// Reuse a single transporter (connection pool) instead of creating one per email.
let _transporter: Transporter | null = null
function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      pool: true,
      maxConnections: 3,
    })
  }
  return _transporter
}

async function sendViaBrevoHttp(params: { to: string; subject: string; text: string; html?: string }) {
  const apiKey = env.BREVO_API_KEY
  if (!apiKey) throw new Error('Brevo API key is missing')

  const payload: Record<string, unknown> = {
    sender: { email: env.SMTP_FROM },
    to: [{ email: params.to }],
    subject: params.subject,
    textContent: params.text,
  }
  if (params.html) payload.htmlContent = params.html

  console.log(
    '[email] sending via brevo api to=%s subject=%s key=%s from=%s',
    params.to,
    params.subject,
    keyFingerprint(apiKey),
    env.SMTP_FROM,
  )
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo API error ${res.status}: ${body || res.statusText}`)
  }

  console.log('[email] sent ok via brevo api status=%s', res.status)
}

async function sendViaSendGridHttp(params: { to: string; subject: string; text: string; html?: string }) {
  const apiKey = env.SENDGRID_API_KEY
  if (!apiKey) throw new Error('SendGrid API key is missing')

  const content: { type: string; value: string }[] = [{ type: 'text/plain', value: params.text }]
  if (params.html) content.push({ type: 'text/html', value: params.html })

  const payload = {
    personalizations: [{ to: [{ email: params.to }] }],
    from: { email: env.SMTP_FROM },
    subject: params.subject,
    content,
  }

  console.log(
    '[email] sending via sendgrid api to=%s subject=%s key=%s from=%s',
    params.to,
    params.subject,
    keyFingerprint(apiKey),
    env.SMTP_FROM,
  )
  const res = await fetch(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid API error ${res.status}: ${body || res.statusText}`)
  }

  console.log('[email] sent ok via sendgrid api status=%s', res.status)
}

export async function sendTextEmail(params: { to: string; subject: string; text: string; html?: string }) {
  if (!isEmailConfigured()) {
    if (env.NODE_ENV !== 'production') {
      // Dev-friendly: log instead of failing background jobs.
      console.log('[email][dev] to=%s subject=%s\n%s', params.to, params.subject, params.text)
      return
    }
    throw new Error('Email is not configured')
  }

  if (isBrevoConfigured()) {
    try {
      await sendViaBrevoHttp(params)
      return
    } catch (err) {
      console.error('[email] brevo api failed:', err instanceof Error ? err.message : err)
      if (!isSmtpConfigured()) throw err
      console.log('[email] falling back to smtp')
    }
  }

  if (isSendGridConfigured()) {
    try {
      await sendViaSendGridHttp(params)
      return
    } catch (err) {
      console.error('[email] sendgrid api failed:', err instanceof Error ? err.message : err)
      if (!isSmtpConfigured()) throw err
      console.log('[email] falling back to smtp')
    }
  }

  console.log('[email] sending to=%s subject=%s host=%s port=%s', params.to, params.subject, env.SMTP_HOST, env.SMTP_PORT)
  try {
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    })
    console.log('[email] sent ok messageId=%s response=%s', info.messageId, info.response)
  } catch (err) {
    console.error('[email] send failed:', err instanceof Error ? err.message : err)
    throw err
  }
}

function buildOtpEmailHtml(code: string, ttlMins: number): string {
  const base = (env.PORTAL_BASE_URL || '').trim().replace(/\/$/, '')
  const logoUrl = `${base}/New-Mentor-Icon@2x.png`.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Mentor Portal sign-in code</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Poppins,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">

          <!-- Header -->
          <tr>
            <td style="background:#14192d;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center">
              <!-- Logo mark -->
              <img
                src="${logoUrl}"
                width="52"
                height="52"
                alt="Mentor"
                style="display:block;width:52px;height:52px;border-radius:50%;background:#ffffff;border:2.5px solid #e7007e;box-shadow:0 2px 8px rgba(231,0,126,0.2);margin:0 auto 12px;"
              />
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Mentor</p>
              <p style="margin:4px 0 0;font-size:12px;font-weight:400;color:#9ca3af">Customer Portal</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;text-align:center">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#14192d">Your sign-in code</p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280">Use the code below to sign in to your Mentor Portal account.</p>

              <!-- Single copyable code block -->
              <p style="margin:0 auto 28px;display:inline-block;padding:16px 40px;font-size:36px;font-weight:700;letter-spacing:8px;color:#ffffff;background:#e7007e;border-radius:10px;font-family:Courier,monospace">${code}</p>

              <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">This code expires in <strong style="color:#14192d">${ttlMins} minutes</strong>.</p>
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af">Do not share it with anyone.</p>

              <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 20px" />

              <p style="margin:0;font-size:12px;color:#d1d5db">If you didn't request this code, you can safely ignore this email.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#14192d;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center">
              <p style="margin:0;font-size:11px;color:#6b7280">&copy; ${new Date().getFullYear()} Mentor Software. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendLoginCodeEmail(params: { to: string; code: string }) {
  const subject = 'Your Mentor Portal sign-in code'
  const ttl = env.AUTH_CODE_TTL_MINS ?? 10
  const text = `Your Mentor Portal sign-in code is: ${params.code}\n\nThis code expires in ${ttl} minutes. Do not share it with anyone.\n\n-- Mentor Software`
  const html = buildOtpEmailHtml(params.code, ttl)

  await sendTextEmail({ to: params.to, subject, text, html })
}
