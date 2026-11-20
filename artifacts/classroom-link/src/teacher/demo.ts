// Example class shown when the Demo switch is on. Everything here is sample
// data, labelled as such on screen; it never touches the live classroom.
import type { Step, StudentUpdate, TeacherVoice } from './types';

export const DEMO_STEPS: Step[] = [
  { id: 'd1', text: 'Add a title to your page with an h1 tag.', done: false },
  { id: 'd2', text: 'Add a paragraph under your title.', done: false },
  { id: 'd3', text: 'Change the text color to purple.', done: false },
];

export const DEMO_TAUGHT = [
  'Good morning everyone. Today we are building our very first web page.',
  'HTML is made of tags. Every tag you open needs a closing tag with a slash, like </h1>.',
  'A paragraph goes inside a p tag. Now add a title to your page with an h1 tag, then add a paragraph under it.',
  'Looking great. When you are done, change the text color to purple in your style file.',
];

const working = (studentId: string, name: string, stepIndex: number): StudentUpdate => ({
  studentId, name, stepIndex, status: 'working', sentence: `${name} is on step ${stepIndex + 1} of 3`,
});
const done = (studentId: string, name: string): StudentUpdate => ({
  studentId, name, stepIndex: 3, status: 'done', sentence: `${name} finished every step`,
});

export const DEMO_STUDENTS: StudentUpdate[] = [
  {
    studentId: 'leo', name: 'Leo', stepIndex: 0, status: 'needs_help', sentence: 'Leo needs you',
    reason: 'Leo has had two hints and his closing h1 tag is still missing its final >.',
    code: "<body>\n  <h1>Leo's Page</h1\n</body>",
    hintsLeft: 0,
    said: {
      text: 'Nice start, Leo. Your title is inside an h1 tag. Look at the very end of your closing tag.',
      kind: 'hint', code_quote: '</h1', lesson_quote: 'Every tag you open needs a closing tag with a slash, like </h1>.',
    },
    reasoning: {
      trigger: 'pause', action: 'flag', ms: 1640,
      log: [
        { t: 310, tool: 'get_student_code', input: {}, result: { html: "<h1>Leo's Page</h1", empty: false }, ok: true },
        { t: 320, tool: 'run_checks', input: {}, result: 'Step 1: <h1> is opened and the closing tag </h1 is started but is missing its final >.', ok: true },
        { t: 330, tool: 'get_history', input: {}, result: { hints_given: 2, hints_left: 0, idle_seconds: 21 }, ok: true },
        { t: 1180, tool: 'speak_to_student', input: { kind: 'hint', text: 'Check the end of your closing tag again.' }, result: 'rejected: The hints for this student are used up. Use flag_teacher with a one-sentence reason.', ok: false },
        { t: 1640, tool: 'flag_teacher', input: { reason: 'Leo has had two hints and his closing h1 tag is still missing its final >.' }, result: 'accepted', ok: true },
      ],
    },
  },
  {
    ...working('maya', 'Maya', 2),
    hintsLeft: 2,
    said: {
      text: 'Good question, Maya. A paragraph goes inside a p tag, and it needs a closing tag too.',
      kind: 'answer', code_quote: '<h1>My Website</h1>', lesson_quote: 'A paragraph goes inside a p tag.',
    },
    reasoning: {
      trigger: 'question', action: 'speak', ms: 1810,
      log: [
        { t: 290, tool: 'get_student_code', input: {}, result: { html: '<h1>My Website</h1>', empty: false }, ok: true },
        { t: 300, tool: 'get_history', input: {}, result: { hints_given: 0, hints_left: 2 }, ok: true },
        { t: 1810, tool: 'speak_to_student', input: { kind: 'answer', lesson_quote: 'A paragraph goes inside a p tag.' }, result: 'accepted', ok: true },
      ],
    },
  },
  working('chiara', 'Chiara', 1),
  working('jamal', 'Jamal', 1),
  working('priya', 'Priya', 2),
  working('noah', 'Noah', 0),
  done('arhaan', 'Arhaan'),
  done('sofia', 'Sofia'),
];

const noop = () => {};
export const DEMO_VOICE: TeacherVoice = {
  stream: null, phase: 'recording', elapsed: 47, pending: 0, processing: null, error: '',
  note: 'Demo: this is what the page looks like while you teach.',
  start: async () => {}, stop: noop, pause: noop, resume: async () => {},
};
