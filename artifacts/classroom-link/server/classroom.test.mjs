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
  const spoken = [];
  createClassroom(io, { info() {}, error() {} }, { speak: async (text) => { spoken.push(text); return '/audio/test.mp3'; } });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;
  const teacher = connect(url);
  const student = connect(url);
  try {
    await Promise.all([teacher, student].map((s) => new Promise((r) => s.on('connect', r))));
    const got = new Promise((r) => student.on('steps:new', r));
    const said = new Promise((r) => student.on('fade:say', r));
    const joinAck = await student.emitWithAck('student:join', { studentId: 'maya', name: 'Maya' });
    assert.equal(joinAck.ok, true);
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

    // Fade says the first step to the student by name, with audio.
    const say = await said;
    assert.equal(say.text, 'Hi Maya! First, add a title to your page with an h1 tag.');
    assert.equal(say.audioUrl, '/audio/test.mp3');
    assert.equal(say.kind, 'step');
    assert.deepEqual(spoken, [say.text]);

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

test('voice: no key means text only, and cached clips are served as mp3', async () => {
  const { speak, mountVoice, hasVoice, _putClip } = await import('./voice.mjs');
  const saved = { k: process.env.ELEVENLABS_API_KEY, v: process.env.ELEVENLABS_VOICE_ID };
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  try {
    assert.equal(hasVoice(), false);
    assert.equal(await speak('Hi Maya!'), null);
    const { default: express } = await import('express');
    const app = express();
    mountVoice(app, '/');
    _putClip('abc', Buffer.from('fake-mp3'));
    const http = createServer(app);
    await new Promise((r) => http.listen(0, r));
    const base = `http://localhost:${http.address().port}`;
    const ok = await fetch(`${base}/audio/abc.mp3`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'audio/mpeg');
    assert.equal(await ok.text(), 'fake-mp3');
    assert.equal((await fetch(`${base}/audio/nope.mp3`)).status, 404);
    http.close();
  } finally {
    if (saved.k) process.env.ELEVENLABS_API_KEY = saved.k;
    if (saved.v) process.env.ELEVENLABS_VOICE_ID = saved.v;
  }
});

test('stt: audio in, words out; clear errors for no key and no audio', async () => {
  const { mountStt } = await import('./stt.mjs');
  const { default: express } = await import('express');
  const saved = process.env.ELEVENLABS_API_KEY;
  const app = express();
  let sent = null;
  mountStt(app, '/', null, {
    fetchImpl: async (url, init) => {
      sent = { url, key: init.headers['xi-api-key'], model: init.body.get('model_id'), file: init.body.get('file') };
      return new Response(JSON.stringify({ text: ' Add a title with an h1 tag. ' }), { status: 200 });
    },
  });
  const http = createServer(app);
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}/stt`;
  const audio = Buffer.alloc(1000, 1);
  const post = (body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body });
  try {
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal((await post(audio)).status, 503);
    process.env.ELEVENLABS_API_KEY = 'test-key';
    assert.equal((await post(Buffer.alloc(10))).status, 400);
    const ok = await post(audio);
    assert.deepEqual(await ok.json(), { ok: true, text: 'Add a title with an h1 tag.' });
    assert.equal(sent.key, 'test-key');
    assert.equal(sent.model, 'scribe_v1');
    assert.equal(sent.file.size, 1000);
    assert.equal(sent.file.name, 'speech.webm');
  } finally {
    http.close();
    if (saved) process.env.ELEVENLABS_API_KEY = saved; else delete process.env.ELEVENLABS_API_KEY;
  }
});
