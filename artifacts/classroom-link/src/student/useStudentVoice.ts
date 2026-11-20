import { useCallback, useEffect, useRef, useState } from 'react';
import type { FadeMessage } from './lesson';

// Notifications use supplied audio or browser speech. Live microphone sessions
// are managed separately by the official ElevenLabs conversation SDK.
export function useStudentVoice(message: FadeMessage) {
  const messageRef = useRef(message);
  messageRef.current = message;
  const unlocked = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chrome can stop speaking if the utterance loses its JavaScript reference.
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [questionNote, setQuestionNote] = useState('');
  const suppressedRef = useRef(false);
  const questionInputRef = useRef<HTMLInputElement>(null);

  const stopVoice = useCallback(() => {
    if (speechTimer.current !== null) clearTimeout(speechTimer.current);
    speechTimer.current = null;
    audio.current?.pause();
    audio.current = null;
    currentUtterance.current = null;
    window.speechSynthesis?.cancel();
  }, []);
  const setVoiceSuppressed = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed;
    if (suppressed) stopVoice();
  }, [stopVoice]);

  const speak = useCallback((text: string) => {
    // Speaking synchronously after cancel() can silently discard the utterance
    // in Chrome. A newer message, suppression, or unmount cancels this timer.
    speechTimer.current = setTimeout(() => {
      speechTimer.current = null;
      if (!unlocked.current || suppressedRef.current) {
        console.info('[Fade speech] Skipped speech', {
          reason: !unlocked.current ? 'Audio is not unlocked yet' : 'ElevenLabs conversation is connected',
        });
        return;
      }
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        console.info('[Fade speech] Skipped speech', { reason: 'Browser speech is unavailable' });
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance.current = utterance;
      utterance.rate = 0.9;
      utterance.onstart = () => console.info('[Fade speech] Utterance started');
      utterance.onend = () => {
        console.info('[Fade speech] Utterance ended');
        if (currentUtterance.current === utterance) currentUtterance.current = null;
      };
      utterance.onerror = (event) => {
        console.warn('[Fade speech] Utterance error', { error: event.error });
        if (currentUtterance.current === utterance) currentUtterance.current = null;
      };
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.warn('[Fade speech] Playback error', error);
        if (currentUtterance.current === utterance) currentUtterance.current = null;
      }
    }, 100);
  }, []);

  const play = useCallback((next: FadeMessage) => {
    stopVoice();
    if (!unlocked.current || suppressedRef.current) {
      console.info('[Fade speech] Skipped speech', {
        reason: !unlocked.current ? 'Audio is not unlocked yet' : 'ElevenLabs conversation is connected',
      });
      return;
    }
    const spokenText = next.speechText ?? next.text;
    if (!next.audioUrl) {
      speak(spokenText);
      return;
    }
    try {
      const url = new URL(next.audioUrl, window.location.href);
      if (!['https:', 'http:', 'blob:'].includes(url.protocol)) {
        speak(spokenText);
        return;
      }
      const player = new Audio(url.href);
      audio.current = player;
      const fallback = () => {
        if (audio.current === player) {
          audio.current = null;
          speak(spokenText);
        }
      };
      player.onerror = fallback;
      void player.play().catch(fallback);
    } catch {
      speak(spokenText);
    }
  }, [speak, stopVoice]);

  const unlockAudio = useCallback(() => {
    if (unlocked.current) return;
    unlocked.current = true;
    play(messageRef.current);
  }, [play]);

  const replay = useCallback(() => {
    unlocked.current = true;
    play(messageRef.current);
  }, [play]);

  useEffect(() => { play(message); }, [message, play]);
  useEffect(() => stopVoice, [stopVoice]);

  return {
    unlockAudio, replay, setVoiceSuppressed,
    questionNote, setQuestionNote, questionInputRef,
  };
}
