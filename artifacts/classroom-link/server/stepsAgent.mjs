// Steps agent: rewrites what the teacher said into short ordered steps.
// Owned by the teacher + server half. See CLAUDE.md "Steps agent rules".
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4'; // the SDK's helper needs the v4 entry point

// Fast model by default so steps reach students in about two seconds; STEPS_MODEL overrides.
const MODEL = process.env.STEPS_MODEL || 'claude-haiku-5-5';
const TIMEOUT_MS = Number(process.env.STEPS_TIMEOUT_MS) || 8000;

const StepsSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string().describe('Reuse the id of an existing step when it is the same step; otherwise "new".'),
      text: z.string().describe('One short sentence addressed to the student.'),
    }),
  ),
  has_task: z
    .boolean()
    .describe('True when the teacher just told students to do something on their screens. False when she is only explaining.'),
  question: z
    .string()
    .describe('Empty string normally. If the task is too unclear to turn into steps, one short question for the teacher.'),
});

const SYSTEM = `You turn what a teacher just said to her class into a short ordered list of steps that appears on every student's screen. Many of the students have ADHD, dyslexia or autism, so each step has to be something a student can do without rereading it.

How to write the steps:
- Speak to the student. Start each step with an action verb ("Type", "Add", "Change"), with "you" or "your" where it reads naturally.
- One action per step. If the teacher packed two actions into one sentence, make two steps.
- Order the steps by when the student should do them, not by when the teacher said them. "Before that, ..." moves a step earlier.
- If the teacher repeats herself, keep one step. If she corrects herself ("blue, no wait, purple"), keep only the correction.
- Drop filler, greetings and classroom management. Only keep things the student does on their screen.
- Keep the teacher's own key words (tag names, colors, titles) so the step matches what the student heard.
- One short sentence per step, at about a 5th-grade reading level. No "wrong", no warnings, no explanations.

When there is already a step list, the teacher's new words are a change to it. Return the full updated list. For every step that is still the same step, even if you reword it, copy its existing id exactly so the student's progress is kept. Use the id "new" for steps that did not exist before. Leave out steps the teacher removed.

The lesson transcript, when given, is background only: use it to understand her words, never to invent steps she did not ask for.

If you cannot tell what the student should do, do not guess: return an empty steps list and put one short question for the teacher in "question". Otherwise "question" is an empty string.`;

// Added to the system prompt while the teacher is teaching and nobody has
// marked what she said as a task: the agent listens and picks tasks out itself.
const LISTENING = `

Right now the teacher is teaching, and you are listening along. Most of what she says is explanation, stories, questions to the class, or classroom management. None of that is a step. Set has_task to true only when what she just said tells students to do something on their own screens ("add...", "now type...", "go ahead and make...", "I want you to..."). Then return the full updated step list as described above.

When the teacher gives a NEW task after existing steps, ADD its new steps AFTER the existing ones. Keep ALL existing steps, in their order and with their existing ids. Return the full combined list, not only the new task and not the old list unchanged. Only replace, remove, reorder or correct existing steps when the teacher clearly asks to replace or correct them. Pausing and resuming teaching does not start a new lesson or remove earlier steps.

When she is only explaining, set has_task to false, return the current steps unchanged with their ids, and leave question empty. Never ask a question while listening: if you are not sure it was a task, it was not.`;

// Built once at startup so a schema problem fails loudly instead of on first use.
const OUTPUT_FORMAT = zodOutputFormat(StepsSchema);
export const _outputFormat = OUTPUT_FORMAT;

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function buildUserMessage({ taskText, lesson, currentSteps }) {
  const parts = [];
  if (lesson && lesson.trim()) parts.push(`<lesson_so_far>\n${lesson.trim()}\n</lesson_so_far>`);
  if (currentSteps.length) {
    parts.push(`<current_steps>\n${JSON.stringify(currentSteps.map(({ id, text }) => ({ id, text })))}\n</current_steps>`);
  }
  parts.push(`<teacher_said>\n${taskText.trim()}\n</teacher_said>`);
  return parts.join('\n\n');
}

let counter = 0;
function newId() {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

/** Keep ids and done flags for steps the model says are unchanged. */
export function mergeSteps(modelSteps, currentSteps) {
  const byId = new Map(currentSteps.map((s) => [s.id, s]));
  const used = new Set();
  return modelSteps
    .map((s) => ({ id: String(s.id || '').trim(), text: String(s.text || '').trim() }))
    .filter((s) => s.text)
    .map((s) => {
      const prev = byId.get(s.id);
      if (prev && !used.has(prev.id)) {
        used.add(prev.id);
        return { id: prev.id, text: s.text, done: prev.done };
      }
      return { id: newId(), text: s.text, done: false };
    });
}

/**
 * Plain splitter used only when the model can't be reached, so the class is
 * never left with nothing. Results are labelled source: "fallback".
 */
export function fallbackSteps(taskText) {
  return taskText
    .split(/(?<=[.!?])\s+|,?\s+(?:and then|then|after that|and)\s+/i)
    .map((t) => t.trim().replace(/^[,;]\s*/, '').replace(/[.!?]+$/, ''))
    .filter((t) => t.split(/\s+/).length >= 2)
    .map((t) => ({ id: newId(), text: `${t.charAt(0).toUpperCase()}${t.slice(1)}.`, done: false }));
}

/**
 * @returns {Promise<{ steps: {id:string,text:string,done:boolean}[], question: string, source: 'agent'|'fallback', ms: number, error?: string }>}
 */
const ACTION_START = /^(now |next |then |okay |ok |so |please |go ahead and |i want you to |everyone |let's )*(add|type|write|make|create|change|put|give|open|click|delete|remove|move|set|use|try)\b/i;

/**
 * mode "task": the teacher marked this as a task. mode "listen": she is
 * teaching and the agent decides whether there is a task in what she said.
 * hasTask is false only in listen mode when there was nothing to do.
 * @returns {Promise<{ steps: {id:string,text:string,done:boolean}[], question: string, hasTask: boolean, source: 'agent'|'fallback', ms: number, error?: string }>}
 */
export async function makeSteps({ taskText, lesson = '', currentSteps = [], mode = 'task' }, dependencies = {}) {
  const listening = mode === 'listen';
  // Offline stand-in for listening: only sentences that start with an action count.
  const offline = () => {
    if (!listening) return { steps: fallbackSteps(taskText), hasTask: true };
    const found = taskText.split(/(?<=[.!?])\s+/).filter((t) => ACTION_START.test(t.trim())).join(' ');
    return found ? { steps: [...currentSteps, ...fallbackSteps(found)], hasTask: true } : { steps: currentSteps, hasTask: false };
  };
  const started = Date.now();
  const done = (out) => ({ ...out, ms: Date.now() - started });
  if (!(dependencies.hasCredentials || hasCredentials)()) {
    return done({ ...offline(), question: '', source: 'fallback', error: 'ANTHROPIC_API_KEY is not set' });
  }
  try {
    const parse = dependencies.parse || ((request) => getClient().messages.parse(request));
    const response = await parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: OUTPUT_FORMAT },
      system: listening ? SYSTEM + LISTENING : SYSTEM,
      messages: [{ role: 'user', content: buildUserMessage({ taskText, lesson, currentSteps }) }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error(`no usable output (stop_reason: ${response.stop_reason})`);
    }
    const { steps, question, has_task: hasTask } = response.parsed_output;
    if (listening && !hasTask) return done({ steps: currentSteps, question: '', hasTask: false, source: 'agent' });
    const merged = mergeSteps(steps, currentSteps);
    if (listening) {
      const unchanged = merged.length === currentSteps.length
        && merged.every((step, index) => step.id === currentSteps[index].id && step.text === currentSteps[index].text);
      if (unchanged) return done({
        ...offline(), question: '', source: 'fallback',
        error: 'The steps agent detected a task but returned unchanged steps.',
      });
      if (!merged.length) return done({ steps: currentSteps, question: '', hasTask: false, source: 'agent' });
      return done({ steps: merged, question: '', hasTask: true, source: 'agent' });
    }
    if (!merged.length && !question.trim()) throw new Error('model returned no steps and no question');
    return done({ steps: merged, question: question.trim(), hasTask: true, source: 'agent' });
  } catch (error) {
    let reason = error instanceof Error ? error.message : String(error);
    if (error instanceof Anthropic.AuthenticationError) reason = 'the Anthropic API key was rejected';
    else if (error instanceof Anthropic.RateLimitError) reason = 'rate limited by the Anthropic API';
    else if (error instanceof Anthropic.APIConnectionTimeoutError) reason = `no reply within ${TIMEOUT_MS}ms`;
    else if (error instanceof Anthropic.APIError) reason = `Anthropic API error ${error.status}: ${error.message}`;
    return done({ ...offline(), question: '', source: 'fallback', error: reason });
  }
}
