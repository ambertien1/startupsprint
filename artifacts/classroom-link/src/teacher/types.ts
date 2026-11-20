import type { FormEvent } from 'react';
import type { Status } from '@/lib/socket';

export type Step = { id: string; text: string; done: boolean };
export type LessonAck = {
  ok: boolean;
  chunks?: number;
  task?: boolean;
  source?: 'agent' | 'fallback';
  steps?: Step[];
  question?: string;
  ms?: number;
};
export type StudentUpdate = {
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
export type TeacherVoice = {
  stream: MediaStream | null;
  phase: 'idle' | 'requesting' | 'recording' | 'finishing' | 'paused';
  elapsed: number;
  pending: number;
  processing: 'transcribing' | 'sending' | null;
  error: string;
  note: string;
  start: () => Promise<void>;
  stop: (message?: string) => void;
  pause: () => void;
  resume: () => Promise<void>;
};
export type TeacherViewProps = {
  status: Status;
  lesson: string;
  setLesson: (text: string) => void;
  taught: string[];
  steps: Step[];
  question: string;
  result: LessonAck | null;
  pendingLessons: number;
  pendingTask: boolean;
  newSteps: boolean;
  lessonError: string;
  sortedStudents: StudentUpdate[];
  helpPending: Set<string>;
  helpStudent: (studentId: string) => void;
  voice: TeacherVoice;
  teach: (event?: FormEvent) => Promise<void>;
  sendTask: () => Promise<void>;
};
