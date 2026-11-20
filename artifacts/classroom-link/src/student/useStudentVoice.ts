import { useCallback, useEffect, useRef, useState } from 'react';
import type { FadeMessage } from './lesson';

// Notifications use supplied audio or browser speech. Live microphone sessions
// are managed separately by the official ElevenLabs conversation SDK.
export function useStudentVoice(message: FadeMessage) {
  const messageRef = useRef(message);
  messageRef.current = message;
  const unlocked = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [questionNote, setQuestionNote] = useState('');
  const [voiceSuppressed, setVoiceSuppressed] = useState(false);
  const suppressedRef = useRef(voiceSuppressed);
  suppressedRef.current = voiceSuppressed;
  const questionInputRef = useRef<HTMLInputElement>(null);

  const stopVoice = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    if (!suppressedRef.current && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const play = useCallback((next: FadeMessage) => {
    stopVoice();
    if (suppressedRef.current) return;
    if (!next.audioUrl) {
      speak(next.text);
      return;
    }
    try {
      const url = new URL(next.audioUrl, window.location.href);
      if (!['https:', 'http:', 'blob:'].includes(url.protocol)) {
        speak(next.text);
        return;
      }
      const player = new Audio(url.href);
      audio.current = player;
      const fallback = () => {
        if (audio.current === player) {
          audio.current = null;
          speak(next.text);
        }
      };
      player.onerror = fallback;
      void player.play().catch(fallback);
    } catch {
      speak(next.text);
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

  useEffect(() => { if (unlocked.current) play(message); }, [message, play]);
  useEffect(() => { if (voiceSuppressed) stopVoice(); }, [voiceSuppressed, stopVoice]);
  useEffect(() => stopVoice, [stopVoice]);

  return {
    unlockAudio, replay, setVoiceSuppressed,
    questionNote, setQuestionNote, questionInputRef,
  };
}
