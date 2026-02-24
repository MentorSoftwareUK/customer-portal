/**
 * Branded HTML email templates for Mentor event emails.
 *
 * Design: white card on light bg, pink/navy brand colours, matching the
 * Mentor brand but with a cleaner, more modern layout than previous designs.
 */

// ─── Shared helpers ──────────────────────────────────────────────────────────

function googleCalendarUrl(params: {
  title: string
  startAt: string
  durationMins: number
  joinUrl?: string | null
  description?: string
}) {
  try {
    const start = new Date(params.startAt)
    if (Number.isNaN(start.getTime())) return null
    const end = new Date(start.getTime() + params.durationMins * 60_000)
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: params.title,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: params.description || params.title,
      ...(params.joinUrl ? { location: params.joinUrl } : {}),
    })
    return `https://calendar.google.com/calendar/render?${q.toString()}`
  } catch {
    return null
  }
}

function wrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Mentor</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        ${content}
        ${footer()}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

function brandedHeader(params: { eventTitle: string; hostName?: string | null }) {
  const subtitle = params.hostName
    ? `Exclusive webinar with ${params.hostName}`
    : 'Mentor Webinar'

  return `
        <!-- header -->
        <tr>
          <td style="padding:0;background:#ffffff;position:relative;">
            <!-- top accent bar -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:linear-gradient(135deg,#e7007e 0%,#a0005a 100%);height:6px;line-height:6px;font-size:1px;">&nbsp;</td>
              </tr>
            </table>
            <!-- decorative circles + logo row -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- left circles -->
                <td width="72" style="vertical-align:top;padding:0;overflow:hidden;">
                  <div style="width:72px;height:120px;position:relative;overflow:hidden;">
                    <div style="position:absolute;top:-16px;left:-24px;width:88px;height:88px;border-radius:50%;background:#e7007e;opacity:0.85;"></div>
                    <div style="position:absolute;top:56px;left:-32px;width:80px;height:80px;border-radius:50%;background:#3a2b7a;opacity:0.8;"></div>
                  </div>
                </td>
                <!-- logo + title -->
                <td style="text-align:center;padding:20px 0 24px;">
                  <!-- Mentor M badge -->
                  <table cellpadding="0" cellspacing="0" border="0" align="center">
                    <tr>
                      <td align="center">
                        <div style="display:inline-block;width:52px;height:52px;border-radius:50%;background:#ffffff;border:2.5px solid #e7007e;text-align:center;line-height:52px;box-shadow:0 2px 8px rgba(231,0,126,0.2);">
                          <span style="color:#e7007e;font-size:22px;font-weight:900;font-family:'Segoe UI',Arial,sans-serif;">M</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top:2px;">
                        <span style="color:#3a2b7a;font-size:11px;font-weight:700;letter-spacing:1.5px;font-family:'Segoe UI',Arial,sans-serif;text-transform:uppercase;">Mentor</span>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top:14px;">
                        <span style="color:#1a1f3c;font-size:22px;font-weight:800;font-family:'Segoe UI',Arial,sans-serif;line-height:1.2;">${escHtml(params.eventTitle)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top:4px;">
                        <span style="color:#e7007e;font-size:13px;font-style:italic;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(subtitle)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- right circles -->
                <td width="72" style="vertical-align:top;padding:0;overflow:hidden;">
                  <div style="width:72px;height:120px;position:relative;overflow:hidden;">
                    <div style="position:absolute;top:-16px;right:-24px;width:88px;height:88px;border-radius:50%;background:#3a2b7a;opacity:0.8;left:auto;"></div>
                    <div style="position:absolute;top:56px;right:-32px;width:80px;height:80px;border-radius:50%;background:#e7007e;opacity:0.85;left:auto;"></div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
}

function footer() {
  return `
        <!-- footer wave + sign-off -->
        <tr>
          <td style="padding:0;background:#ffffff;">
            <!-- wave -->
            <div style="height:48px;overflow:hidden;line-height:0;font-size:0;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 48" width="600" height="48" preserveAspectRatio="none" style="display:block;">
                <path d="M0,24 C150,48 450,0 600,24 L600,48 L0,48 Z" fill="#e7007e"/>
              </svg>
            </div>
            <div style="background:#e7007e;padding:16px 32px 24px;text-align:center;">
              <span style="color:#ffffff;font-size:16px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;letter-spacing:0.3px;">The Mentor Software Team</span>
            </div>
          </td>
        </tr>`
}

function detailsBlock(params: {
  date: string
  time?: string
  host?: string | null
  hostTitle?: string | null
}) {
  const rows: string[] = []
  if (params.date) rows.push(detailRow('Date', params.date))
  if (params.time) rows.push(detailRow('Time', params.time))
  if (params.host) {
    const hostFull = params.hostTitle ? `${params.host}, ${params.hostTitle}` : params.host
    rows.push(detailRow('Host', hostFull))
  }
  if (!rows.length) return ''
  return `
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border-left:3px solid #e7007e;background:#fdf0f7;border-radius:0 8px 8px 0;">
              <tr><td style="padding:14px 20px;">${rows.join('')}</td></tr>
            </table>`
}

function detailRow(label: string, value: string) {
  return `<div style="margin:4px 0;"><span style="color:#1a1f3c;font-size:14px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;">${label}:</span> <span style="color:#3d4a66;font-size:14px;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(value)}</span></div>`
}

function ctaButton(label: string, url: string) {
  return `
            <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;">
              <tr>
                <td align="center" style="border-radius:8px;background:#e7007e;">
                  <a href="${escAttr(url)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:'Segoe UI',Arial,sans-serif;border-radius:8px;letter-spacing:0.2px;">${escHtml(label)}</a>
                </td>
              </tr>
            </table>`
}

function joinLink(url: string) {
  return `<p style="margin:16px 0;font-size:14px;font-family:'Segoe UI',Arial,sans-serif;color:#3d4a66;"><a href="${escAttr(url)}" target="_blank" style="color:#0d7a8e;font-weight:600;">Join the session by clicking here</a></p>`
}

function bodyCell(content: string) {
  return `
        <!-- body -->
        <tr>
          <td style="padding:32px 40px 8px;">
            ${content}
          </td>
        </tr>`
}

function p(text: string) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3d4a66;font-family:'Segoe UI',Arial,sans-serif;">${text}</p>`
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function formatEventTime(startAt: string): string {
  try {
    const d = new Date(startAt)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) + 'am – ' +
      new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function formatEventDate(startAt: string): string {
  try {
    const d = new Date(startAt)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

function formatTimeRange(startAt: string, durationMins: number): string {
  try {
    const start = new Date(startAt)
    if (Number.isNaN(start.getTime())) return ''
    const end = new Date(start.getTime() + durationMins * 60_000)
    const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) + (d.getHours() < 12 ? 'am' : 'pm')
    return `${fmt(start)} – ${fmt(end)}`
  } catch {
    return ''
  }
}

// ─── Template builders ────────────────────────────────────────────────────────

export type ConfirmationParams = {
  recipientName: string
  eventTitle: string
  startAt: string
  durationMins: number
  hostName?: string | null
  hostTitle?: string | null
  joinUrl?: string | null
}

export function buildConfirmationHtml(params: ConfirmationParams): string {
  const calUrl = googleCalendarUrl({
    title: params.eventTitle,
    startAt: params.startAt,
    durationMins: params.durationMins,
    joinUrl: params.joinUrl,
  })

  const greeting = params.recipientName ? `Hi ${escHtml(params.recipientName)},` : 'Hi,'

  const content = `
        ${brandedHeader({ eventTitle: params.eventTitle, hostName: params.hostName })}
        ${bodyCell(`
          ${p(greeting)}
          ${p('Thank you for registering for our upcoming Mentor Webinar.')}
          ${detailsBlock({
            date: formatEventDate(params.startAt),
            time: formatTimeRange(params.startAt, params.durationMins),
            host: params.hostName,
            hostTitle: params.hostTitle,
          })}
          ${params.joinUrl ? joinLink(params.joinUrl) : ''}
          ${p('To make things easier, click below to add the webinar to your calendar.')}
          ${calUrl ? ctaButton('Add to Calendar', calUrl) : ''}
          ${p("If you're not able to attend live, don't worry. We'll share the recording and presentation slides with you after the webinar.")}
          ${p('<strong style="color:#1a1f3c;">We look forward to seeing you there!</strong>')}
        `)}`

  return wrapper(content)
}

export type ReminderParams = {
  recipientName: string
  eventTitle: string
  startAt: string
  durationMins: number
  hostName?: string | null
  hostTitle?: string | null
  joinUrl?: string | null
  description?: string | null
}

export function buildReminderHtml(params: ReminderParams): string {
  const calUrl = googleCalendarUrl({
    title: params.eventTitle,
    startAt: params.startAt,
    durationMins: params.durationMins,
    joinUrl: params.joinUrl,
    description: params.description ?? undefined,
  })

  const greeting = params.recipientName ? `Hi ${escHtml(params.recipientName)},` : 'Hi,'
  const hostBold = params.hostName ? `<strong style="color:#1a1f3c;">${escHtml(params.eventTitle)}</strong>` : `<strong style="color:#1a1f3c;">${escHtml(params.eventTitle)}</strong>`

  const content = bodyCell(`
    ${p(greeting)}
    ${p(`Just a quick reminder about our upcoming ${hostBold} webinar${params.hostName ? ` with ${escHtml(params.hostName)}` : ''}.`)}
    ${params.description ? p(escHtml(params.description)) : ''}
    ${p('We hope you can join us.')}
    ${detailsBlock({
      date: formatEventDate(params.startAt),
      time: formatTimeRange(params.startAt, params.durationMins),
      host: params.hostName,
      hostTitle: params.hostTitle,
    })}
    ${params.joinUrl ? `<p style="margin:16px 0 24px;font-size:14px;font-family:'Segoe UI',Arial,sans-serif;color:#3d4a66;"><a href="${escAttr(params.joinUrl)}" target="_blank" style="color:#0d7a8e;font-weight:600;">Here's the link to join the session.</a></p>` : ''}
    ${calUrl ? p("In case you missed it, click below to add the webinar to your calendar.") : ''}
    ${calUrl ? ctaButton('Add to Calendar', calUrl) : ''}
    ${p("We'll share the recording and presentation slides with you after the webinar. We look forward to seeing you there!")}
  `)

  return wrapper(content)
}

export type ThankYouParams = {
  recipientName: string
  eventTitle: string
  startAt: string
  durationMins: number
  hostName?: string | null
  hostTitle?: string | null
  webinarRecordingUrl?: string | null
  webinarSlides?: Array<{ label?: string; url: string }> | null
  blogPostUrl?: string | null
}

export function buildThankYouHtml(params: ThankYouParams): string {
  const greeting = params.recipientName ? `Hi ${escHtml(params.recipientName)},` : 'Hi,'

  const hasRecording = Boolean(params.webinarRecordingUrl)
  const hasSlides = Boolean(params.webinarSlides?.length)
  const hasBlog = Boolean(params.blogPostUrl)
  const hasResources = hasRecording || hasSlides || hasBlog

  const resourceItems: string[] = []
  if (hasRecording && params.webinarRecordingUrl) {
    resourceItems.push(`<li style="margin:8px 0;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;color:#3d4a66;"><a href="${escAttr(params.webinarRecordingUrl)}" target="_blank" style="color:#0d7a8e;font-weight:600;">Watch the recording here</a></li>`)
  }
  if (hasSlides && params.webinarSlides?.[0]) {
    resourceItems.push(`<li style="margin:8px 0;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;color:#3d4a66;"><a href="${escAttr(params.webinarSlides[0].url)}" target="_blank" style="color:#0d7a8e;font-weight:600;">Download the slides here</a></li>`)
  }
  if (hasBlog && params.blogPostUrl) {
    resourceItems.push(`<li style="margin:8px 0;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;color:#3d4a66;"><a href="${escAttr(params.blogPostUrl)}" target="_blank" style="color:#0d7a8e;font-weight:600;">Read the key summary blog here</a></li>`)
  }

  const content = `
        ${brandedHeader({ eventTitle: params.eventTitle, hostName: params.hostName })}
        ${bodyCell(`
          ${p(greeting)}
          ${p('Thank you for joining our exclusive Mentor customer webinar.')}
          ${p(`<em>"${escHtml(params.eventTitle)}"</em>`)}
          ${hasResources ? p("If you couldn't attend live, or want to revisit the session, you can now:") : ''}
          ${hasResources ? `<ul style="margin:8px 0 20px 0;padding-left:20px;">${resourceItems.join('')}</ul>` : ''}
          ${p('<strong style="color:#1a1f3c;">Key Takeaways:</strong>')}
          <div style="height:16px;"></div>
          ${p('If you have any questions or would like further support, our team is always here to help.')}
        `)}`

  return wrapper(content)
}

// ─── Invite / Promotional email ───────────────────────────────────────────────

export function buildInviteHtml(params: {
  recipientName?: string | null
  eventTitle: string
  startAt: string
  durationMins: number
  description?: string | null
  hostName?: string | null
  hostTitle?: string | null
  registerUrl: string
}): string {
  const greeting = params.recipientName ? `Hi ${escHtml(params.recipientName)},` : 'Hi,'
  const dateStr = formatEventDate(params.startAt)
  const timeStr = formatTimeRange(params.startAt, params.durationMins)

  const metaRows: string[] = []
  if (dateStr) {
    metaRows.push(`
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7a99;font-family:'Segoe UI',Arial,sans-serif;white-space:nowrap;">&#128197;&nbsp; Date</td>
        <td style="padding:6px 0 6px 16px;font-size:14px;font-weight:600;color:#1a1f3c;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(dateStr)}</td>
      </tr>`)
  }
  if (timeStr) {
    metaRows.push(`
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7a99;font-family:'Segoe UI',Arial,sans-serif;white-space:nowrap;">&#128336;&nbsp; Time</td>
        <td style="padding:6px 0 6px 16px;font-size:14px;font-weight:600;color:#1a1f3c;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(timeStr)}</td>
      </tr>`)
  }
  if (params.hostName) {
    const hostLabel = params.hostTitle ? `${params.hostName}, ${params.hostTitle}` : params.hostName
    metaRows.push(`
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7a99;font-family:'Segoe UI',Arial,sans-serif;white-space:nowrap;">&#127891;&nbsp; Host</td>
        <td style="padding:6px 0 6px 16px;font-size:14px;font-weight:600;color:#1a1f3c;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(hostLabel)}</td>
      </tr>`)
  }

  const content = `
        ${brandedHeader({ eventTitle: params.eventTitle, hostName: params.hostName })}
        ${bodyCell(`
          ${p(greeting)}
          ${p(`We'd like to invite you to our upcoming exclusive webinar: <strong style="color:#1a1f3c;">${escHtml(params.eventTitle)}</strong>`)}
          ${metaRows.length ? `
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
            ${metaRows.join('')}
          </table>` : ''}
          ${params.description ? p(escHtml(params.description)) : ''}
          ${p('This is an exclusive session for Mentor customers. Spaces are limited — secure your spot today.')}
          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
            <tr>
              <td align="left">
                <a href="${escAttr(params.registerUrl)}"
                   target="_blank"
                   style="display:inline-block;background:linear-gradient(135deg,#e7007e 0%,#a0005a 100%);color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                  Register Now &rarr;
                </a>
              </td>
            </tr>
          </table>
          ${p('We look forward to seeing you there!')}
        `)}`

  return wrapper(content)
}
