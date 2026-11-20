// Run from artifacts/classroom-link: node --test server/classroom.test.mjs
// Covers the parts that don't need the network: merging, fallback, socket flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { mergeSteps, fallbackSteps } from './stepsAgent.mjs';
import { createClassroom } from './classroom.mjs';

test('mergeSteps keeps id and progress for steps the model kept', () => {
  const current = [
    { id: 'a', text: 'Type a title in an h1 tag.', done: true },
    { id: 'b', text: 'Add a paragraph.', done: false },
  ];
  const merged = mergeSteps(
    [
      { id: 'a', text: 'Type a title in an h1 tag.' },
      { id: 'new', text: 'Make your title purple.' },
      { id: 'b', text: 'Add a paragraph under your title.' },
    ],
    current,
  );
  assert.equal(merged.length, 3);
  assert.deepEqual(merged[0], current[0]);
  assert.equal(merged[1].done, false);
  assert.ok(!['a', 'b', 'new'].includes(merged[1].id));
  assert.deepEqual(merged[2], { id: 'b', text: 'Add a paragraph under your title.', done: false });
});

test('mergeSteps never reuses one id twice and drops empty steps', () => {
  const merged = mergeSteps(
    [{ id: 'a', text: 'One.' }, { id: 'a', text: 'Two.' }, { id: 'new', text: '  ' }],
    [{ id: 'a', text: 'One.', done: true }],
  );
  assert.equal(merged.length, 2);
  assert.notEqual(merged[0].id, merged[1].id);
  assert.equal(merged[1].done, false);
});

test('fallbackSteps splits the demo sentence into two steps', () => {
  const steps = fallbackSteps('Add a title to your page with an h1 tag, then add a paragraph under it.');
  assert.deepEqual(steps.map((s) => s.text), ['Add a title to your page with an h1 tag.', 'Add a paragraph under it.']);
  assert.ok(steps.every((s) => s.done === false && s.id));
});

test('task:spoken from the teacher reaches a student as steps:new', async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY; // force the offline path
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const http = createServer();
  const io = new Server(http);
  createClassroom(io, { info() {}, error() {} });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const student = connect(url);
  try {
    await Promise.all([teacher, student].map((s) => new Promise((r) => s.on('connect', r))));
    const got = new Promise((r) => student.on('steps:new', r));
    const lessonAck = await teacher.emitWithAck('lesson:chunk', { text: 'HTML uses tags like h1 for titles.' });
    assert.deepEqual(lessonAck, { ok: true, chunks: 1 });
    const taskAck = await teacher.emitWithAck('task:spoken', {
      text: 'Add a title to your page with an h1 tag, then add a paragraph under it.',
    });
    const { steps } = await got;
    assert.equal(taskAck.ok, true);
    assert.equal(taskAck.source, 'fallback');
    assert.equal(steps.length, 2);
    assert.deepEqual(Object.keys(steps[0]).sort(), ['done', 'id', 'text']);

    // A student who joins late gets the current steps on connect.
    const late = connect(url);
    const lateSteps = await new Promise((r) => late.on('steps:new', r));
    assert.deepEqual(lateSteps.steps, steps);
    late.close();

    const empty = await teacher.emitWithAck('task:spoken', { text: '   ' });
    assert.equal(empty.ok, false);
  } finally {
    teacher.close();
    student.close();
    io.close();
    if (saved.key) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  }
});
