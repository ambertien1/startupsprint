import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Check, AlertCircle, Info } from 'lucide-react';
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

  function teach(event?: FormEvent) {
    event?.preventDefault();
    const socket = socketRef.current;
    const text = lesson.trim();
    if (!socket?.connected || !text || teachingRef.current) return;
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
  }

  function giveTask(event?: FormEvent) {
    event?.preventDefault();
    const socket = socketRef.current;
    const text = task.trim();
    if (!socket?.connected || !text || makingStepsRef.current) return;
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
