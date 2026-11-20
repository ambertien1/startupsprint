import { useCallback, useEffect, useRef, useState } from 'react';
import type { FadeMessage } from './lesson';

type Clip = { text: string; audioUrl?: string | null };

// CoTeach AI's lines play one after another, never on top of each other and never
// cutting each other off: "here are your steps" is followed by the server's
// "Hi Maya! First, …" instead of being interrupted by it. Each line uses the
// server's ElevenLabs clip when there is one, else the browser's own voice.
// Browsers only allow sound after the student has clicked the page once, so
// lines that arrive before that wait (the newest few) and play on that click.
export function useStudentVoice(message: FadeMessage) {
  const messageRef = useRef(message);
  messageRef.current = message;
  const unlockedRef = useRef(false);
  const [unlocked, setUnlocked] = useState(false);
  const queue = useRef<Clip[]>([]);
  const busy = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Chrome can stop speaking if the utterance loses its JavaScript reference.
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0);
  const suppressedRef = useRef(false);
  const [questionNote, setQuestionNote] = useState('');
  const questionInputRef = useRef<HTMLInputElement>(null);

  const stopCurrent = useCallback(() => {
    ++token.current;
    if (watchdog.current !== null) clearTimeout(watchdog.current);
    watchdog.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
    }
    audio.current = null;
    utterance.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    busy.current = false;
  }, []);

  const next = useCallback(() => {
    if (busy.current || !unlockedRef.current || suppressedRef.current) return;
    const clip = queue.current.shift();
    if (!clip) return;
    busy.current = true;
    const mine = ++token.current;
    const done = (why: string) => {
      if (mine !== token.current) return;
      if (watchdog.current !== null) clearTimeout(watchdog.current);
      watchdog.current = null;
      if (why === 'watchdog') {
        // Never let a stuck line overlap the next one.
        audio.current?.pause();
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      }
      audio.current = null;
      utterance.current = null;
      busy.current = false;
      console.info('[Fade speech] Finished line', { why });
      // A short gap between lines sounds more natural and lets Chrome settle.
      setTimeout(() => next(), 250);
    };
    // If the browser never reports the end of a line, move on anyway.
    watchdog.current = setTimeout(() => done('watchdog'), 4000 + clip.text.length * 90);

    const speakWithBrowser = () => {
      if (mine !== token.current) return;
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        console.info('[Fade speech] Browser speech is unavailable');
        done('no-speech');
        return;
      }
      const line = new SpeechSynthesisUtterance(clip.text);
      utterance.current = line;
      line.rate = 0.9;
      line.onstart = () => console.info('[Fade speech] Utterance started');
      line.onend = () => done('spoken');
      line.onerror = (event) => {
        console.warn('[Fade speech] Utterance error', { error: event.error });
        done('speech-error');
      };
      // Speaking straight after cancel() can be dropped silently in Chrome.
      setTimeout(() => {
        if (mine !== token.current) return;
        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(line);
        } catch (error) {
          console.warn('[Fade speech] Playback error', error);
          done('speech-error');
        }
      }, 100);
    };

    if (clip.audioUrl) {
      try {
        const url = new URL(clip.audioUrl, window.location.href);
        if (!['https:', 'http:', 'blob:'].includes(url.protocol)) throw new Error('Unsupported audio URL');
        const player = new Audio(url.href);
        audio.current = player;
        player.onended = () => done('audio');
        player.onerror = () => {
          console.warn('[Fade speech] Audio clip failed, using browser voice');
          if (audio.current === player) audio.current = null;
          speakWithBrowser();
        };
        void player.play().then(
          () => console.info('[Fade speech] Audio clip started'),
          (error) => {
            console.warn('[Fade speech] Audio clip blocked, using browser voice', error);
            if (audio.current === player) audio.current = null;
            speakWithBrowser();
          },
        );
        return;
      } catch (error) {
        console.warn('[Fade speech] Audio clip unusable, using browser voice', error);
      }
    }
    speakWithBrowser();
  }, []);

  const enqueue = useCallback((clip: Clip) => {
    if (!clip.text.trim()) return;
    queue.current.push(clip);
    // Keep only the newest few lines so nothing old piles up while locked.
    if (queue.current.length > 4) queue.current.splice(0, queue.current.length - 4);
    if (!unlockedRef.current) console.info('[Fade speech] Waiting for a click before speaking');
    next();
  }, [next]);

  const clipFor = (m: FadeMessage): Clip => ({ text: m.speechText ?? m.text, audioUrl: m.speechText ? null : m.audioUrl });

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setUnlocked(true);
    console.info('[Fade speech] Sound turned on');
    // Play whatever arrived before the click; if nothing did, say the current line.
    if (!queue.current.length) queue.current.push(clipFor(messageRef.current));
    next();
  }, [next]);

  // "Say it again": drop anything waiting and say the current line right now.
  const replay = useCallback(() => {
    unlockedRef.current = true;
    setUnlocked(true);
    stopCurrent();
    queue.current = [clipFor(messageRef.current)];
    next();
  }, [next, stopCurrent]);

  const setVoiceSuppressed = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed;
    if (suppressed) { stopCurrent(); queue.current = []; } else next();
  }, [next, stopCurrent]);

  useEffect(() => { enqueue(clipFor(message)); }, [message, enqueue]);
  useEffect(() => () => { stopCurrent(); queue.current = []; }, [stopCurrent]);

  return {
    unlockAudio, replay, setVoiceSuppressed, soundOn: unlocked,
    questionNote, setQuestionNote, questionInputRef,
  };
}
