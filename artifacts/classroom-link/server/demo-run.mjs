// Full end-to-end demo run against a running server.
//   node server/demo-run.mjs http://localhost:PORT
// One teacher and four students go through the whole lesson. Prints what each
// side sees, then a checklist. Uses whatever keys the server has: with real
// keys this exercises the live steps agent, student agent and voice.
import { io } from 'socket.io-client';

const url = process.argv[2] || `http://localhost:${process.env.PORT || 5000}`;
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const log = (who, what) => console.log(`${stamp()}  ${who.padEnd(14)} ${what}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await sleep(100); } return false; };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); log('CHECK', `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const teacher = io(url);
const seen = { steps: [], updates: new Map() };
teacher.on('steps:new', (p) => { seen.steps = p.steps; });
teacher.on('student:update', (u) => {
  const prev = seen.updates.get(u.studentId);
  seen.updates.set(u.studentId, { ...prev, ...u });
  if (!prev || prev.sentence !== u.sentence) log('TEACHER SEES', `${u.sentence}${u.reason ? `  — reason: ${u.reason}` : ''}`);
});

function student(name, html = '') {
  const s = { name, id: name.toLowerCase(), socket: io(url), steps: [], says: [], html };
  s.socket.on('steps:new', (p) => { s.steps = p.steps; });
  s.socket.on('fade:say', (p) => {
    s.says.push(p);
    log(`${name.toUpperCase()} HEARS`, `"${p.text}"  [${p.kind}${p.audioUrl ? ', audio' : ', no audio'}]`);
    if (p.lesson_quote) log('', `   teacher said: "${p.lesson_quote}"`);
    if (p.code_quote) log('', `   in their code: ${p.code_quote}`);
  });
  s.type = (code) => { s.html = code; s.socket.emit('code:update', { studentId: s.id, html: code, css: '' }); log(`${name.toUpperCase()} TYPES`, code); };
  return s;
}

const maya = student('Maya');
const leo = student('Leo', "<h1>Leo's Page</h1");
const arhaan = student('Arhaan');
const chiara = student('Chiara');
const kids = [maya, leo, arhaan, chiara];

await Promise.all([teacher, ...kids.map((k) => k.socket)].map((s) => new Promise((r) => s.on('connect', r))));
console.log(`\nCoTeach AI full demo run against ${url}\n`);

// 1. Students join
for (const k of kids) {
  await k.socket.emitWithAck('student:join', { studentId: k.id, name: k.name });
  k.socket.emit('code:update', { studentId: k.id, html: k.html, css: '', preset: true });
}
await until(() => seen.updates.size === 4, 5000);
check('All four students show up on the teacher page', seen.updates.size === 4, `${seen.updates.size} of 4`);

// 2. Teacher explains: no steps should be made
log('TEACHER SAYS', '"HTML is made of tags. Every tag you open needs a closing tag with a slash, like </h1>."');
const a1 = await teacher.timeout(40000).emitWithAck('lesson:chunk', { text: 'HTML is made of tags. Every tag you open needs a closing tag with a slash, like </h1>.' });
check('Explaining does not create steps', a1.ok && a1.task === false && seen.steps.length === 0, `source: ${a1.source}`);

// 3. Teacher gives the task inside her teaching
const task = 'A paragraph goes in a p tag. Now add a title to your page with an h1 tag, then add a paragraph under it.';
log('TEACHER SAYS', `"${task}"`);
const a2 = await teacher.timeout(40000).emitWithAck('lesson:chunk', { text: task });
await until(() => kids.every((k) => k.steps.length > 0), 5000);
log('TEACHER SEES', `Lesson steps: ${seen.steps.map((s, i) => `${i + 1}. ${s.text}`).join('  ')}`);
check('The task becomes steps on every student screen', a2.task === true && kids.every((k) => k.steps.length >= 2), `${a2.ms} ms, source: ${a2.source}`);
await until(() => maya.says.length >= 1, 12000);
check('CoTeach AI greets Maya by name with her first step', /Maya/.test(maya.says[0]?.text || ''), maya.says[0]?.audioUrl ? 'with audio' : 'text only, no audio');

// 4. Maya works: progress is followed live
let n = maya.says.length;
maya.type('<h1>My Website</h1>');
await until(() => maya.says.length > n && seen.updates.get('maya')?.stepIndex === 1, 12000);
check('Maya finishes step 1: teacher sees it and CoTeach AI gives the next step', seen.updates.get('maya')?.stepIndex === 1 && /Next,/.test(maya.says.at(-1)?.text || ''));

// 5. Maya asks a question
n = maya.says.length;
log('MAYA ASKS', '"What\'s a paragraph tag?"');
const q = await maya.socket.timeout(30000).emitWithAck('question', { studentId: 'maya', text: "What's a paragraph tag?" });
await until(() => maya.says.length > n, 15000);
const answer = maya.says.at(-1);
check('CoTeach AI answers the question', q?.ok && maya.says.length > n, `kind: ${answer?.kind}`);
check('The answer is grounded in the teacher\'s words', Boolean(answer?.lesson_quote), answer?.lesson_quote ? 'has a lesson quote' : 'no lesson quote (fallback line or lesson not covered)');

n = maya.says.length;
maya.type('<h1>My Website</h1>\n<p>Welcome to my page.</p>');
await until(() => seen.updates.get('maya')?.status === 'done', 12000);
check('Maya finishes every step', seen.updates.get('maya')?.status === 'done');

// 6. Leo is stuck: hints, then the teacher is called
for (let i = 1; i <= 3 && seen.updates.get('leo')?.status !== 'needs_help'; i += 1) {
  log('LEO', `asks for a hint (${i})`);
  await leo.socket.timeout(30000).emitWithAck('hint:request', { studentId: 'leo' });
  await sleep(600);
}
await until(() => seen.updates.get('leo')?.status === 'needs_help', 8000);
const leoState = seen.updates.get('leo');
check('Leo gets hints first', leo.says.some((s) => s.kind === 'hint'), `${leo.says.filter((s) => s.kind === 'hint').length} hint(s)`);
check('"Leo needs you" reaches the teacher with a reason and his code', leoState?.status === 'needs_help' && Boolean(leoState?.reason) && leoState?.code === leo.html);
check('The agent shows its reasoning for judges', (leoState?.reasoning?.log?.length || 0) > 0, `${leoState?.reasoning?.log?.length || 0} tool calls logged`);

// 7. The rest of the class
for (const k of [arhaan, chiara]) k.type(`<h1>${k.name}'s Site</h1>\n<p>Hello!</p>`);
await until(() => ['arhaan', 'chiara'].every((id) => seen.updates.get(id)?.status === 'done'), 12000);
check('Arhaan and Chiara finish and show as Done', ['arhaan', 'chiara'].every((id) => seen.updates.get(id)?.status === 'done'));

console.log('\nTeacher page at the end:');
for (const u of [...seen.updates.values()].sort((a, b) => Number(b.status === 'needs_help') - Number(a.status === 'needs_help'))) {
  console.log(`  ${u.name.padEnd(8)} ${u.status.padEnd(11)} ${u.sentence}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} of ${results.length} checks passed.\n`);
for (const s of [teacher, ...kids.map((k) => k.socket)]) s.close();
process.exit(passed === results.length ? 0 : 1);
