import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CACHE_DIR = path.join(__dirname, '../../.tts-cache')

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const adminTtsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.post<{
    Body: { text: string; key?: string }
  }>('/', async (req, reply) => {
    const { text, key: clientKey } = req.body ?? ({} as any)

    if (!text || typeof text !== 'string' || text.length > 1000) {
      return reply.status(400).send({ error: 'Invalid text (max 1000 chars)' })
    }

    const region = env.AZURE_TTS_REGION ?? 'uksouth'
    const apiKey = env.AZURE_TTS_KEY

    if (!apiKey) {
      return reply.status(501).send({ error: 'Azure TTS not configured' })
    }

    ensureCacheDir()
    const cacheKey =
      clientKey ?? crypto.createHash('md5').update(text).digest('hex')
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.mp3`)

    // Return cached audio
    if (fs.existsSync(cachePath)) {
      const buf = fs.readFileSync(cachePath)
      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('X-TTS-Cached', 'true')
        .send(buf)
    }

    // Synthesise via Azure 
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">
  <voice name="en-GB-SoniaNeural">
    <prosody rate="5%" pitch="0%">${escapeXml(text)}</prosody>
  </voice>
</speak>`

    const ttsRes = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        },
        body: ssml,
      },
    )

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => 'unknown')
      req.log.error({ status: ttsRes.status, errText }, 'Azure TTS synthesis failed')
      return reply.status(502).send({ error: 'TTS synthesis failed' })
    }

    const buffer = Buffer.from(await ttsRes.arrayBuffer())
    fs.writeFileSync(cachePath, buffer)

    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('X-TTS-Cached', 'false')
      .send(buffer)
  })
}
