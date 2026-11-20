// Run from artifacts/classroom-link: node --test server/studentAgent.test.mjs
// The model is replaced by a script here, so this tests the rules the code
// enforces (grounding, order, limits), not the model's judgement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { runStudentAgent, fallbackLine } from './studentAgent.mjs';
import { runChecks, tagForStep, currentStepIndex } from './checks.mjs';
import { createClassroom } from './classroom.mjs';

const STEPS = [
  { id: 's1', text: 'Type a title for your website in an h1 tag.' },
  { id: 's2', text: 'Add a paragraph under your title.' },
];
const LESSON = 'HTML is made of tags. Every tag you open needs a closing tag with a slash, like </h1>.\nAdd a title to your page with an h1 tag, then add a paragraph under it.';
const LEO = "<h1>Leo's Page</h1";

/** A stand-in for the Anthropic client that replays tool calls turn by turn. */
function scripted(turns) {
  const seen = [];
  let i = 0;
  return {
    seen,
    messages: {
      create: async (params) => {
        seen.push(structuredClone(params));
        const calls = turns[i++] ?? [];
        return {
          stop_reason: 'tool_use',
          content: calls.map(([name, input], n) => ({ type: 'tool_use', id: `t${i}_${n}`, name, input: input ?? {} })),
        };
      },
    },
  };
}
const ctx = (over = {}) => ({ name: 'Leo', html: LEO, css: '', steps: STEPS, lesson: LESSON, hints: [], idleSeconds: 21, trigger: 'pause', ...over });

test('checks: Leo is missing the last > on his closing tag; paragraph step checks <p>', () => {
  assert.equal(tagForStep(STEPS[0].text), 'h1');
  assert.equal(tagForStep(STEPS[1].text), 'p');
  const [h1, p] = runChecks(STEPS, LEO);
  assert.equal(h1.pass, false);
  assert.match(h1.detail, /missing its final >/);
  assert.equal(p.pass, false);
  assert.equal(currentStepIndex(STEPS, LEO), 0);
  assert.equal(currentStepIndex(STEPS, "<h1>Maya's Site</h1>"), 1);
  assert.equal(currentStepIndex(STEPS, '<h1>Hi</h1>\n<p>Welcome</p>'), 2);
  assert.equal(runChecks(STEPS, '<h1></h1>')[0].pass, false);
});

test('a grounded hint is accepted and carries exact quotes', async () => {
  const client = scripted([
    [['get_student_code'], ['run_checks'], ['get_history']],
    [['speak_to_student', {
      text: 'Nice, your title is in an h1 tag. Look at the very end of your closing tag.',
      kind: 'hint', code_quote: '</h1', lesson_quote: 'Every tag you open needs a closing tag with a slash',
    }]],
  ]);
  const out = await runStudentAgent(ctx(), { client });
  assert.equal(out.action, 'speak');
  assert.equal(out.kind, 'hint');
  assert.equal(out.code_quote, '</h1');
  assert.deepEqual(out.log.map((l) => l.tool), ['get_student_code', 'run_checks', 'get_history', 'speak_to_student']);
  assert.equal(client.seen[0].tool_choice.type, 'any');
  assert.equal(client.seen[0].model, 'claude-haiku-5-5');
});

test('a made-up lesson quote is rejected, and the retry with an exact quote passes', async () => {
  const client = scripted([
    [['get_student_code']],
    [['speak_to_student', { text: 'Your title is there. Check the end of the line.', kind: 'hint', code_quote: '</h1', lesson_quote: 'Tags always come in pairs' }]],
    [['speak_to_student', { text: 'Your title is there. Check the end of the line.', kind: 'hint', code_quote: '</h1', lesson_quote: 'like </h1>' }]],
  ]);
  const out = await runStudentAgent(ctx(), { client });
  assert.equal(out.action, 'speak');
  const rejected = out.log.find((l) => !l.ok);
  assert.match(rejected.result, /lesson_quote does not appear/);
  // The rejection went back to the model as an error tool_result.
  const retry = client.seen[2].messages.at(-1).content[0];
  assert.equal(retry.is_error, true);
});

test('acting before reading the code, saying "wrong", a made-up code quote, and an early cheer are all rejected', async () => {
  const say = (over) => ['speak_to_student', { text: 'Your h1 is started.', kind: 'hint', code_quote: '<h1>', lesson_quote: 'HTML is made of tags', ...over }];
  const client = scripted([
    [say()],
    [['get_student_code']],
    [say({ text: 'That is wrong.' })],
    [say({ code_quote: '<h1>Leo Page</h1>' })],
    [say({ kind: 'cheer', text: 'You did it!' })],
    [['wait', { reason: 'Leo is still typing.' }]],
  ]);
  const out = await runStudentAgent(ctx(), { client });
  assert.equal(out.action, 'wait');
  const reasons = out.log.filter((l) => !l.ok).map((l) => l.result);
  assert.equal(reasons.length, 4);
  assert.match(reasons[0], /Read the student's code/);
  assert.match(reasons[1], /Do not say/);
  assert.match(reasons[2], /code_quote does not appear/);
  assert.match(reasons[3], /cannot be a cheer/);
});

test('when hints are used up, another hint is rejected and the agent flags the teacher', async () => {
  const client = scripted([
    [['get_student_code'], ['get_history']],
    [['speak_to_student', { text: 'Look at your closing tag again.', kind: 'hint', code_quote: '</h1', lesson_quote: 'like </h1>' }]],
    [['flag_teacher', { reason: 'Leo has had two hints and his closing h1 tag is still missing its >.' }]],
  ]);
  const out = await runStudentAgent(ctx({ hints: ['hint one', 'hint two'] }), { client });
  assert.equal(out.action, 'flag');
  assert.match(out.reason, /closing h1 tag/);
  assert.match(out.log.find((l) => !l.ok).result, /hints for this student are used up/);
  const history = out.log.find((l) => l.tool === 'get_history').result;
  assert.equal(history.hints_left, 0);
});

test('a question the lesson does not cover can be answered only with not_covered', async () => {
  const client = scripted([
    [['get_student_code'], ['get_history']],
    [['speak_to_student', { text: 'Good question. Your teacher has not covered colors yet.', kind: 'answer', code_quote: '<h1>', lesson_quote: '' }]],
    [['speak_to_student', { text: 'Good question. Your teacher has not covered colors yet.', kind: 'answer', code_quote: '<h1>', lesson_quote: '', not_covered: true }]],
  ]);
  const out = await runStudentAgent(ctx({ trigger: 'question', question: 'How do I make it purple?' }), { client });
  assert.equal(out.action, 'speak');
  assert.equal(out.kind, 'answer');
  assert.match(client.seen[0].messages[0].content, /How do I make it purple/);
});

test('no decision in 6 turns, or no key, gives the labelled fallback line', async () => {
  const loop = scripted(Array.from({ length: 10 }, () => [['get_student_code']]));
  const out = await runStudentAgent(ctx(), { client: loop });
  assert.equal(out.action, 'fallback');
  assert.equal(out.kind, 'fallback');
  assert.equal(out.text, fallbackLine('Leo'));
  assert.equal(loop.seen.length, 6);

  const saved = { k: process.env.ANTHROPIC_API_KEY, t: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    assert.equal((await runStudentAgent(ctx())).error, 'ANTHROPIC_API_KEY is not set');
  } finally {
    if (saved.k) process.env.ANTHROPIC_API_KEY = saved.k;
    if (saved.t) process.env.ANTHROPIC_AUTH_TOKEN = saved.t;
  }
});

test('sockets: a pause produces fade:say for the student; a flag shows "Leo needs you" with his code', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const http = createServer();
  const io = new Server(http);
  const decisions = [
    { action: 'speak', kind: 'hint', text: 'Nice h1. Look at the end of your closing tag.', code_quote: '</h1', lesson_quote: 'like </h1>', log: [{ tool: 'get_student_code' }], ms: 5 },
    { action: 'flag', reason: 'Leo is still missing the > on his closing tag.', log: [{ tool: 'flag_teacher' }], ms: 5 },
  ];
  const woke = [];
  createClassroom(io, { info() {}, error() {} }, {
    speak: async () => '/audio/x.mp3',
    agent: async (c) => { woke.push(c); return decisions.shift(); },
  });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const leo = connect(url);
  const next = (socket, event, pick = () => true) => new Promise((r) => { const h = (p) => { if (pick(p)) { socket.off(event, h); r(p); } }; socket.on(event, h); });
  try {
    await Promise.all([teacher, leo].map((s) => new Promise((r) => s.on('connect', r))));
    await teacher.emitWithAck('lesson:chunk', { text: LESSON });
    await teacher.emitWithAck('task:spoken', { text: 'Add a title to your page with an h1 tag, then add a paragraph under it.' });
    await leo.emitWithAck('student:join', { studentId: 'leo', name: 'Leo' });
    const working = next(teacher, 'student:update', (u) => u.studentId === 'leo' && u.status === 'working' && !u.said);
    leo.emit('code:update', { studentId: 'leo', html: LEO, css: '', preset: true });
    assert.equal((await working).sentence, 'Leo is on step 1 of 2');

    const said = next(leo, 'fade:say', (p) => p.kind === 'hint');
    const update = next(teacher, 'student:update', (u) => Boolean(u.said));
    assert.deepEqual(await leo.emitWithAck('student:idle', { studentId: 'leo' }), { ok: true, action: 'speak' });
    const say = await said;
    assert.deepEqual(Object.keys(say).sort(), ['audioUrl', 'code_quote', 'kind', 'lesson_quote', 'text']);
    assert.equal(say.audioUrl, '/audio/x.mp3');
    assert.equal((await update).reasoning.log.length, 1);
    assert.equal(woke[0].html, LEO);
    assert.match(woke[0].lesson, /closing tag with a slash/);

    const flagged = next(teacher, 'student:update', (u) => u.status === 'needs_help');
    const told = next(leo, 'fade:say', (p) => p.kind === 'flag');
    await leo.emitWithAck('hint:request', { studentId: 'leo' });
    const flag = await flagged;
    assert.match((await told).text, /asked your teacher/);
    assert.equal(flag.sentence, 'Leo needs you');
    assert.equal(flag.code, LEO);
    assert.match(flag.reason, /closing tag/);
    assert.deepEqual(woke[1].hints, ['Nice h1. Look at the end of your closing tag.']);
    assert.deepEqual(Object.keys(flag).filter((k) => ['studentId', 'name', 'stepIndex', 'status', 'sentence'].includes(k)).length, 5);
  } finally {
    teacher.close(); leo.close(); io.close();
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('a question or a hint request never ends in silence: wait is rejected', async () => {
  const client = scripted([
    [['get_student_code'], ['get_history']],
    [['wait', { reason: 'Leo seems fine.' }]],
    [['speak_to_student', { text: 'Good question. A closing tag has a slash.', kind: 'answer', code_quote: '</h1', lesson_quote: 'like </h1>' }]],
  ]);
  const out = await runStudentAgent(ctx({ trigger: 'question', question: 'What is a closing tag?' }), { client });
  assert.equal(out.action, 'speak');
  assert.match(out.log.find((l) => !l.ok).result, /do not wait/);
  // A plain pause may still wait.
  const quiet = scripted([[['get_student_code']], [['wait', { reason: 'Still typing.' }]]]);
  assert.equal((await runStudentAgent(ctx(), { client: quiet })).action, 'wait');
});

test('a question is always answered: no flag, no hint budget, even when hints are used up', async () => {
  const client = scripted([
    [['get_student_code'], ['get_history']],
    [['flag_teacher', { reason: 'Hints are used up.' }]],
    [['speak_to_student', { text: 'The body is the part between the body tags.', kind: 'hint', code_quote: '</h1', lesson_quote: 'HTML is made of tags' }]],
  ]);
  const out = await runStudentAgent(ctx({ trigger: 'question', question: 'How do I find the body?', hints: ['one', 'two'] }), { client });
  assert.equal(out.action, 'speak');
  assert.equal(out.kind, 'answer');
  assert.match(out.log.find((l) => !l.ok).result, /Answer it first/);
});

test('progress: color steps are checked, and finishing a step makes CoTeach AI give the next one', async () => {
  const three = [...STEPS, { id: 's3', text: 'Change the text color to purple.' }];
  assert.equal(currentStepIndex(three, '<h1>Hi</h1><p>Yo</p>', 'h1 { color: blue; }'), 2);
  assert.equal(currentStepIndex(three, '<h1>Hi</h1><p>Yo</p>', 'h1 { color: purple; }'), 3);

  const http = createServer();
  const io = new Server(http);
  createClassroom(io, { info() {}, error() {}, warn() {} }, { speak: async () => null, agent: async () => ({ action: 'wait', log: [], ms: 1 }) });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const maya = connect(url);
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  try {
    await Promise.all([teacher, maya].map((s) => new Promise((r) => s.on('connect', r))));
    await teacher.emitWithAck('task:spoken', { text: 'Add a title to your page with an h1 tag, then add a paragraph under it.' });
    await maya.emitWithAck('student:join', { studentId: 'maya', name: 'Maya' });
    const says = [];
    maya.on('fade:say', (p) => says.push(p));
    const wait = (n) => new Promise((r) => { const t = setInterval(() => { if (says.length >= n) { clearInterval(t); r(); } }, 20); });
    maya.emit('code:update', { studentId: 'maya', html: '<h1>My Website</h1>', css: '' });
    await wait(1);
    assert.match(says.at(-1).text, /^Nice work, Maya! Step 1 is done\. Next, add a paragraph/);
    assert.equal(says.at(-1).kind, 'step');
    maya.emit('code:update', { studentId: 'maya', html: '<h1>My Website</h1><p>Hello</p>', css: '' });
    await wait(2);
    assert.equal(says.at(-1).text, 'You did it, Maya! You finished every step.');
    assert.equal(says.at(-1).kind, 'cheer');
  } finally {
    teacher.close(); maya.close(); io.close();
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  }
});
