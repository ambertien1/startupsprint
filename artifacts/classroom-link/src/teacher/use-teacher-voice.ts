import { useEffect, useRef, useState } from 'react';
import type { TeacherVoice } from './types';

type AudioPiece = { recorder: MediaRecorder; startedAt: number; endedAt?: number; chunks: Blob[]; flush: boolean };
type Session = {
  running: boolean;
  paused: boolean;
  cancelled: boolean;
  startedAt: number;
  captureStartedAt: number;
  recordedMs: number;
  stream?: MediaStream;
  piece?: AudioPiece;
  rotation?: number;
  limit?: number;
  ticker?: number;
};

export function useTeacherVoice(onTranscript: (text: string) => Promise<boolean>): TeacherVoice {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<TeacherVoice['phase']>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(0);
  const [processing, setProcessing] = useState<TeacherVoice['processing']>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const current = useRef<Session | null>(null);
  const alive = useRef(false);
  const queue = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const releaseTracks = (session: Session) => {
    session.stream?.getTracks().forEach(track => track.stop());
    if (alive.current) setStream(previous => previous === session.stream ? null : previous);
  };
  const clearTimers = (session: Session) => {
    window.clearInterval(session.rotation);
    window.clearInterval(session.ticker);
    window.clearTimeout(session.limit);
  };
  const captureTime = (session: Session) => session.recordedMs + (session.running ? performance.now() - session.captureStartedAt : 0);

  function enqueue(audio: Blob) {
    pendingRef.current += 1;
    setPending(pendingRef.current);
    // Complete, independently decodable clips are transcribed and sent in order.
    queue.current = queue.current.then(async () => {
      let timeout: number | undefined;
      const controller = new AbortController();
      try {
        if (!alive.current) return;
        controllers.current.add(controller);
        setProcessing('transcribing');
        timeout = window.setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${import.meta.env.BASE_URL}stt`, {
          method: 'POST', headers: { 'Content-Type': audio.type }, body: audio, signal: controller.signal,
        });
        const result = await response.json().catch(() => null);
        window.clearTimeout(timeout);
        if (!alive.current) return;
        if (!response.ok || !result?.ok) {
          setError(typeof result?.error === 'string' && result.error.trim()
            ? result.error : 'Speech-to-text is unavailable right now. Please type your message.');
        } else if (typeof result.text !== 'string' || !result.text.trim()) {
          setError('No words were heard in this part. You can keep talking or type instead.');
        } else {
          setProcessing('sending');
          if (!await onTranscriptRef.current(result.text.trim()) && alive.current) {
            setError('Your unsent words are in the text box. Choose Type instead to review and send them.');
          }
        }
      } catch {
        if (alive.current) setError(controller.signal.aborted
          ? 'Turning speech into words took too long. Please try again, or type instead.'
          : 'Could not turn speech into words. Check your connection or type instead.');
      } finally {
        window.clearTimeout(timeout);
        controllers.current.delete(controller);
        pendingRef.current -= 1;
        if (alive.current) { setPending(pendingRef.current); setProcessing(null); }
      }
    });
  }

  function stop(message = '') {
    const session = current.current;
    if (!session) return;
    const wasRunning = session.running;
    if (wasRunning && session.stream) session.recordedMs = captureTime(session);
    session.running = false;
    session.paused = false;
    clearTimers(session);
    if (message) setNote(message);
    const piece = session.piece;
    if (piece && piece.recorder.state !== 'inactive') {
      setPhase('finishing');
      piece.endedAt = performance.now();
      piece.recorder.stop();
    } else { current.current = null; setPhase('idle'); }
    releaseTracks(session);
  }

  function pause() {
    const session = current.current;
    if (!session?.running || !session.stream || !session.piece) return;
    session.recordedMs = captureTime(session);
    session.running = false;
    session.paused = true;
    clearTimers(session);
    setElapsed(Math.min(300, Math.floor(session.recordedMs / 1000)));
    setPhase('paused');
    setNote('Paused. Resume when you’re ready.');
    if (session.piece.recorder.state !== 'inactive') {
      // Pauses are deliberate clip boundaries, including a short first utterance.
      session.piece.flush = true;
      session.piece.endedAt = performance.now();
      session.piece.recorder.stop();
    }
    releaseTracks(session);
  }

  function startPiece(session: Session, resumed = false) {
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(type => MediaRecorder.isTypeSupported?.(type));
    const recorder = new MediaRecorder(session.stream!, mimeType ? { mimeType } : undefined);
    const piece: AudioPiece = { recorder, chunks: [], startedAt: performance.now(), flush: resumed };
    session.piece = piece;
    recorder.ondataavailable = event => { if (event.data.size) piece.chunks.push(event.data); };
    recorder.onstop = () => {
      if (!alive.current || session.cancelled) return;
      if (session.running && session.piece === piece && piece.endedAt === undefined) {
        stop();
        setError('The microphone stopped recording. Please try again, or type instead.');
      }
      const duration = (piece.endedAt ?? performance.now()) - piece.startedAt;
      const type = recorder.mimeType || piece.chunks[0]?.type;
      const useful = piece.flush || duration >= 500 || piece.startedAt - session.startedAt >= 500;
      if (useful && type && piece.chunks.length) enqueue(new Blob(piece.chunks, { type }));
      else if (useful) setError('No audio was recorded in this part. Please try again, or type instead.');
      else if (!session.running) setNote('Recording was very short. Start the microphone and speak for a moment.');
      if (!session.running && !session.paused && current.current === session) {
        current.current = null; setPhase('idle');
      }
    };
    recorder.onerror = () => {
      if (!alive.current || current.current !== session) return;
      session.cancelled = true;
      stop(); current.current = null; setPhase('idle');
      setError('The microphone stopped recording. Please try again, or type instead.');
    };
    recorder.start();
  }

  async function capture(session: Session, resuming: boolean) {
    session.running = true;
    session.paused = false;
    setPhase('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || current.current !== session || !session.running) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      session.stream = stream;
      session.captureStartedAt = performance.now();
      if (!resuming) session.startedAt = session.captureStartedAt;
      startPiece(session, resuming);
      setStream(stream);
      setPhase('recording');
      session.ticker = window.setInterval(() => {
        if (alive.current) setElapsed(Math.min(300, Math.floor(captureTime(session) / 1000)));
      }, 1000);
      session.limit = window.setTimeout(() => stop('Recording stopped after 5 minutes.'), Math.max(0, 300000 - session.recordedMs));
      session.rotation = window.setInterval(() => {
        if (!session.running) return;
        if (captureTime(session) >= 300000) { stop('Recording stopped after 5 minutes.'); return; }
        try {
          if (session.piece && session.piece.recorder.state !== 'inactive') {
            session.piece.endedAt = performance.now();
            session.piece.recorder.stop();
          }
          startPiece(session);
        } catch {
          stop();
          setError('The microphone could not keep recording. Please try again, or type instead.');
        }
      }, 12000);
    } catch (cause) {
      if (!alive.current || current.current !== session) return;
      releaseTracks(session); clearTimers(session);
      session.running = false;
      session.paused = resuming;
      if (resuming) setPhase('paused');
      else { session.cancelled = true; current.current = null; setPhase('idle'); }
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone access was not allowed. Allow it in your browser, or type instead.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect a microphone, or type instead.'
          : 'Could not start the microphone. Please try again, or type instead.');
    }
  }

  async function start() {
    if (current.current || pendingRef.current) return;
    setError(''); setNote(''); setElapsed(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not available in this browser. Please type instead.');
      return;
    }
    const session: Session = { running: true, paused: false, cancelled: false, startedAt: 0, captureStartedAt: 0, recordedMs: 0 };
    current.current = session;
    await capture(session, false);
  }

  async function resume() {
    const session = current.current;
    if (!session?.paused) return;
    setError(''); setNote('');
    await capture(session, true);
  }

  useEffect(() => {
    alive.current = true;
    const onVisibility = () => { if (document.hidden) stop('Recording stopped because this tab was hidden.'); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      controllers.current.forEach(controller => controller.abort());
      const session = current.current;
      current.current = null;
      if (session) {
        session.cancelled = true; session.running = false; clearTimers(session);
        if (session.piece && session.piece.recorder.state !== 'inactive') session.piece.recorder.stop();
        releaseTracks(session);
      }
    };
  }, []);

  return { stream, phase, elapsed, pending, processing, error, note, start, stop, pause, resume };
}
