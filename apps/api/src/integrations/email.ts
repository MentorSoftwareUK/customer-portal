import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { env } from '../env'

export function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM)
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

export async function sendTextEmail(params: { to: string; subject: string; text: string }) {
  if (!isSmtpConfigured()) {
    if (env.NODE_ENV !== 'production') {
      // Dev-friendly: log instead of failing background jobs.
      console.log('[email][dev] to=%s subject=%s\n%s', params.to, params.subject, params.text)
      return
    }
    throw new Error('SMTP is not configured')
  }

  console.log('[email] sending to=%s subject=%s host=%s port=%s', params.to, params.subject, env.SMTP_HOST, env.SMTP_PORT)
  try {
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
    })
    console.log('[email] sent ok messageId=%s response=%s', info.messageId, info.response)
  } catch (err) {
    console.error('[email] send failed:', err instanceof Error ? err.message : err)
    throw err
  }
}

export async function sendLoginCodeEmail(params: { to: string; code: string }) {
  const subject = 'Your Mentor Portal sign-in code'

  const text = `Your sign-in code is: ${params.code}\n\nThis code expires in ${env.AUTH_CODE_TTL_MINS} minutes.`

  await sendTextEmail({ to: params.to, subject, text })
}
