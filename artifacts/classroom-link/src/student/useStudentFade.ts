import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { checkSteps, DEMO_STEPS, INITIAL_CSS, initialHtml, mergeSteps, type FadeMessage, type Step } from './lesson';
import { useStudentVoice } from './useStudentVoice';

// The shared helper keeps its socket private. This student-only singleton is
// used by ALL student events; we do not mount useClassroomLink or open a second
// connection for code, questions, voice, or idle reporting.
let studentSocket: Socket | null = null;
function getStudentSocket() {
  studentSocket ??= io({
    path: `${import.meta.env.BASE_URL}socket.io`,
    autoConnect: false,
  });
  return studentSocket;
}

export function useStudentFade() {
  const [name] = useState(() => new URLSearchParams(window.location.search).get('name')?.trim() || 'Maya');
  const studentId = name.toLowerCase();
  const [html, updateHtml] = useState(() => initialHtml(studentId));
  const [css, updateCss] = useState(INITIAL_CSS);
  const [steps, setSteps] = useState<Step[]>(() => DEMO_STEPS.map((step) => ({ ...step })));
  const [message, setMessage] = useState<FadeMessage>({
    text: `Hi ${name}! First, type a title in an h1 tag.`,
  });
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const stepsRef = useRef(steps);
  const codeRef = useRef({ studentId, html, css });
  codeRef.current = { studentId, html, css };
  const lastTyped = useRef(Date.now());
  const idleSent = useRef(false);
  const [typingVersion, setTypingVersion] = useState(0);
  const voice = useStudentVoice(message);
  const currentStepIndex = steps.findIndex((step) => !step.done);

  const applyProgress = useCallback((base: Step[]) => {
    const checked = checkSteps(base, codeRef.current.html);
    const newlyDone = checked.filter((step, index) => step.done && !base[index].done);
    stepsRef.current = checked;
    setSteps(checked);
    if (newlyDone.length) {
      const allDone = checked.length > 0 && checked.every((step) => step.done);
      setMessage({
        kind: 'cheer',
        text: allDone ? 'You did it! You finished every step.'
          : newlyDone.some((step) => step.id === 's1') ? 'Nice! Your title is there.'
          : 'Nice! Your paragraph is there.',
      });
    }
  }, []);

  useEffect(() => {
    const socket = getStudentSocket();
    const onConnect = () => {
      setStatus('online');
      socket.emit('code:update', codeRef.current);
    };
    const onDisconnect = () => setStatus('offline');
    const onSteps = (payload: { steps?: unknown }) => {
      if (!payload || !Array.isArray(payload.steps)) return;
      const seen = new Set<string>();
      const incoming = payload.steps.filter((entry): entry is Step => {
        if (!entry || typeof entry.id !== 'string' || typeof entry.text !== 'string'
          || typeof entry.done !== 'boolean' || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
      applyProgress(mergeSteps(stepsRef.current, incoming));
    };
    const onSay = (payload: FadeMessage) => {
      if (!payload || typeof payload.text !== 'string') return;
      setMessage({
        text: payload.text,
        audioUrl: typeof payload.audioUrl === 'string' ? payload.audioUrl : null,
        kind: typeof payload.kind === 'string' ? payload.kind : undefined,
        code_quote: typeof payload.code_quote === 'string' ? payload.code_quote : null,
        lesson_quote: typeof payload.lesson_quote === 'string' ? payload.lesson_quote : null,
      });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('steps:new', onSteps);
    socket.on('fade:say', onSay);
    if (socket.connected) onConnect();
    else socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('steps:new', onSteps);
      socket.off('fade:say', onSay);
      socket.disconnect();
    };
  }, [applyProgress]);

  useEffect(() => { applyProgress(stepsRef.current); }, [html, applyProgress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const socket = getStudentSocket();
      if (socket.connected) socket.emit('code:update', codeRef.current);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [html, css]);

  useEffect(() => {
    if (currentStepIndex < 0 || idleSent.current || status !== 'online') return;
    const timer = window.setTimeout(() => {
      const socket = getStudentSocket();
      const index = stepsRef.current.findIndex((step) => !step.done);
      if (idleSent.current || index < 0 || !socket.connected) return;
      socket.emit('student:idle', {
        studentId,
        idleSeconds: Math.floor((Date.now() - lastTyped.current) / 1000),
        stepIndex: index,
      });
      idleSent.current = true;
    }, Math.max(0, 20_000 - (Date.now() - lastTyped.current)));
    return () => window.clearTimeout(timer);
  }, [typingVersion, currentStepIndex, status, studentId]);

  const typed = useCallback(() => {
    lastTyped.current = Date.now();
    idleSent.current = false;
    setTypingVersion((version) => version + 1);
  }, []);
  const setHtml = useCallback((value: string) => { typed(); updateHtml(value); }, [typed]);
  const setCss = useCallback((value: string) => { typed(); updateCss(value); }, [typed]);
  const askQuestion = useCallback((text: string) => {
    if (!text.trim()) return false;
    const socket = getStudentSocket();
    if (!socket.connected) {
      voice.setQuestionNote('You are offline. Your question is still here. Try again when connected.');
      return false;
    }
    socket.emit('question', { studentId, text: text.trim() });
    voice.setQuestionNote('Question sent. Keep your place while you wait.');
    return true;
  }, [studentId, voice.setQuestionNote]);

  return {
    name, studentId, html, css, setHtml, setCss, steps, currentStepIndex,
    message, status, askQuestion,
    replay: voice.replay, questionNote: voice.questionNote,
    setVoiceSuppressed: voice.setVoiceSuppressed,
    unlockAudio: voice.unlockAudio, questionInputRef: voice.questionInputRef,
  };
}
