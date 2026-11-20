import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Status } from '@/lib/socket';
import TeacherView from '@/teacher/TeacherView';
import { useTeacherVoice } from '@/teacher/use-teacher-voice';
import type { LessonAck, Step, StudentUpdate } from '@/teacher/types';

export default function Teacher() {
  const [status, setStatus] = useState<Status>('connecting');
  const [lesson, setLesson] = useState('');
  const [taught, setTaught] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<LessonAck | null>(null);
  const [pendingLessons, setPendingLessons] = useState(0);
  const [pendingTask, setPendingTask] = useState(false);
  const [newSteps, setNewSteps] = useState(false);
  const [lessonError, setLessonError] = useState('');
  const [students, setStudents] = useState<Map<string, StudentUpdate>>(() => new Map());
  const [helpPending, setHelpPending] = useState<Set<string>>(() => new Set());
  const helpPendingRef = useRef(new Set<string>());
  const socketRef = useRef<Socket | null>(null);
  const lessonQueue = useRef<Promise<unknown>>(Promise.resolve());
  const typedSubmitting = useRef(false);
  const pageAlive = useRef(false);
  const newStepsTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    pageAlive.current = true;
    document.title = 'Teacher · Fade';
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
        ...previous.get(payload.studentId), ...payload,
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

  const sortedStudents = [...students.values()].sort((a, b) =>
    Number(b.status === 'needs_help') - Number(a.status === 'needs_help')
    || a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));

  function helpStudent(studentId: string) {
    const socket = socketRef.current;
    if (!socket?.connected || helpPendingRef.current.has(studentId)) return;
    helpPendingRef.current.add(studentId);
    setHelpPending(new Set(helpPendingRef.current));
    // The server's next update determines when the help card clears.
    socket.emit('teacher:helped', { studentId });
  }

  const voice = useTeacherVoice(async text => {
    const sent = await sendWords(text);
    if (!sent && pageAlive.current) {
      setLesson(previous => previous.trim() ? `${previous}\n${text}` : text);
    }
    return sent;
  });

  function sendWords(rawText: string, asTask = false): Promise<boolean> {
    const text = rawText.trim();
    if (!text || !pageAlive.current) return Promise.resolve(false);
    if (asTask) setPendingTask(true);
    else setPendingLessons(previous => previous + 1);
    setLessonError('');
    const work = lessonQueue.current.then(() => new Promise<boolean>(resolve => {
      if (!pageAlive.current) return resolve(false);
      const socket = socketRef.current;
      if (!socket?.connected) {
        setLessonError('Not connected. Your words have not been sent. Please try again when the connection returns.');
        resolve(false);
        return;
      }
      socket.timeout(30000).emit(asTask ? 'task:spoken' : 'lesson:chunk', { text },
        (error: Error | null, ack?: LessonAck) => {
          if (!pageAlive.current || socketRef.current !== socket) return resolve(false);
          if (error || !ack?.ok) {
            setLessonError('Could not confirm these words were saved. Check your connection and try again.');
            resolve(false);
            return;
          }
          setResult(ack);
          if (Array.isArray(ack.steps)) setSteps(ack.steps);
          if (ack.question) {
            setQuestion(ack.question);
            resolve(false);
            return;
          }
          setTaught(previous => [...previous, text]);
          if (ack.task || asTask) {
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
      if (pageAlive.current) {
        if (asTask) setPendingTask(false);
        else setPendingLessons(previous => previous - 1);
      }
    });
    lessonQueue.current = work;
    return work;
  }

  async function submitTyped(asTask: boolean) {
    if (typedSubmitting.current || !lesson.trim()) return;
    const submitted = lesson;
    typedSubmitting.current = true;
    try {
      if (await sendWords(submitted, asTask) && pageAlive.current) {
        setLesson(previous => previous === submitted ? '' : previous);
      }
    } finally { typedSubmitting.current = false; }
  }

  async function teach(event?: FormEvent) {
    event?.preventDefault();
    await submitTyped(false);
  }

  return (
    <TeacherView
      status={status} lesson={lesson} setLesson={setLesson} taught={taught} steps={steps}
      question={question} result={result} pendingLessons={pendingLessons} pendingTask={pendingTask}
      newSteps={newSteps} lessonError={lessonError} sortedStudents={sortedStudents}
      helpPending={helpPending} helpStudent={helpStudent} voice={voice}
      teach={teach} sendTask={() => submitTyped(true)}
    />
  );
}
