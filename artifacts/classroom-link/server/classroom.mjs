// Classroom socket events from CLAUDE.md. All state is in memory.
// Owned by the teacher + server half.
import { makeSteps } from './stepsAgent.mjs';
import { speak as elevenSpeak } from './voice.mjs';
import { runStudentAgent, MAX_HINTS } from './studentAgent.mjs';
import { currentStepIndex } from './checks.mjs';

const MAX_TEXT = 4000;

export function createClassroom(io, logger, { speak = elevenSpeak, base = '/', agent = runStudentAgent, stepsAgent = makeSteps } = {}) {
  const state = {
    students: new Map(), // socket.id -> { studentId, name }
    work: new Map(), // studentId -> { name, html, css, hints, lastTyped, busy, flagged }
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
    if (!student) return;
    const steps = state.steps;
    const index = currentStepIndex(steps, state.work.get(student.studentId)?.html || '');
    if (index >= steps.length) return;
    const step = steps[index];
    const body = `${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}`;
    const text = greet && index === 0 ? `Hi ${student.name}! First, ${body}` : `${student.name}, next, ${body}`;
    const audioUrl = await speak(text, { base, logger });
    // A newer task or code edit can arrive while the audio is generated.
    if (state.steps !== steps || currentStepIndex(steps, state.work.get(student.studentId)?.html || '') !== index) return;
    socket.emit('fade:say', { text, audioUrl, kind: 'step', code_quote: '', lesson_quote: '' });
  }
  const workFor = (studentId, name) => {
    if (!state.work.has(studentId)) {
      state.work.set(studentId, { name: name || studentId, html: '', css: '', hints: [], lastTyped: Date.now(), busy: false, flagged: false });
    }
    const w = state.work.get(studentId);
    if (name) w.name = name;
    return w;
  };
  const socketsFor = (studentId) =>
    [...state.students.entries()].filter(([, s]) => s.studentId === studentId).map(([id]) => io.sockets.sockets.get(id)).filter(Boolean);

  // One plain sentence per student for the teacher page.
  function tellTeacher(studentId, extra = {}) {
    const w = state.work.get(studentId);
    if (!w) return;
    const stepIndex = currentStepIndex(state.steps, w.html);
    const total = state.steps.length;
    const status = w.flagged ? 'needs_help' : total && stepIndex >= total ? 'done' : 'working';
    const sentence =
      status === 'needs_help'
        ? `${w.name} needs you`
        : status === 'done'
          ? `${w.name} finished every step`
          : total
            ? `${w.name} is on step ${stepIndex + 1} of ${total}`
            : `${w.name} is ready`;
    io.emit('student:update', { studentId, name: w.name, stepIndex, status, sentence, ...extra });
  }

  // Wake the student agent. It decides; this only carries out the decision.
  async function wakeAgent(studentId, trigger, question = '') {
    const w = state.work.get(studentId);
    if (!w || w.busy) return { ok: false, error: 'Fade is already thinking.' };
    if (!state.steps.length && trigger !== 'question') return { ok: false, error: 'No steps yet.' };
    w.busy = true;
    try {
      const result = await agent({
        name: w.name,
        html: w.html,
        css: w.css,
        steps: state.steps.map(({ id, text }) => ({ id, text })),
        lesson: state.lesson.join('\n'),
        hints: w.hints,
        idleSeconds: (Date.now() - w.lastTyped) / 1000,
        trigger,
        question,
      });
      logger.info({ studentId, trigger, action: result.action, ms: result.ms, calls: result.log.length, error: result.error }, 'student agent');
      const reasoning = { trigger, action: result.action, ms: result.ms, log: result.log };
      if (result.action === 'speak' || result.action === 'fallback') {
        if (result.kind === 'hint') w.hints.push(result.text);
        const audioUrl = await speak(result.text, { base, logger });
        const say = {
          text: result.text,
          audioUrl,
          kind: result.kind,
          code_quote: result.code_quote || '',
          lesson_quote: result.lesson_quote || '',
        };
        for (const s of socketsFor(studentId)) s.emit('fade:say', say);
        tellTeacher(studentId, { said: say, hintsLeft: Math.max(0, MAX_HINTS - w.hints.length), reasoning });
      } else if (result.action === 'flag') {
        w.flagged = true;
        tellTeacher(studentId, { reason: result.reason, code: w.html, reasoning });
      } else {
        tellTeacher(studentId, { reasoning });
      }
      return { ok: true, action: result.action };
    } catch (error) {
      logger.error({ err: error }, 'student agent failed');
      return { ok: false, error: 'Fade could not help just now.' };
    } finally {
      w.busy = false;
    }
  }

  const sayToAllStudents = () =>
    Promise.all(
      [...state.students.keys()].map((id) => {
        const s = io.sockets.sockets.get(id);
        return s ? sayCurrentStep(s, { greet: true }).catch((err) => logger.error({ err }, 'fade:say failed')) : null;
      }),
    );

  function announceSteps() {
    io.emit('steps:new', { steps: state.steps });
    for (const studentId of state.work.keys()) tellTeacher(studentId);
    void sayToAllStudents(); // Speech must not delay step delivery or the acknowledgement.
  }

  io.on('connection', (socket) => {
    // A student who joins late still gets the current steps.
    if (state.steps.length) socket.emit('steps:new', { steps: state.steps });

    // Student pages introduce themselves so Fade can use their name.
    socket.on('student:join', (payload, acknowledge) => {
      const name = String(payload?.name || '').trim().slice(0, 40);
      const studentId = String(payload?.studentId || '').trim().slice(0, 40) || socket.id;
      if (!name) return ack(acknowledge)({ ok: false, error: 'No name.' });
      state.students.set(socket.id, { studentId, name });
      workFor(studentId, name);
      ack(acknowledge)({ ok: true, studentId, steps: state.steps });
      tellTeacher(studentId);
      sayCurrentStep(socket, { greet: true }).catch((err) => logger.error({ err }, 'fade:say failed'));
    });
    socket.on('disconnect', () => state.students.delete(socket.id));

    // The student's code as they type. Typing again clears a "needs you" flag.
    socket.on('code:update', (payload) => {
      const studentId = String(payload?.studentId || state.students.get(socket.id)?.studentId || '').slice(0, 40);
      if (!studentId) return;
      const w = workFor(studentId, state.students.get(socket.id)?.name || payload?.name);
      const html = String(payload?.html ?? '').slice(0, 20000);
      const css = String(payload?.css ?? '').slice(0, 20000);
      const changed = html !== w.html || css !== w.css;
      w.html = html;
      w.css = css;
      // preset: true loads a prepared starting point (demo) without counting as typing.
      if (changed && !payload?.preset) {
        w.lastTyped = Date.now();
        w.flagged = false;
      }
      tellTeacher(studentId);
    });

    // The student page reports a ~20s pause, or the student presses Hint.
    const onWake = (trigger) => (payload, acknowledge) => {
      const studentId = String(payload?.studentId || state.students.get(socket.id)?.studentId || '');
      if (!state.work.has(studentId)) return ack(acknowledge)({ ok: false, error: 'Unknown student.' });
      wakeAgent(studentId, trigger).then(ack(acknowledge));
    };
    socket.on('student:idle', onWake('pause'));
    socket.on('hint:request', onWake('hint'));

    // A question the student asked (typed, or spoken and transcribed by /stt).
    socket.on('question', (payload, acknowledge) => {
      const studentId = String(payload?.studentId || state.students.get(socket.id)?.studentId || '');
      const text = clean(payload);
      if (!state.work.has(studentId) || !text) return ack(acknowledge)({ ok: false, error: 'No question.' });
      wakeAgent(studentId, 'question', text).then(ack(acknowledge));
    });

    // The teacher went to help: clear the flag and give the hints back.
    socket.on('teacher:helped', (payload) => {
      const w = state.work.get(String(payload?.studentId || ''));
      if (!w) return;
      w.flagged = false;
      w.hints = [];
      tellTeacher(String(payload.studentId));
    });

    // The teacher teaching. The steps agent listens along and picks out any
    // task for the class, so she never has to mark it herself.
    socket.on('lesson:chunk', (payload, acknowledge) => {
      const reply = ack(acknowledge);
      const text = clean(payload);
      if (!text) return reply({ ok: false, error: 'No text.' });
      queue = queue
        .then(async () => {
          const result = await stepsAgent({ taskText: text, lesson: state.lesson.join('\n'), currentSteps: state.steps, mode: 'listen' });
          state.lesson.push(text);
          logger.info({ mode: 'listen', source: result.source, ms: result.ms, task: result.hasTask, steps: result.steps.length, error: result.error }, 'steps agent');
          if (result.hasTask) {
            state.steps = result.steps;
            announceSteps();
          }
          reply({ ok: true, chunks: state.lesson.length, task: result.hasTask, source: result.source, steps: state.steps, ms: result.ms, error: result.error });
        })
        .catch((error) => {
          logger.error({ err: error }, 'lesson:chunk failed');
          state.lesson.push(text);
          reply({ ok: true, chunks: state.lesson.length, task: false });
        });
    });

    socket.on('task:spoken', (payload, acknowledge) => {
      const reply = ack(acknowledge);
      const taskText = clean(payload);
      if (!taskText) return reply({ ok: false, error: 'No task text.' });
      queue = queue
        .then(async () => {
          const result = await stepsAgent({
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
          state.lesson.push(taskText); // the task is the teacher's words too
          state.steps = result.steps;
          announceSteps();
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
