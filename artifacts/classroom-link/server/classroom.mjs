// Classroom socket events from CLAUDE.md. All state is in memory.
// Owned by the teacher + server half.
import { makeSteps } from './stepsAgent.mjs';
import { speak as elevenSpeak } from './voice.mjs';

const MAX_TEXT = 4000;

export function createClassroom(io, logger, { speak = elevenSpeak, base = '/' } = {}) {
  const state = {
    students: new Map(), // socket.id -> { studentId, name }
    lesson: [], // what the teacher has said while teaching, in order
    steps: [], // [{ id, text, done }]
  };
  let queue = Promise.resolve(); // one task rewrite at a time, in order

  const clean = (payload) => {
    const text = typeof payload === 'string' ? payload : payload?.text;
    return typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
  };
  const ack = (fn) => (typeof fn === 'function' ? fn : () => {});

  // Fade says the student's current step aloud, by name. Text always goes out;
  // audioUrl is null when voice isn't available.
  async function sayCurrentStep(socket, { greet }) {
    const student = state.students.get(socket.id);
    const index = state.steps.findIndex((s) => !s.done);
    if (!student || index === -1) return;
    const step = state.steps[index];
    const body = `${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}`;
    const text = greet && index === 0 ? `Hi ${student.name}! First, ${body}` : `${student.name}, next, ${body}`;
    const audioUrl = await speak(text, { base, logger });
    socket.emit('fade:say', { text, audioUrl, kind: 'step', code_quote: '', lesson_quote: '' });
  }
  const sayToAllStudents = () =>
    Promise.all(
      [...state.students.keys()].map((id) => {
        const s = io.sockets.sockets.get(id);
        return s ? sayCurrentStep(s, { greet: true }).catch((err) => logger.error({ err }, 'fade:say failed')) : null;
      }),
    );

  io.on('connection', (socket) => {
    // A student who joins late still gets the current steps.
    if (state.steps.length) socket.emit('steps:new', { steps: state.steps });

    // Student pages introduce themselves so Fade can use their name.
    socket.on('student:join', (payload, acknowledge) => {
      const name = String(payload?.name || '').trim().slice(0, 40);
      const studentId = String(payload?.studentId || '').trim().slice(0, 40) || socket.id;
      if (!name) return ack(acknowledge)({ ok: false, error: 'No name.' });
      state.students.set(socket.id, { studentId, name });
      ack(acknowledge)({ ok: true, studentId, steps: state.steps });
      sayCurrentStep(socket, { greet: true }).catch((err) => logger.error({ err }, 'fade:say failed'));
    });
    socket.on('disconnect', () => state.students.delete(socket.id));

    socket.on('lesson:chunk', (payload, acknowledge) => {
      const text = clean(payload);
      if (!text) return ack(acknowledge)({ ok: false, error: 'No text.' });
      state.lesson.push(text);
      ack(acknowledge)({ ok: true, chunks: state.lesson.length });
    });

    socket.on('task:spoken', (payload, acknowledge) => {
      const reply = ack(acknowledge);
      const taskText = clean(payload);
      if (!taskText) return reply({ ok: false, error: 'No task text.' });
      queue = queue
        .then(async () => {
          const result = await makeSteps({
            taskText,
            lesson: state.lesson.join('\n'),
            currentSteps: state.steps,
          });
          logger.info(
            { source: result.source, ms: result.ms, steps: result.steps.length, question: result.question || undefined, error: result.error },
            'steps agent',
          );
          if (result.question) {
            // Unclear task: ask the teacher, change nothing for students.
            socket.emit('steps:question', { question: result.question });
            return reply({ ok: true, source: result.source, question: result.question, steps: state.steps, ms: result.ms });
          }
          state.steps = result.steps;
          io.emit('steps:new', { steps: state.steps });
          sayToAllStudents(); // not awaited: steps reach the screen first
          reply({ ok: true, source: result.source, steps: state.steps, ms: result.ms, error: result.error });
        })
        .catch((error) => {
          logger.error({ err: error }, 'task:spoken failed');
          reply({ ok: false, error: 'Could not make steps. Try again.' });
        });
    });
  });

  return state;
}
