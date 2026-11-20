import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Check, AlertCircle, Info, Mic, LoaderCircle, CircleCheck, Pencil, XCircle } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { Shell } from '@/components/shell';
import { MAX_LEN, type Status } from '@/lib/socket';

type Step = { id: string; text: string; done: boolean };
type LessonAck = {
  ok: boolean;
  chunks?: number;
  task?: boolean;
  source?: 'agent' | 'fallback';
  steps?: Step[];
  ms?: number;
};

type StudentUpdate = {
  studentId: string;
  name: string;
  stepIndex: number;
  status: 'working' | 'done' | 'needs_help';
  sentence: string;
  reason?: string;
  code?: string;
  said?: { text: string; kind: string; code_quote: string; lesson_quote: string };
  hintsLeft?: number;
  reasoning?: {
    trigger: string;
    action: string;
    ms: number;
    log: { t: number; tool: string; input: unknown; result: unknown; ok: boolean }[];
  };
};

function decisionSummary(value: unknown, depth = 0): string {
  const shorten = (text: string) => text.length > 320 ? `${text.slice(0, 317)}…` : text;
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return shorten(value.replace(/\s+/g, ' ').trim()) || 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'object') return String(value);
  if (depth > 2) return Array.isArray(value) ? `${value.length} items` : 'Additional details';
  if (Array.isArray(value)) {
    if (!value.length) return 'No items';
    return shorten(value.slice(0, 3).map(item => decisionSummary(item, depth + 1)).join('; ')
      + (value.length > 3 ? `; +${value.length - 3} more` : ''));
  }
  const entries = Object.entries(value);
  if (!entries.length) return 'No additional input';
  return shorten(entries.slice(0, 4).map(([key, item]) =>
    `${key.replace(/_/g, ' ')}: ${decisionSummary(item, depth + 1)}`).join('; ')
    + (entries.length > 4 ? `; +${entries.length - 4} more fields` : ''));
}

function StudentRow({ student, online, pending, onHelp }: {
  student: StudentUpdate;
  online: boolean;
  pending: boolean;
  onHelp: (studentId: string) => void;
}) {
  const needsHelp = student.status === 'needs_help';
  const { label, Icon } = needsHelp ? { label: 'Needs you', Icon: AlertCircle }
    : student.status === 'done' ? { label: 'Done', Icon: CircleCheck }
      : { label: 'Working', Icon: Pencil };
  return (
    <li data-student-id={student.studentId} data-status={student.status}
      className={`min-w-0 rounded-2xl bg-card p-5 ${needsHelp ? 'border-2 border-accent shadow-sm' : 'border'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p aria-live="polite" className={`min-w-0 flex-1 break-words ${needsHelp ? 'font-serif text-3xl leading-tight' : 'text-lg'}`}>
          {student.sentence}
        </p>
        <span data-testid="student-status" className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${needsHelp ? 'border-accent text-accent' : 'text-primary'}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />{label}
        </span>
      </div>

      {needsHelp && (
        <div className="mt-3 space-y-3">
          {student.reason && <p data-testid="student-reason" className="whitespace-pre-wrap break-words text-lg">{student.reason}</p>}
          <pre aria-label={`${student.name}'s HTML`} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-sm leading-relaxed text-slate-100">
            <code>{student.code === undefined ? 'No code has been shared yet.' : student.code || 'The editor is empty.'}</code>
          </pre>
          <button type="button" data-testid="button-helped" disabled={!online || pending}
            onClick={() => onHelp(student.studentId)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <Check aria-hidden="true" className="h-4 w-4" />I'm with them
          </button>
          {pending && <p role="status" className="text-sm text-muted-foreground">Waiting for the student update…</p>}
        </div>
      )}

      {student.said && (
        <div data-testid="student-said" className="mt-4 space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold">What Fade told {student.name}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-lg">{student.said.text}</p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl bg-muted/60 p-3">
              <h4 className="text-sm font-semibold">From their code</h4>
              <blockquote className="mt-1 whitespace-pre-wrap break-words font-mono text-sm">{student.said.code_quote || 'No code quote shared.'}</blockquote>
            </div>
            <div className="min-w-0 rounded-xl bg-muted/60 p-3">
              <h4 className="text-sm font-semibold">From your lesson</h4>
              <blockquote className="mt-1 whitespace-pre-wrap break-words text-sm">{student.said.lesson_quote || 'No lesson quote shared.'}</blockquote>
            </div>
          </div>
        </div>
      )}

      <details data-testid="student-reasoning" className="mt-4 rounded-xl border">
        <summary className="cursor-pointer rounded-xl px-4 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">How Fade decided</summary>
        <div className="space-y-3 border-t p-4">
          {student.reasoning && (
            <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <div><dt className="font-semibold">Trigger</dt><dd>{student.reasoning.trigger.replace(/_/g, ' ')}</dd></div>
              <div><dt className="font-semibold">Action</dt><dd>{student.reasoning.action.replace(/_/g, ' ')}</dd></div>
              <div><dt className="font-semibold">Time</dt><dd>{student.reasoning.ms} ms</dd></div>
            </dl>
          )}
          {typeof student.hintsLeft === 'number' && <p className="text-sm">Hints left: {student.hintsLeft}</p>}
          {student.reasoning?.log.length ? (
            <ol className="list-decimal space-y-3 pl-5">
              {student.reasoning.log.map((entry, index) => (
                <li key={index} data-testid="reasoning-entry" className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all font-mono text-sm font-semibold">{entry.tool}</span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      {entry.ok === false ? <XCircle aria-hidden="true" className="h-4 w-4" /> : <CircleCheck aria-hidden="true" className="h-4 w-4" />}
                      {entry.ok === false ? 'Rejected' : 'Accepted'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.t} ms</p>
                  <dl className="mt-2 space-y-2 break-words text-sm leading-relaxed">
                    <div><dt className="font-semibold">Input</dt><dd>{decisionSummary(entry.input)}</dd></div>
                    <div><dt className="font-semibold">Result</dt><dd>{decisionSummary(entry.result)}</dd></div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">No decisions have been shared yet.</p>}
        </div>
      </details>
    </li>
  );
}

type AudioPiece = {
  recorder: MediaRecorder;
  startedAt: number;
  endedAt?: number;
  chunks: Blob[];
};
type RecordingStream = {
  running: boolean;
  cancelled: boolean;
  startedAt: number;
  stream?: MediaStream;
  piece?: AudioPiece;
  rotation?: number;
  limit?: number;
  ticker?: number;
};

// Kept on the teacher page so recording never touches student or shared code.
function useTeacherVoice(onTranscript: (text: string) => Promise<boolean>) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'finishing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(0);
  const [processing, setProcessing] = useState<'transcribing' | 'sending' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const current = useRef<RecordingStream | null>(null);
  const alive = useRef(false);
  const queue = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const releaseTracks = (session: RecordingStream) => session.stream?.getTracks().forEach(track => track.stop());
  const clearTimers = (session: RecordingStream) => {
    window.clearInterval(session.rotation);
    window.clearInterval(session.ticker);
    window.clearTimeout(session.limit);
  };

  function enqueue(audio: Blob) {
    pendingRef.current += 1;
    setPending(pendingRef.current);
    // Each clip is a complete recording, including its own format headers.
    // Transcription AND the lesson acknowledgement finish before the next clip.
    queue.current = queue.current.then(async () => {
      let timeout: number | undefined;
      const controller = new AbortController();
      try {
        if (!alive.current) return;
        controllers.current.add(controller);
        setProcessing('transcribing');
        timeout = window.setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${import.meta.env.BASE_URL}stt`, {
          method: 'POST',
          headers: { 'Content-Type': audio.type },
          body: audio,
          signal: controller.signal,
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
            setError('Your unsent words are in the text box. Check your connection, then send them.');
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
        if (alive.current) {
          setPending(pendingRef.current);
          setProcessing(null);
        }
      }
    });
  }

  function stop(message = '') {
    const session = current.current;
    if (!session || !session.running) return;
    session.running = false;
    clearTimers(session);
    if (message) setNote(message);
    const piece = session.piece;
    if (piece && piece.recorder.state !== 'inactive') {
      setPhase('finishing');
      piece.endedAt = performance.now();
      piece.recorder.stop();
    } else {
      current.current = null;
      setPhase('idle');
    }
    // The final data event can arrive later; microphone access ends now.
    releaseTracks(session);
  }

  function startPiece(session: RecordingStream) {
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(type => MediaRecorder.isTypeSupported?.(type));
    const recorder = new MediaRecorder(session.stream!, mimeType ? { mimeType } : undefined);
    const piece: AudioPiece = { recorder, chunks: [], startedAt: performance.now() };
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
      const useful = duration >= 500 || piece.startedAt - session.startedAt >= 500;
      if (useful && type && piece.chunks.length) {
        enqueue(new Blob(piece.chunks, { type }));
      } else if (!session.running && duration < 500 && performance.now() - session.startedAt < 1000) {
        setNote('Recording was very short. Click the microphone and speak for a moment.');
      } else if (useful) {
        setError('No audio was recorded in this part. Please try again, or type instead.');
      }
      if (!session.running && current.current === session) {
        current.current = null;
        setPhase('idle');
      }
    };
    recorder.onerror = () => {
      if (!alive.current || current.current !== session) return;
      session.cancelled = true;
      stop();
      current.current = null;
      setPhase('idle');
      setError('The microphone stopped recording. Please try again, or type instead.');
    };
    recorder.start();
  }

  async function start() {
    if (current.current || pendingRef.current) return;
    setError('');
    setNote('');
    setElapsed(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not available in this browser. Please type instead.');
      return;
    }
    const session: RecordingStream = { running: true, cancelled: false, startedAt: 0 };
    current.current = session;
    setPhase('requesting');
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || current.current !== session || !session.running) {
        releaseTracks(session);
        return;
      }
      session.startedAt = performance.now();
      startPiece(session);
      setPhase('recording');
      session.ticker = window.setInterval(() => {
        if (alive.current) setElapsed(Math.min(300, Math.floor((performance.now() - session.startedAt) / 1000)));
      }, 1000);
      session.limit = window.setTimeout(() => stop('Recording stopped after 5 minutes.'), 300000);
      session.rotation = window.setInterval(() => {
        if (!session.running) return;
        if (performance.now() - session.startedAt >= 300000) {
          stop('Recording stopped after 5 minutes.');
          return;
        }
        try {
          if (session.piece && session.piece.recorder.state !== 'inactive') {
            session.piece.endedAt = performance.now();
            session.piece.recorder.stop();
          }
          // Reuse the live microphone, not the old recorder's partial data.
          startPiece(session);
        } catch {
          stop();
          setError('The microphone could not keep recording. Please try again, or type instead.');
        }
      }, 12000);
    } catch (error) {
      if (!alive.current || current.current !== session) return;
      session.cancelled = true;
      stop();
      current.current = null;
      setPhase('idle');
      const name = error instanceof DOMException ? error.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone access was not allowed. Allow it in your browser, or type instead.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone, or type instead.'
          : 'Could not start the microphone. Please try again, or type instead.');
    }
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
        session.cancelled = true;
        session.running = false;
        clearTimers(session);
        if (session.piece && session.piece.recorder.state !== 'inactive') session.piece.recorder.stop();
        releaseTracks(session);
      }
    };
  }, []);

  return { phase, elapsed, pending, processing, error, note, start, stop };
}

function TeacherMicrophone({ disabled, voice }: {
  disabled: boolean;
  voice: ReturnType<typeof useTeacherVoice>;
}) {
  const recording = voice.phase === 'recording';
  const active = recording || voice.phase === 'requesting';
  const blocked = !active && (disabled || voice.pending > 0 || voice.phase === 'finishing');
  const timer = `${Math.floor(voice.elapsed / 60)}:${String(voice.elapsed % 60).padStart(2, '0')}`;
  return (
    <div className="mt-4">
      <button type="button" data-testid="voice-teach" disabled={blocked}
        aria-pressed={recording} aria-describedby="voice-note-teach"
        onClick={() => { if (active) voice.stop(); else void voice.start(); }}
        className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-xl border-2 px-4 py-4 text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${recording ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/40 bg-primary/5 text-primary'}`}>
        {!recording && (voice.pending > 0 || voice.phase === 'requesting' || voice.phase === 'finishing')
          ? <LoaderCircle aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin" />
          : <Mic aria-hidden="true" className="h-6 w-6 shrink-0" />}
        {recording ? (
          <span>Listening <span role="timer" aria-label="Recording time" className="ml-2 font-mono tabular-nums">{timer}</span>
            <span className="block text-sm font-normal">Click to stop</span>
          </span>
        ) : voice.phase === 'requesting' ? 'Opening microphone — click to cancel'
          : voice.processing === 'sending' ? 'Sending your words'
            : voice.pending > 0 || voice.phase === 'finishing' ? 'Turning speech into words' : 'Click to talk to your class'}
      </button>
      <p id="voice-note-teach" role="status" className="mt-2 text-sm text-muted-foreground">
        {voice.error || voice.note || (recording ? 'Keep talking. Your words are sent in order about every 12 seconds.'
          : 'Click once to start and again to stop. Recording stops automatically after 5 minutes.')}
      </p>
      {recording && voice.pending > 0 && <p role="status" className="mt-1 text-sm text-muted-foreground">
        {voice.processing === 'sending' ? 'Sending your words' : 'Turning speech into words'} · {voice.pending} {voice.pending === 1 ? 'part' : 'parts'} remaining
      </p>}
    </div>
  );
}

export default function Teacher() {
  const [status, setStatus] = useState<Status>('connecting');
  const [lesson, setLesson] = useState('');
  const [taught, setTaught] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<LessonAck | null>(null);
  const [pendingLessons, setPendingLessons] = useState(0);
  const [newSteps, setNewSteps] = useState(false);
  const [lessonError, setLessonError] = useState('');
  const [students, setStudents] = useState<Map<string, StudentUpdate>>(() => new Map());
  const [helpPending, setHelpPending] = useState<Set<string>>(() => new Set());
  const helpPendingRef = useRef(new Set<string>());
  const socketRef = useRef<Socket | null>(null);
  const lessonRef = useRef<HTMLTextAreaElement>(null);
  const lessonQueue = useRef<Promise<unknown>>(Promise.resolve());
  const typedSubmitting = useRef(false);
  const pageAlive = useRef(false);
  const newStepsTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    pageAlive.current = true;
    document.title = 'Teacher · Fade';
    lessonRef.current?.focus();
    // Teacher-owned connection: do not change the student/shared socket helper.
    const socket = io({ path: `${import.meta.env.BASE_URL}socket.io` });
    socketRef.current = socket;
    const onConnect = () => setStatus('online');
    const onDisconnect = () => {
      setStatus('offline');
      helpPendingRef.current.clear();
      setHelpPending(new Set());
    };
    const onSteps = (payload: { steps: Step[] }) => {
      if (!Array.isArray(payload?.steps)) return;
      setSteps(payload.steps);
      setQuestion('');
    };
    const onQuestion = (payload: { question: string }) => {
      if (typeof payload?.question === 'string') setQuestion(payload.question);
    };
    const onStudentUpdate = (payload: StudentUpdate) => {
      if (!payload || typeof payload.studentId !== 'string') return;
      setStudents(previous => new Map(previous).set(payload.studentId, {
        ...previous.get(payload.studentId),
        ...payload,
      }));
      helpPendingRef.current.delete(payload.studentId);
      setHelpPending(new Set(helpPendingRef.current));
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('steps:new', onSteps);
    socket.on('steps:question', onQuestion);
    socket.on('student:update', onStudentUpdate);
    if (socket.connected) onConnect();
    return () => {
      pageAlive.current = false;
      window.clearTimeout(newStepsTimer.current);
      socketRef.current = null;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('steps:new', onSteps);
      socket.off('steps:question', onQuestion);
      socket.off('student:update', onStudentUpdate);
      socket.disconnect();
    };
  }, []);

  const online = status === 'online';
  const sortedStudents = [...students.values()].sort((a, b) =>
    Number(b.status === 'needs_help') - Number(a.status === 'needs_help')
    || a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));

  function helpStudent(studentId: string) {
    const socket = socketRef.current;
    if (!socket?.connected || helpPendingRef.current.has(studentId)) return;
    helpPendingRef.current.add(studentId);
    setHelpPending(new Set(helpPendingRef.current));
    // The next student:update, not the click, decides when the card clears.
    socket.emit('teacher:helped', { studentId });
  }

  const voice = useTeacherVoice(async text => {
    const sent = await sendLesson(text);
    if (!sent && pageAlive.current) {
      // Keep unsent speech alongside any text the teacher has been drafting.
      setLesson(previous => previous.trim() ? `${previous}\n${text}` : text);
    }
    return sent;
  });

  function sendLesson(rawText: string): Promise<boolean> {
    const text = rawText.trim();
    if (!text || !pageAlive.current) return Promise.resolve(false);
    setPendingLessons(previous => previous + 1);
    setLessonError('');
    const work = lessonQueue.current.then(() => new Promise<boolean>(resolve => {
      if (!pageAlive.current) return resolve(false);
      const socket = socketRef.current;
      if (!socket?.connected) {
        setLessonError('Not connected. Your words have not been sent. Please try again when the connection returns.');
        resolve(false);
        return;
      }
      socket.timeout(30000).emit('lesson:chunk', { text }, (error: Error | null, ack?: LessonAck) => {
        if (!pageAlive.current || socketRef.current !== socket) return resolve(false);
        if (error || !ack?.ok) {
          setLessonError('Could not confirm these words were saved. Check your connection and try again.');
          resolve(false);
          return;
        }
        setTaught(previous => [...previous, text]);
        setResult(ack);
        if (Array.isArray(ack.steps)) setSteps(ack.steps);
        if (ack.task) {
          setQuestion('');
          setNewSteps(true);
          window.clearTimeout(newStepsTimer.current);
          newStepsTimer.current = window.setTimeout(() => setNewSteps(false), 4000);
        }
        resolve(true);
      });
    })).catch(() => {
      if (pageAlive.current) setLessonError('Could not send these words. Please check your connection and try again.');
      return false;
    }).finally(() => {
      if (pageAlive.current) setPendingLessons(previous => previous - 1);
    });
    lessonQueue.current = work;
    return work;
  }

  async function teach(event?: FormEvent) {
    event?.preventDefault();
    if (typedSubmitting.current || !lesson.trim()) return;
    const submitted = lesson;
    typedSubmitting.current = true;
    try {
      if (await sendLesson(submitted) && pageAlive.current) {
        setLesson(previous => previous === submitted ? '' : previous);
      }
    } finally {
      typedSubmitting.current = false;
    }
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

        <section aria-labelledby="class-heading">
          <h2 id="class-heading" className="text-2xl font-semibold">Your class</h2>
          {sortedStudents.length ? (
            <ul data-testid="student-list" className="mt-4 space-y-4">
              {sortedStudents.map(student => (
                <StudentRow key={student.studentId} student={student} online={online}
                  pending={helpPending.has(student.studentId)} onHelp={helpStudent} />
              ))}
            </ul>
          ) : <p className="mt-3 text-muted-foreground">No students have joined yet</p>}
        </section>

        <form onSubmit={teach} className="rounded-2xl border bg-card p-5">
          <label htmlFor="teach" className="text-xl font-semibold">Teach</label>
          <p id="teach-help" className="mt-1 text-sm text-muted-foreground">Explain the lesson and give tasks as you talk. Fade listens for what your class should do.</p>
          <TeacherMicrophone disabled={!online} voice={voice} />
          <textarea id="teach" ref={lessonRef} data-testid="input-teach" value={lesson} maxLength={MAX_LEN} rows={3}
            aria-describedby="teach-help" onChange={(event) => setLesson(event.target.value)}
            onKeyDown={(event) => shortcut(event, teach)} placeholder="Explain something to your class..."
            className={inputClass} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
            <button type="submit" data-testid="button-teach" disabled={!online || !lesson.trim() || pendingLessons > 0} className={buttonClass}>
              {pendingLessons > 0 ? 'Sending' : 'Send'}<ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div role="status" className="mt-3 text-sm text-muted-foreground">
            {pendingLessons > 0 && <p>Listening for a task</p>}
            {newSteps && <p>New steps sent to your class</p>}
          </div>
          {result?.source === 'fallback' && (
            <p data-testid="fallback-note" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Info aria-hidden="true" className="h-4 w-4 shrink-0" />Basic steps (AI unavailable)
            </p>
          )}
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

        {question && (
          <section role="alert" aria-labelledby="question-heading" className="rounded-2xl border-2 border-accent bg-card p-5">
            <h2 id="question-heading" className="flex items-center gap-2 text-xl font-semibold">
              <AlertCircle aria-hidden="true" className="h-5 w-5" />Fade needs to know
            </h2>
            <p data-testid="steps-question" className="mt-3 whitespace-pre-wrap break-words text-xl leading-relaxed">{question}</p>
            <p className="mt-2 text-sm text-muted-foreground">Clarify the task using the microphone or text box and send it again.</p>
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
