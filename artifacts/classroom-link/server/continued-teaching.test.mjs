import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createClassroom } from './classroom.mjs';
import { makeSteps } from './stepsAgent.mjs';

const title = { id: 'title', text: 'Type a title in an h1 tag.', done: false };
const paragraph = { id: 'paragraph', text: 'Add a paragraph under your title.', done: false };
const link = { id: 'link', text: 'Add a link to your page.', done: false };
const htmlTitle = '<body><h1>My website</h1></body>';
const htmlParagraph = '<body><h1>My website</h1><p>Hello!</p></body>';
const htmlFinished = '<body><h1>My website</h1><p>Hello!</p><a href="/">Home</a></body>';
const logger = { info() {}, error() {} };
const waitFor = async (check) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for the classroom update');
};
const model = (steps, has_task = true) => ({
  hasCredentials: () => true,
  parse: async () => ({ stop_reason: 'end_turn', parsed_output: { steps, has_task, question: '' } }),
});

test('listen mode appends action steps when the agent detects a task but returns identical ids and texts', async () => {
  const currentSteps = [{ ...title, done: true }];
  let prompt;
  const result = await makeSteps({
    taskText: 'Now add a paragraph under your title.',
    currentSteps, mode: 'listen',
  }, {
    hasCredentials: () => true,
    parse: async request => {
      prompt = request.system;
      return { stop_reason: 'end_turn', parsed_output: { steps: [title], has_task: true, question: '' } };
    },
  });
  assert.match(prompt, /ADD its new steps AFTER the existing ones/);
  assert.match(prompt, /Keep ALL existing steps, in their order and with their existing ids/);
  assert.equal(result.source, 'fallback');
  assert.equal(result.hasTask, true);
  assert.match(result.error, /unchanged steps/);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(result.steps[0], currentSteps[0]);
  assert.match(result.steps[1].text, /paragraph/);
  assert.notEqual(result.steps[1].id, title.id);
});

test('listen mode uses the same safeguard when the current and model step lists are both empty', async () => {
  const result = await makeSteps({ taskText: 'Add a title in an h1 tag.', mode: 'listen' }, model([]));
  assert.equal(result.hasTask, true);
  assert.equal(result.source, 'fallback');
  assert.equal(result.steps.length, 1);
  assert.match(result.steps[0].text, /h1/);
});

test('listen mode keeps valid appended tasks, explicit corrections, and explanation-only replies', async () => {
  const currentSteps = [{ ...title, done: true }];
  const appended = await makeSteps({
    taskText: 'Add a paragraph under your title.', currentSteps, mode: 'listen',
  }, model([title, { ...paragraph, id: 'new' }]));
  assert.equal(appended.source, 'agent');
  assert.equal(appended.steps.length, 2);
  assert.deepEqual(appended.steps[0], currentSteps[0]);
  assert.notEqual(appended.steps[1].id, 'new');

  const corrected = await makeSteps({
    taskText: 'Use an h2 instead of an h1.', currentSteps, mode: 'listen',
  }, model([{ id: title.id, text: 'Type a title in an h2 tag.' }]));
  assert.equal(corrected.source, 'agent');
  assert.equal(corrected.steps.length, 1);
  assert.equal(corrected.steps[0].id, title.id);
  assert.match(corrected.steps[0].text, /h2/);

  const explanation = await makeSteps({
    taskText: 'A paragraph is a group of sentences.', currentSteps, mode: 'listen',
  }, model([title], false));
  assert.equal(explanation.source, 'agent');
  assert.equal(explanation.hasTask, false);
  assert.deepEqual(explanation.steps, currentSteps);
});

test('unchanged-task safeguard does not invent actions from explanation sentences', async () => {
  const currentSteps = [title];
  const result = await makeSteps({
    taskText: 'HTML tags describe the page.', currentSteps, mode: 'listen',
  }, model(currentSteps));
  assert.equal(result.source, 'fallback');
  assert.equal(result.hasTask, false);
  assert.deepEqual(result.steps, currentSteps);
});

test('continued teaching announces each student’s own unfinished step and refreshes teacher counts for both event paths', async () => {
  const http = createServer();
  const io = new Server(http);
  const calls = [];
  const state = createClassroom(io, logger, {
    speak: async () => null,
    stepsAgent: async ({ mode, currentSteps }) => {
      calls.push(mode || 'task');
      const steps = currentSteps.length ? [...currentSteps, link] : [title, paragraph];
      return { steps, source: 'agent', hasTask: true, question: '', ms: 1 };
    },
  });
  await new Promise(resolve => http.listen(0, resolve));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const maya = connect(url);
  const leo = connect(url);
  const ava = connect(url);
  const spoken = { maya: [], leo: [], ava: [] };
  const updates = [];
  teacher.on('student:update', update => updates.push(update));
  for (const [id, socket] of Object.entries({ maya, leo, ava })) socket.on('fade:say', say => spoken[id].push(say));
  try {
    await Promise.all([teacher, maya, leo, ava].map(socket => new Promise(resolve => socket.on('connect', resolve))));
    for (const [studentId, socket] of Object.entries({ maya, leo, ava })) {
      await socket.emitWithAck('student:join', { studentId, name: studentId[0].toUpperCase() + studentId.slice(1) });
    }
    maya.emit('code:update', { studentId: 'maya', html: htmlTitle, css: '' });
    leo.emit('code:update', { studentId: 'leo', html: htmlParagraph, css: '' });
    await waitFor(() => state.work.get('maya').html === htmlTitle && state.work.get('leo').html === htmlParagraph);
    updates.length = 0;

    const first = await teacher.emitWithAck('lesson:chunk', { text: 'Add a title and then add a paragraph.' });
    assert.equal(first.task, true);
    await waitFor(() => spoken.maya.length === 1 && spoken.ava.length === 1 && updates.length >= 3);
    assert.equal(spoken.maya[0].text, 'Maya, next, add a paragraph under your title.');
    assert.equal(spoken.ava[0].text, 'Hi Ava! First, type a title in an h1 tag.');
    assert.equal(spoken.leo.length, 0, 'a student who completed every step hears nothing');
    assert.ok(state.steps.every(step => step.done === false), 'class-level done flags do not decide individual progress');
    assert.equal(updates.find(update => update.studentId === 'maya').stepIndex, 1);
    assert.equal(updates.find(update => update.studentId === 'leo').status, 'done');
    assert.equal(updates.find(update => update.studentId === 'ava').stepIndex, 0);

    updates.length = 0;
    const second = await teacher.emitWithAck('task:spoken', { text: 'Add a link to your page.' });
    assert.equal(second.steps.length, 3);
    await waitFor(() => spoken.leo.length === 1 && spoken.maya.length === 2 && spoken.ava.length === 2 && updates.length >= 3);
    assert.equal(spoken.leo[0].text, 'Leo, next, add a link to your page.');
    assert.equal(spoken.maya[1].text, 'Maya, next, add a paragraph under your title.');
    assert.equal(spoken.ava[1].text, 'Hi Ava! First, type a title in an h1 tag.');
    for (const studentId of ['maya', 'leo', 'ava']) {
      assert.ok(updates.some(update => update.studentId === studentId && /of 3/.test(update.sentence)));
    }
    assert.deepEqual(second.steps.slice(0, 2), [title, paragraph], 'existing step ids stay intact');
    assert.deepEqual(calls, ['listen', 'task']);

    // Rejoining with saved HTML must also use the student's progress, not class flags.
    maya.emit('code:update', { studentId: 'maya', html: htmlFinished, css: '' });
    await waitFor(() => state.work.get('maya').html === htmlFinished);
    const before = spoken.maya.length;
    await maya.emitWithAck('student:join', { studentId: 'maya', name: 'Maya' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(spoken.maya.length, before);
  } finally {
    teacher.close(); maya.close(); leo.close(); ava.close();
    await new Promise(resolve => io.close(resolve));
  }
});

test('a code change while voice is being generated cannot announce an already completed step', async () => {
  const http = createServer();
  const io = new Server(http);
  let finishVoice;
  const state = createClassroom(io, logger, {
    stepsAgent: async () => ({ steps: [title], source: 'agent', hasTask: true, question: '', ms: 1 }),
    speak: () => new Promise(resolve => { finishVoice = resolve; }),
  });
  await new Promise(resolve => http.listen(0, resolve));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const student = connect(url);
  let announcements = 0;
  // The stale "First, …" line for the finished step must not arrive. The newer
  // progress line ("You did it…") is expected and is not counted here.
  student.on('fade:say', (say) => { if (/\bFirst,/.test(say?.text || '')) announcements += 1; });
  try {
    await Promise.all([teacher, student].map(socket => new Promise(resolve => socket.on('connect', resolve))));
    await student.emitWithAck('student:join', { studentId: 'maya', name: 'Maya' });
    await teacher.emitWithAck('lesson:chunk', { text: 'Add a title in an h1 tag.' });
    await waitFor(() => finishVoice);
    student.emit('code:update', { studentId: 'maya', html: htmlTitle, css: '' });
    await waitFor(() => state.work.get('maya').html === htmlTitle);
    finishVoice(null);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(announcements, 0);
  } finally {
    teacher.close(); student.close();
    await new Promise(resolve => io.close(resolve));
  }
});
