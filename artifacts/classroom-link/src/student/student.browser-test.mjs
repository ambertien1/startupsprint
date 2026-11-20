// Run against the existing development server with a disposable Chromium CDP
// session on port 9222. No server routes, dependencies, or app test hooks needed.
import assert from 'node:assert/strict';

const target = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const packet = JSON.parse(data);
  if (!packet.id) return;
  const entry = pending.get(packet.id);
  pending.delete(packet.id);
  if (packet.error) entry.reject(new Error(JSON.stringify(packet.error)));
  else entry.resolve(packet.result);
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
}
async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
const byId = (id) => `document.querySelector('[data-testid="${id}"]')`;
const documentHtml = (body) => `<!doctype html><html><head><title>My Website</title></head><body>${body}</body></html>`;
async function fill(id, value) {
  await evaluate(`(() => {
    const node = ${byId(id)};
    const prototype = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
async function receive(event, payload) {
  await evaluate(`window.__sockets.find(s => s.url.includes('/socket.io') && s.readyState === 1)
    .dispatchEvent(new MessageEvent('message', {data:${JSON.stringify(`42${JSON.stringify([event, payload])}`)}}))`);
}
async function sent(event) {
  return evaluate(`window.__sent.filter(s => typeof s === 'string' && s.startsWith('42')).map(s => {
    try {return JSON.parse(s.slice(2))} catch {return []}
  }).filter(s => s[0] === ${JSON.stringify(event)}).map(s => s[1])`);
}
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__sockets = []; window.__sent = []; window.__spoken = []; window.__audio = [];
  const NativeWS = window.WebSocket;
  window.WebSocket = class extends NativeWS {
    constructor(...args) {super(...args); window.__sockets.push(this)}
    send(data) {window.__sent.push(data); return super.send(data)}
  };
  speechSynthesis.speak = utterance => window.__spoken.push(utterance.text);
  speechSynthesis.cancel = () => {};
  window.Audio = class { constructor(url) {this.url=url} play() {window.__audio.push(this.url);return Promise.resolve()} pause() {} };
  const nativeTimeout = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  const idleTimers = new Map(); window.__idleTimers = idleTimers;
  window.setTimeout = (callback, delay, ...args) => {
    const id = nativeTimeout(callback, delay, ...args);
    // Advance only the student's idle timer, not Socket.IO's heartbeat timeout.
    if (String(callback).includes('student:idle')) idleTimers.set(id, callback);
    return id;
  };
  window.clearTimeout = id => {idleTimers.delete(id); nativeClear(id)};
  // Use real elapsed time: Socket.IO also reads Date.now for its heartbeat.
  window.__advanceIdle = () => new Promise(resolve => nativeTimeout(resolve, 20100));
` });

try {
  await cdp('Page.navigate', { url: 'http://127.0.0.1:80/student?name=Leo' });
  await until(`${byId('status-connection')}?.textContent.includes('Connected')`);
  await until(`window.__sockets.some(s => s.url.includes('/socket.io') && s.readyState === 1)`);
  assert.match(await evaluate(`${byId('input-html')}.value`), /<body>\s*<h1>Leo's Page<\/h1\s*<\/body>/);
  assert.equal(await evaluate(`${byId('step-s1')}.dataset.done`), 'false');
  assert.equal(await evaluate('window.__spoken.length'), 0);
  await evaluate(`${byId('input-html')}.click()`);
  assert.equal(await evaluate('window.__spoken[0]'), 'Hi Leo! First, type a title in an h1 tag.');

  await evaluate(`${byId('file-style')}.click()`);
  assert.equal(await evaluate(`document.activeElement === ${byId('input-css')}`), true);
  await evaluate(`${byId('file-index')}.click()`);
  assert.equal(await evaluate(`document.activeElement === ${byId('input-html')}`), true);
  assert.ok(await evaluate(`document.querySelectorAll('.tk-tag').length > 0`));
  assert.ok(await evaluate(`document.querySelectorAll('.fs-gutter div').length > 10`));
  await evaluate(`${byId('button-dismiss-fade')}.click()`);
  assert.equal(await evaluate(`document.querySelector('.fs-pop').dataset.open`), 'false');
  await fill('input-html', documentHtml("<h1>Leo's Page</h1>"));
  await until(`${byId('step-s1')}.dataset.done === 'true'`);
  assert.equal(await evaluate(`${byId('step-s2')}.getAttribute('aria-current')`), 'step');
  assert.equal(await evaluate(`${byId('text-fade-message')}.textContent`), 'Nice! Your title is there.');
  assert.equal(await evaluate(`document.querySelector('.fs-pop').dataset.open`), 'true');
  await fill('input-html', documentHtml("<h1>Leo's Page</h1><p>Hello world</p>"));
  await until(`${byId('step-s2')}.dataset.done === 'true'`);
  assert.match(await evaluate(`${byId('text-fade-message')}.textContent`), /finished every step/);
  assert.equal(await evaluate(`${byId('frame-preview')}.getAttribute('sandbox')`), '');
  await fill('input-css', 'h1 { color: teal; }');
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.deepEqual((await sent('code:update')).at(-1), {
    studentId: 'leo', html: documentHtml("<h1>Leo's Page</h1><p>Hello world</p>"), css: 'h1 { color: teal; }',
  });

  await receive('steps:new', { steps: [
    { id: 's1', text: 'Your title', done: false },
    { id: 'next', text: 'Try the next task', done: false },
  ] });
  await until(`${byId('step-next')}?.dataset.current === 'true'`);
  assert.equal(await evaluate(`${byId('step-s1')}.dataset.done`), 'true');
  await receive('fade:say', { text: 'Take your time.', audioUrl: null, kind: 'hint', code_quote: '<h1>', lesson_quote: 'A title' });
  await until(`${byId('text-fade-message')}.textContent === 'Take your time.'`);
  assert.equal(await evaluate('window.__spoken.at(-1)'), 'Take your time.');
  await evaluate(`${byId('button-say-again')}.click()`);
  assert.equal(await evaluate('window.__spoken.at(-1)'), 'Take your time.');
  await receive('fade:say', { text: 'Here is your voice hint.', audioUrl: '/student-voice.mp3', kind: 'hint' });
  await until('window.__audio.length > 0');

  await evaluate(`${byId('button-hint')}.click()`);
  await fill('input-question', 'How do I add color?');
  await evaluate(`${byId('button-ask')}.click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await sent('question')).slice(-2), [
    { studentId: 'leo', text: 'Can I have a hint?' },
    { studentId: 'leo', text: 'How do I add color?' },
  ]);
  await evaluate(`${byId('button-talk-to-fade')}.click()`);
  await until(`${byId('text-question-note')}.textContent.includes('Type your question')`);
  assert.equal(await evaluate(`${byId('button-hold-to-ask')} === null`), true);
  assert.equal(await evaluate(`${byId('button-talk-to-fade')}.getAttribute('aria-pressed')`), 'false');

  await evaluate('window.__advanceIdle()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await sent('student:idle')).length, 1);
  assert.equal((await sent('student:idle'))[0].stepIndex, 1);
  assert.ok((await sent('student:idle'))[0].idleSeconds >= 20);
  await receive('steps:new', { steps: [{ id: 'next', text: 'Keep your place', done: false }] });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await sent('student:idle')).length, 1);
  await fill('input-css', 'h1 { color: blue; }');
  await until('window.__idleTimers.size > 0');
  await evaluate('window.__advanceIdle()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await sent('student:idle')).length, 2);

  const checks = await evaluate(`(async () => {
    const {checkSteps, DEMO_STEPS, buildPreview} = await import('/src/student/lesson.ts');
    return {
      blank: checkSteps(DEMO_STEPS, '<body><h1> </h1><p> </p></body>').map(s => s.done),
      before: checkSteps(DEMO_STEPS, '<body><p>Before</p><h1>Title</h1></body>').map(s => s.done),
      comments: checkSteps(DEMO_STEPS, '<body><!-- <h1>Title</h1> --></body>').map(s => s.done),
      outside: checkSteps(DEMO_STEPS, '<head><h1>T</h1><p>P</p></head><body></body>').map(s => s.done),
      unknown: checkSteps([{id:'extra',text:'Extra',done:false}], '<body><h1>T</h1></body>').map(s => s.done),
      escapedCss: !buildPreview('', '</style><script>alert(1)</script>').includes('</style><script>'),
    };
  })()`);
  assert.deepEqual(checks, { blank: [false, false], before: [true, false], comments: [false, false], outside: [false, false], unknown: [false], escapedCss: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await cdp('Page.navigate', { url: 'http://127.0.0.1:80/student' });
  await until(`${byId('text-student-name')}?.textContent === 'Maya'`);
  assert.match(await evaluate(`${byId('input-html')}.value`), /<title>My Website<\/title>/);
  assert.match(await evaluate(`${byId('input-html')}.value`), /<body>\s*<\/body>/);
  assert.match(await evaluate(`${byId('input-css')}.value`), /font-family/);
  console.log('PASS: dark editor focus, syntax colors and gutters, skeletons, Leo and Maya identity, body-only checks/cheers, popup dismissal, socket payloads, speech/replay, Talk fallback, idle/reset, preview isolation, and mobile fit.');
} finally {
  await cdp('Page.close');
  ws.close();
}
