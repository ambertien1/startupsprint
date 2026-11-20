// Speech to text: the page records audio, posts it here, gets the words back.
// Used by the teacher mic and the student's spoken question.
// Owned by the teacher + server half.
import express from 'express';

const API = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';
const TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS) || 15000;

/**
 * POST <base>stt with the recorded audio as the raw body
 * (Content-Type: audio/webm, audio/mp4, audio/wav ...).
 * Replies { ok: true, text } or { ok: false, error }.
 */
export function mountStt(app, base, logger, { fetchImpl = fetch } = {}) {
  app.post(`${base}stt`, express.raw({ type: ['audio/*', 'video/webm', 'application/octet-stream'], limit: '12mb' }), async (req, res) => {
    const started = Date.now();
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Voice input is not set up. Type instead.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length < 200) {
      return res.status(400).json({ ok: false, error: 'No audio was recorded. Hold the button while you talk.' });
    }
    try {
      const type = String(req.headers['content-type'] || 'audio/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'mp4' : type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('model_id', MODEL);
      // Without these, short clips can come back in another language, or as
      // sound labels like "(background noise)" instead of words.
      form.append('language_code', process.env.STT_LANGUAGE || 'en');
      form.append('tag_audio_events', 'false');
      form.append('diarize', 'false');
      form.append('file', new Blob([req.body], { type }), `speech.${ext}`);
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200);
        throw new Error(`ElevenLabs ${response.status}: ${detail}`);
      }
      const data = await response.json();
      // Drop any leftover sound labels, e.g. "(music)" or "[silence]".
      const text = String(data?.text || '').replace(/[\[(][^\])]{0,40}[\])]/g, ' ').replace(/\s+/g, ' ').trim();
      logger?.info({ ms: Date.now() - started, bytes: req.body.length, chars: text.length }, 'stt');
      // Silence is normal while the teacher pauses: not an error, just no words.
      res.json({ ok: true, text });
    } catch (error) {
      logger?.error({ ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, 'stt failed');
      res.status(502).json({ ok: false, error: "Couldn't turn that into words. Try again, or type it." });
    }
  });
}
