import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'listening' | 'thinking';

/**
 * Hold the button, ask out loud, let go. The audio goes to the server's
 * speech-to-text endpoint and the words are handed to onQuestion, which sends
 * them to CoTeach the same way a typed question is sent.
 */
export function useHoldToAsk(onQuestion: (text: string) => boolean) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const wantStop = useRef(false);
  const alive = useRef(true);
  const ask = useRef(onQuestion);
  ask.current = onQuestion;

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; release(); };
  }, [release]);

  const finish = useCallback(async (type: string) => {
    const audio = new Blob(chunks.current, { type });
    const heldFor = performance.now() - startedAt.current;
    release();
    if (!alive.current) return;
    if (heldFor < 500 || audio.size < 800) {
      setPhase('idle');
      setNote('Hold the button while you talk, then let go.');
      return;
    }
    setPhase('thinking');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}stt`, {
        method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio,
      });
      const result = await response.json().catch(() => null);
      if (!alive.current) return;
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!response.ok || !result?.ok) setNote(result?.error || 'CoTeach could not hear that. You can type your question.');
      else if (!text) setNote("CoTeach didn't hear any words. Try again, a little closer.");
      else if (ask.current(text)) setNote(`You asked: "${text}"`);
    } catch {
      if (alive.current) setNote('CoTeach could not hear that. You can type your question.');
    } finally {
      if (alive.current) setPhase('idle');
    }
  }, [release]);

  const start = useCallback(async () => {
    if (recorder.current || phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNote('This browser cannot use the microphone. You can type your question.');
      return;
    }
    wantStop.current = false;
    setNote('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || wantStop.current) { media.getTracks().forEach((t) => t.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      rec.onstop = () => { void finish(rec.mimeType || 'audio/webm'); };
      recorder.current = rec;
      startedAt.current = performance.now();
      rec.start();
      setPhase('listening');
    } catch {
      release();
      setNote('The microphone is blocked. Allow it in the address bar, or type your question.');
    }
  }, [finish, phase, release]);

  const stop = useCallback(() => {
    wantStop.current = true;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  return { phase, note, start, stop };
}
