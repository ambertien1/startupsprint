// Voice out: ElevenLabs text-to-speech, cached in memory and served as mp3.
// Owned by the teacher + server half.
import { createHash } from 'node:crypto';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
const TIMEOUT_MS = Number(process.env.VOICE_TIMEOUT_MS) || 6000;
const MAX_CLIPS = 300;

const clips = new Map(); // id -> Buffer (mp3)
const pending = new Map(); // id -> Promise<string|null>

// If the configured voice id is rejected, use the account's first available
// voice instead of going silent. Remembered for the life of the server.
let fallbackVoiceId = null;
async function findAnotherVoice(logger) {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status} listing voices`);
    const data = await response.json();
    const voice = (data?.voices || []).find((v) => v?.voice_id);
    if (!voice) throw new Error('this ElevenLabs account has no voices');
    logger?.warn({ name: voice.name }, 'ELEVENLABS_VOICE_ID was not found; using another voice from the account');
    return voice.voice_id;
  } catch (error) {
    logger?.error({ error: error instanceof Error ? error.message : String(error) }, 'could not find another voice');
    return null;
  }
}

export function hasVoice() {
  return Boolean(process.env.ELEVENLABS_API_KEY && (process.env.ELEVENLABS_VOICE_ID || fallbackVoiceId));
}

function clipId(text) {
  return createHash('sha1').update(`${process.env.ELEVENLABS_VOICE_ID}|${MODEL}|${text}`).digest('hex').slice(0, 20);
}

/** Serve cached clips at <base>audio/<id>.mp3 */
export function mountVoice(app, base) {
  app.get(`${base}audio/:file`, (req, res) => {
    const clip = clips.get(String(req.params.file).replace(/\.mp3$/, ''));
    if (!clip) return res.status(404).type('text').send('Audio not found');
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': clip.length, 'Cache-Control': 'public, max-age=3600' });
    res.send(clip);
  });
}

/**
 * Turn text into speech. Returns a URL path for the mp3, or null when voice
 * is not configured or ElevenLabs can't be reached (callers still send the text).
 * The same line is only generated once.
 */
export async function speak(text, { base = '/', logger } = {}) {
  const line = String(text || '').trim();
  if (!line || !hasVoice()) return null;
  const id = clipId(line);
  const url = `${base}audio/${id}.mp3`;
  if (clips.has(id)) return url;
  if (pending.has(id)) return pending.get(id);

  const job = (async () => {
    const started = Date.now();
    try {
      const request = (voiceId) => fetch(`${API}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: line, model_id: MODEL }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      let response = await request(fallbackVoiceId || process.env.ELEVENLABS_VOICE_ID);
      if (response.status === 404 && !fallbackVoiceId) {
        fallbackVoiceId = await findAnotherVoice(logger);
        if (fallbackVoiceId) response = await request(fallbackVoiceId);
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200);
        throw new Error(`ElevenLabs ${response.status}: ${detail}`);
      }
      const audio = Buffer.from(await response.arrayBuffer());
      if (clips.size >= MAX_CLIPS) clips.delete(clips.keys().next().value);
      clips.set(id, audio);
      logger?.info({ ms: Date.now() - started, bytes: audio.length, chars: line.length }, 'voice');
      return url;
    } catch (error) {
      logger?.error({ ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, 'voice failed');
      return null;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, job);
  return job;
}

/** Test hook: put a clip in the cache without calling ElevenLabs. */
export function _putClip(id, buffer) {
  clips.set(id, buffer);
}
