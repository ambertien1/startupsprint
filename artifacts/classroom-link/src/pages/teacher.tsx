import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Check, AlertCircle, Info, Mic, LoaderCircle } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { Shell } from '@/components/shell';
import { MAX_LEN, type Status } from '@/lib/socket';

type Step = { id: string; text: string; done: boolean };
type TaskAck = {
  ok: boolean;
  source?: 'agent' | 'fallback';
  steps?: Step[];
  question?: string;
  ms?: number;
};

type VoiceTarget = 'teach' | 'task';
type VoicePhase = 'requesting' | 'recording' | 'transcribing';
type Recording = {
  target: VoiceTarget;
  held: boolean;
  cancelled: boolean;
  startedAt: number;
  duration: number;
  chunks: Blob[];
  stream?: MediaStream;
  recorder?: MediaRecorder;
  controller?: AbortController;
};

// Kept on the teacher page so recording never touches student or shared code.
function useTeacherVoice(onTranscript: (target: VoiceTarget, text: string) => boolean) {
  const [active, setActive] = useState<{ target: VoiceTarget; phase: VoicePhase } | null>(null);
  const [notes, setNotes] = useState<Record<VoiceTarget, string>>({ teach: '', task: '' });
  const current = useRef<Recording | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const note = (target: VoiceTarget, text: string) => setNotes(previous => ({ ...previous, [target]: text }));
  const releaseTracks = (session: Recording) => session.stream?.getTracks().forEach(track => track.stop());

  function finish(session: Recording) {
    releaseTracks(session);
    if (current.current !== session) return;
    current.current = null;
    setActive(null);
  }

  async function transcribe(session: Recording) {
    releaseTracks(session);
    if (current.current !== session || session.cancelled) return;
    if (session.duration < 500) {
      note(session.target, 'Hold the button while you talk');
      finish(session);
      return;
    }
    const mimeType = session.recorder?.mimeType || session.chunks[0]?.type;
    if (!mimeType || !session.chunks.length) {
      note(session.target, 'No audio was recorded. Please try again, or type instead.');
      finish(session);
      return;
    }
    const audio = new Blob(session.chunks, { type: mimeType });
    setActive({ target: session.target, phase: 'transcribing' });
    const controller = new AbortController();
    session.controller = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}stt`, {
        method: 'POST',
        headers: { 'Content-Type': audio.type },
        body: audio,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (current.current !== session) return;
      if (!response.ok || !result?.ok) {
        note(session.target, typeof result?.error === 'string' && result.error.trim()
          ? result.error : 'Speech-to-text is unavailable right now. Please type your message.');
      } else if (typeof result.text !== 'string' || !result.text.trim()) {
        note(session.target, 'No words were heard. Try holding the button while you talk, or type instead.');
      } else if (!onTranscriptRef.current(session.target, result.text.trim())) {
        note(session.target, 'Your words are in the text box. Send them when the connection is ready and the previous send has finished.');
      }
    } catch {
      if (current.current === session) {
        note(session.target, controller.signal.aborted
          ? 'Turning speech into words took too long. Please try again, or type instead.'
          : 'Could not turn speech into words. Check your connection or type instead.');
      }
    } finally {
      window.clearTimeout(timeout);
      finish(session);
    }
  }

  async function start(target: VoiceTarget) {
    if (current.current) return;
    note(target, '');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      note(target, 'Microphone recording is not available in this browser. Please type instead.');
      return;
    }
    const session: Recording = { target, held: true, cancelled: false, startedAt: 0, duration: 0, chunks: [] };
    current.current = session;
    setActive({ target, phase: 'requesting' });
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The teacher may release the button while the permission prompt is open.
      if (current.current !== session || !session.held) {
        releaseTracks(session);
        return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
      session.recorder = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) session.chunks.push(event.data);
      };
      recorder.onstop = () => { void transcribe(session); };
      recorder.onerror = () => {
        if (current.current !== session) return;
        session.cancelled = true;
        note(target, 'The microphone stopped recording. Please try again, or type instead.');
        if (recorder.state !== 'inactive') recorder.stop();
        finish(session);
      };
      recorder.start();
      session.startedAt = performance.now();
      setActive({ target, phase: 'recording' });
    } catch (error) {
      if (current.current !== session) return;
      const name = error instanceof DOMException ? error.name : '';
      note(target, name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone access was not allowed. Allow it in your browser, or type instead.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone, or type instead.'
          : 'Could not start the microphone. Please try again, or type instead.');
      finish(session);
    }
  }

  function release(target: VoiceTarget, cancel = false) {
    const session = current.current;
    if (!session || session.target !== target || !session.held) return;
    session.held = false;
    session.cancelled = cancel;
    if (cancel || !session.recorder) {
      note(target, 'Hold the button while you talk');
      if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
      finish(session);
      return;
    }
    session.duration = performance.now() - session.startedAt;
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    releaseTracks(session);
  }

  useEffect(() => {
    const cancelRecording = () => {
      const session = current.current;
      if (session?.held) release(session.target, true);
    };
    const onVisibility = () => { if (document.hidden) cancelRecording(); };
    window.addEventListener('blur', cancelRecording);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancelRecording);
      document.removeEventListener('visibilitychange', onVisibility);
      const session = current.current;
      current.current = null;
      if (session) {
        session.cancelled = true;
        session.controller?.abort();
        if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
        releaseTracks(session);
      }
    };
  }, []);

  return { active, notes, start, release };
}

function HoldToTalk({ target, label, disabled, voice }: {
  target: VoiceTarget;
  label: string;
  disabled: boolean;
  voice: ReturnType<typeof useTeacherVoice>;
}) {
  const phase = voice.active?.target === target ? voice.active.phase : null;
  const blocked = phase === 'transcribing' || (!phase && (disabled || voice.active !== null));
  return (
    <div className="mt-4">
      <button type="button" data-testid={`voice-${target}`} disabled={blocked}
        aria-pressed={phase === 'recording'} aria-describedby={`voice-note-${target}`}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          void voice.start(target);
        }}
        onPointerUp={() => voice.release(target)}
        onPointerCancel={() => voice.release(target, true)}
        onLostPointerCapture={() => voice.release(target, true)}
        onBlur={() => voice.release(target, true)}
        onKeyDown={event => {
          if (event.code !== 'Space' && event.key !== ' ') return;
          event.preventDefault();
          if (!event.repeat) void voice.start(target);
        }}
        onKeyUp={event => {
          if (event.code !== 'Space' && event.key !== ' ') return;
          event.preventDefault();
          voice.release(target);
        }}
        className={`flex min-h-16 w-full touch-none select-none items-center justify-center gap-3 rounded-xl border-2 px-4 py-4 text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${phase === 'recording' ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/40 bg-primary/5 text-primary'}`}>
        {phase === 'transcribing' || phase === 'requesting'
          ? <LoaderCircle aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin" />
          : <Mic aria-hidden="true" className="h-6 w-6 shrink-0" />}
        {phase === 'recording' ? 'Listening' : phase === 'transcribing'
          ? 'Turning speech into words' : phase === 'requesting' ? 'Opening microphone' : label}
      </button>
      <p id={`voice-note-${target}`} role="status" className="mt-2 text-sm text-muted-foreground">
        {voice.notes[target] || (phase === 'recording' ? 'Listening. Release to send.'
          : phase === 'transcribing' ? 'Turning speech into words'
            : phase === 'requesting' ? 'Opening microphone. Keep holding the button.'
              : 'Press and hold, then release to send. You can also hold Space when focused.')}
      </p>
    </div>
  );
}

export default function Teacher() {
  const [status, setStatus] = useState<Status>('connecting');
  const [lesson, setLesson] = useState('');
  const [task, setTask] = useState('');
  const [taught, setTaught] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<TaskAck | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [makingSteps, setMakingSteps] = useState(false);
  const [lessonError, setLessonError] = useState('');
  const [taskError, setTaskError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const lessonRef = useRef<HTMLTextAreaElement>(null);
  // Refs prevent duplicate submissions before React has rendered the busy state.
  const teachingRef = useRef(false);
  const makingStepsRef = useRef(false);

  useEffect(() => {
    document.title = 'Teacher · Fade';
    lessonRef.current?.focus();
    // Teacher-owned connection: do not change the student/shared socket helper.
    const socket = io({ path: `${import.meta.env.BASE_URL}socket.io` });
    socketRef.current = socket;
    const onConnect = () => setStatus('online');
    const onDisconnect = () => setStatus('offline');
    const onSteps = (payload: { steps: Step[] }) => {
      if (!Array.isArray(payload?.steps)) return;
      setSteps(payload.steps);
      setQuestion('');
    };
    const onQuestion = (payload: { question: string }) => {
      if (typeof payload?.question === 'string') setQuestion(payload.question);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('steps:new', onSteps);
    socket.on('steps:question', onQuestion);
    if (socket.connected) onConnect();
    return () => {
      socketRef.current = null;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('steps:new', onSteps);
      socket.off('steps:question', onQuestion);
      socket.disconnect();
    };
  }, []);

  const online = status === 'online';

  const voice = useTeacherVoice((target, text) => {
    if (target === 'teach') {
      setLesson(text);
      return sendLesson(text);
    }
    setTask(text);
    return sendTask(text);
  });

  function sendLesson(rawText: string) {
    const socket = socketRef.current;
    const text = rawText.trim();
    if (!socket?.connected || !text || teachingRef.current) return false;
    teachingRef.current = true;
    setTeaching(true);
    setLessonError('');
    socket.timeout(5000).emit('lesson:chunk', { text }, (error: Error | null, ack?: { ok: boolean }) => {
      if (socketRef.current !== socket) return;
      teachingRef.current = false;
      setTeaching(false);
      if (error || !ack?.ok) {
        setLessonError('Could not confirm this explanation was saved. Check your connection and try again.');
        return;
      }
      setTaught((previous) => [...previous, text]);
      setLesson('');
      lessonRef.current?.focus();
    });
    return true;
  }

  function sendTask(rawText: string) {
    const socket = socketRef.current;
    const text = rawText.trim();
    if (!socket?.connected || !text || makingStepsRef.current) return false;
    makingStepsRef.current = true;
    setMakingSteps(true);
    setTaskError('');
    setQuestion('');
    setResult(null);
    socket.timeout(30000).emit('task:spoken', { text }, (error: Error | null, ack?: TaskAck) => {
      if (socketRef.current !== socket) return;
      makingStepsRef.current = false;
      setMakingSteps(false);
      if (error || !ack?.ok) {
        setTaskError('Could not confirm the steps. Check your connection and send the task again.');
        return;
      }
      setResult(ack);
      if (Array.isArray(ack.steps)) setSteps(ack.steps);
      setQuestion(ack.question || '');
      // Keep an unclear task available for the teacher to edit and re-send.
      if (!ack.question) setTask('');
    });
    return true;
  }

  function teach(event?: FormEvent) {
    event?.preventDefault();
    sendLesson(lesson);
  }

  function giveTask(event?: FormEvent) {
    event?.preventDefault();
    sendTask(task);
  }

  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  const inputClass = 'mt-3 block w-full resize-y rounded-xl border bg-background px-4 py-3 text-lg leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
  const buttonClass = 'inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <Shell status={status}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 py-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Teacher</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight">Teach your class. <span className="text-primary">Fade makes the steps.</span></h1>
        </header>

        {!online && (
          <p role="status" className="text-sm text-muted-foreground">
            {status === 'connecting' ? 'Connecting to the classroom...' : 'Connection lost. Sending is paused until it returns.'}
          </p>
        )}

        <form onSubmit={teach} className="rounded-2xl border bg-card p-5">
          <label htmlFor="teach" className="text-xl font-semibold">Teach</label>
          <p id="teach-help" className="mt-1 text-sm text-muted-foreground">Explain the lesson. Fade uses this to help your students.</p>
          <HoldToTalk target="teach" label="Hold to talk to your class" disabled={!online || teaching} voice={voice} />
          <textarea id="teach" ref={lessonRef} data-testid="input-teach" value={lesson} maxLength={MAX_LEN} rows={3}
            disabled={teaching} aria-describedby="teach-help" onChange={(event) => setLesson(event.target.value)}
            onKeyDown={(event) => shortcut(event, teach)} placeholder="Explain something to your class..."
            className={inputClass} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
            <button type="submit" data-testid="button-teach" disabled={!online || !lesson.trim() || teaching} className={buttonClass}>
              {teaching ? 'Sending' : 'Send explanation'}<ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {lessonError && <p role="alert" className="mt-3 text-sm text-destructive">{lessonError}</p>}
        </form>

        <section aria-labelledby="taught-heading" aria-live="polite">
          <h2 id="taught-heading" className="text-lg font-semibold">What you’ve taught so far</h2>
          {taught.length ? (
            <ol data-testid="taught-list" className="mt-3 list-decimal space-y-2 pl-6">
              {taught.map((text, index) => <li key={index} className="whitespace-pre-wrap break-words pl-1">{text}</li>)}
            </ol>
          ) : <p className="mt-2 text-sm text-muted-foreground">Your sent explanations will appear here.</p>}
        </section>

        <form onSubmit={giveTask} aria-busy={makingSteps} className="rounded-2xl border bg-card p-5">
          <label htmlFor="task" className="text-xl font-semibold">Give a task</label>
          <p id="task-help" className="mt-1 text-sm text-muted-foreground">Tell the class what to do. Fade turns it into short steps.</p>
          <HoldToTalk target="task" label="Hold to say the task" disabled={!online || makingSteps} voice={voice} />
          <textarea id="task" data-testid="input-task" value={task} maxLength={MAX_LEN} rows={3}
            disabled={makingSteps} aria-describedby="task-help" onChange={(event) => setTask(event.target.value)}
            onKeyDown={(event) => shortcut(event, giveTask)} placeholder="Add a title with an h1 tag, then a paragraph underneath..."
            className={inputClass} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span role="status" className="text-sm text-muted-foreground">
              {makingSteps ? 'Making steps' : result?.ok && !question ? 'Steps ready.' : ''}
            </span>
            <button type="submit" data-testid="button-task" disabled={!online || !task.trim() || makingSteps} className={buttonClass}>
              {makingSteps ? 'Making steps' : 'Send task'}<ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {taskError && <p role="alert" className="mt-3 text-sm text-destructive">{taskError}</p>}
          {result?.source === 'fallback' && (
            <p data-testid="fallback-note" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Info aria-hidden="true" className="h-4 w-4 shrink-0" />Basic steps (AI unavailable)
            </p>
          )}
        </form>

        {question && (
          <section role="alert" aria-labelledby="question-heading" className="rounded-2xl border-2 border-accent bg-card p-5">
            <h2 id="question-heading" className="flex items-center gap-2 text-xl font-semibold">
              <AlertCircle aria-hidden="true" className="h-5 w-5" />Fade needs to know
            </h2>
            <p data-testid="steps-question" className="mt-3 whitespace-pre-wrap break-words text-xl leading-relaxed">{question}</p>
            <p className="mt-2 text-sm text-muted-foreground">Clarify the task in “Give a task” and send it again.</p>
          </section>
        )}

        <section aria-labelledby="steps-heading" aria-live="polite" className="border-t border-dashed pt-5">
          <h2 id="steps-heading" className="text-xl font-semibold">Steps your class sees</h2>
          {steps.length ? (
            <ol data-testid="class-steps" className="mt-4 list-decimal space-y-3 pl-7">
              {steps.map((step) => (
                <li key={step.id} className="pl-1 text-lg">
                  <span className="whitespace-pre-wrap break-words">{step.text}</span>
                  {step.done && <span className="ml-2 inline-flex items-center gap-1 text-sm text-primary"><Check aria-hidden="true" className="h-4 w-4" />Done</span>}
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-muted-foreground">Send a task to share steps with your class.</p>}
        </section>
      </div>
    </Shell>
  );
}
