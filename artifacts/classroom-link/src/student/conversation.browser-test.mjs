// Browser contract test: stub only the external SDK at the network boundary.
// No agent is contacted and no microphone audio leaves the browser.
import assert from 'node:assert/strict';

const target = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const waiting = new Map();
ws.addEventListener('message', async ({ data }) => {
  const packet = JSON.parse(data);
  if (packet.id) {
    const pending = waiting.get(packet.id);
    waiting.delete(packet.id);
    if (packet.error) pending.reject(new Error(JSON.stringify(packet.error)));
    else pending.resolve(packet.result);
  } else if (packet.method === 'Fetch.requestPaused') {
    const { requestId, request } = packet.params;
    try {
      const response = await cdp('Fetch.getResponseBody', { requestId });
      let body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString() : response.body;
      // A dummy public ID exists only in this disposable browser's module.
      body = body.replace('import.meta.env.VITE_ELEVENLABS_AGENT_ID', '"test-public-agent"');
      body = body.replace(/import \{ useConversation \} from ("[^"]+");/, `import { useConversation } from "/student-sdk-test.js";`);
      await cdp('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(body).toString('base64'),
      });
    } catch (error) {
      console.error(error);
      await cdp('Fetch.continueRequest', { requestId });
    }
  }
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
const selector = (id) => `document.querySelector('[data-testid="${id}"]')`;
const transformed = await fetch('http://127.0.0.1:80/src/student/useFadeConversation.ts').then((r) => r.text());
const reactPath = transformed.match(/from "(\/node_modules\/\.vite\/deps\/react\.js[^"]*)"/)?.[1];
assert.ok(reactPath);
const mock = `
import React from ${JSON.stringify(reactPath)};
window.__voice = { starts: [], contexts: [], messages: [], ends: 0 };
export function useConversation(options) {
  const callbacks = React.useRef(options); callbacks.current = options;
  const [status, setStatus] = React.useState('disconnected');
  const controls = React.useMemo(() => ({
    startSession(config) {
      window.__voice.starts.push(config);
      setStatus('connected');
      queueMicrotask(() => callbacks.current.onConnect?.({conversationId:'test-session'}));
    },
    endSession() { window.__voice.ends++; setStatus('disconnected'); callbacks.current.onDisconnect?.({reason:'user'}); },
    sendContextualUpdate(text) {window.__voice.contexts.push(text)},
    sendUserMessage(text) {window.__voice.messages.push(text)}
  }), []);
  window.__voice.callbacks = callbacks;
  return {...controls, status};
}`;
// Intercept the hook only; give its injected SDK module a data URL so it needs
// no app route, source edit, or test-only production export.
const mockUrl = `data:text/javascript;base64,${Buffer.from(mock.replace(
  JSON.stringify(reactPath), JSON.stringify(`http://127.0.0.1:80${reactPath}`),
)).toString('base64')}`;
await cdp('Page.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/src/student/useFadeConversation.ts*', requestStage: 'Response' }] });
// Replace the placeholder specifier in the intercepted response.
const originalSend = ws.send.bind(ws);
ws.send = (data) => {
  const packet = JSON.parse(data);
  if (packet.method === 'Fetch.fulfillRequest') {
    const body = Buffer.from(packet.params.body, 'base64').toString().replace('/student-sdk-test.js', mockUrl);
    packet.params.body = Buffer.from(body).toString('base64');
    return originalSend(JSON.stringify(packet));
  }
  return originalSend(data);
};

try {
  await cdp('Page.navigate', { url: 'http://127.0.0.1:80/student?name=Maya' });
  await until(`${selector('button-talk-to-fade')} !== null`);
  await evaluate(`${selector('button-talk-to-fade')}.click()`);
  await until('window.__voice.contexts.length > 0');
  assert.equal(await evaluate('window.__voice.starts[0].agentId'), 'test-public-agent');
  assert.equal(await evaluate('window.__voice.starts[0].connectionType'), 'webrtc');
  assert.equal(await evaluate('window.__voice.starts[0].userId'), 'maya');
  assert.match(await evaluate('window.__voice.contexts[0]'), /<body>/);
  assert.match(await evaluate('window.__voice.contexts[0]'), /currentStep/);
  await evaluate(`window.__voice.callbacks.current.onModeChange({mode:'speaking'})`);
  await until(`${selector('button-talk-to-fade')}.dataset.s === 'speaking'`);
  await evaluate(`window.__voice.callbacks.current.onMessage({source:'user',message:'How do I add a heading?',event_id:1})`);
  await evaluate(`window.__voice.callbacks.current.onMessage({source:'ai',message:'Put an h1 inside your body.',event_id:2,response_id:'answer-1'})`);
  await until(`document.querySelector('.fs-trans')?.textContent.includes('Put an h1')`);
  await evaluate(`${selector('button-say-again')}.click()`);
  assert.match(await evaluate('window.__voice.messages.at(-1)'), /say your last advice again/);
  await evaluate(`(() => {
    const input=${selector('input-css')};
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'h1 {color:purple}');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await until(`window.__voice.contexts.at(-1).includes('purple')`);
  await evaluate(`${selector('button-talk-to-fade')}.click()`);
  await until(`${selector('button-talk-to-fade')}.getAttribute('aria-pressed') === 'false'`);
  assert.ok(await evaluate('window.__voice.ends > 0'));
  await evaluate(`${selector('button-talk-to-fade')}.click()`);
  await until(`${selector('button-talk-to-fade')}.getAttribute('aria-pressed') === 'true'`);
  await evaluate(`window.__voice.callbacks.current.onError('private technical error that must stay hidden')`);
  await until(`${selector('input-question')} !== null`);
  assert.equal(await evaluate('document.body.textContent.includes("private technical error")'), false);
  assert.match(await evaluate(`${selector('text-question-note')}.textContent`), /type your question/i);
  console.log('PASS: SDK start/end, public ID configuration, initial and changed-code context, speaking/listening state, transcripts, and friendly error fallback.');
} finally {
  await cdp('Page.close');
  ws.close();
}
