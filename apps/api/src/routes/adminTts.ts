/**
 * Edge TTS route — converts text to speech using Microsoft Edge's free TTS.
 * POST /admin/tts  { text: string, voice?: string } → audio/mpeg
 * No API key required — uses the msedge-tts package.
 */
import type { FastifyInstance } from 'fastify'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { requireAdmin } from '../auth/requireAdmin'

const DEFAULT_VOICE = 'en-GB-RyanNeural'
const MAX_LENGTH = 2000

const ALLOWED_VOICES = new Set([
  'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-GB-LibbyNeural',
  'en-GB-MaisieNeural', 'en-GB-ThomasNeural',
  'en-US-AvaNeural', 'en-US-AndrewNeural', 'en-US-EmmaNeural',
  'en-US-BrianNeural', 'en-US-AriaNeural', 'en-US-JennyNeural',
  'en-US-GuyNeural', 'en-US-ChristopherNeural', 'en-US-MichelleNeural',
  'en-US-EricNeural', 'en-US-RogerNeural', 'en-US-SteffanNeural',
  'en-AU-NatashaNeural', 'en-AU-WilliamMultilingualNeural',
  'en-IE-ConnorNeural', 'en-IE-EmilyNeural',
])

// Simple in-memory audio cache (key = hash of text+voice)
const audioCache = new Map<string, Buffer>()

export async function adminTtsRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return

    const body = req.body as { text?: string; voice?: string } | undefined
    const text = (body?.text ?? '').trim()
    const voice = (body?.voice ?? '').trim()

    if (!text) {
      return reply.status(400).send({ error: 'No text provided' })
    }
    if (text.length > MAX_LENGTH) {
      return reply.status(400).send({ error: `Text too long (max ${MAX_LENGTH} chars)` })
    }

    const selectedVoice = voice && ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE
    const cacheKey = `${selectedVoice}::${text}`

    // Return cached audio if available
    const cached = audioCache.get(cacheKey)
    if (cached) {
      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('Cache-Control', 'public, max-age=86400')
        .header('Content-Length', String(cached.byteLength))
        .send(cached)
    }

    try {
      const edgeTts = new MsEdgeTTS()
      await edgeTts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)

      const { audioStream } = edgeTts.toStream(text, { rate: '-5%', pitch: '+0Hz' })

      const chunks: Buffer[] = []
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk))
      }
      const audioBuffer = Buffer.concat(chunks)

      edgeTts.close()

      // Cache for future requests
      audioCache.set(cacheKey, audioBuffer)

      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('Cache-Control', 'public, max-age=86400')
        .header('Content-Length', String(audioBuffer.byteLength))
        .send(audioBuffer)
    } catch (err) {
      app.log.error(err, '[TTS] Edge TTS error')
      return reply.status(500).send({ error: 'TTS generation failed' })
    }
  })
}
