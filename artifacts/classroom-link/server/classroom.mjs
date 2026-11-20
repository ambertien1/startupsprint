// Classroom socket events from CLAUDE.md. All state is in memory.
// Owned by the teacher + server half.
import { makeSteps } from './stepsAgent.mjs';

const MAX_TEXT = 4000;

export function createClassroom(io, logger) {
  const state = {
    lesson: [], // what the teacher has said while teaching, in order
    steps: [], // [{ id, text, done }]
  };
  let queue = Promise.resolve(); // one task rewrite at a time, in order

  const clean = (payload) => {
    const text = typeof payload === 'string' ? payload : payload?.text;
    return typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
  };
  const ack = (fn) => (typeof fn === 'function' ? fn : () => {});

  io.on('connection', (socket) => {
    // A student who joins late still gets the current steps.
    if (state.steps.length) socket.emit('steps:new', { steps: state.steps });

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
