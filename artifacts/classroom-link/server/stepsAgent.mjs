// Steps agent: rewrites what the teacher said into short ordered steps.
// Owned by the teacher + server half. See CLAUDE.md "Steps agent rules".
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const MODEL = process.env.STEPS_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = Number(process.env.STEPS_TIMEOUT_MS) || 8000;

const StepsSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string().describe('Reuse the id of an existing step when it is the same step; otherwise "new".'),
      text: z.string().describe('One short sentence addressed to the student.'),
    }),
  ),
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
export async function makeSteps({ taskText, lesson = '', currentSteps = [] }) {
  const started = Date.now();
  const done = (out) => ({ ...out, ms: Date.now() - started });
  if (!hasCredentials()) {
    return done({ steps: fallbackSteps(taskText), question: '', source: 'fallback', error: 'ANTHROPIC_API_KEY is not set' });
  }
  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(StepsSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserMessage({ taskText, lesson, currentSteps }) }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error(`no usable output (stop_reason: ${response.stop_reason})`);
    }
    const { steps, question } = response.parsed_output;
    const merged = mergeSteps(steps, currentSteps);
    if (!merged.length && !question.trim()) throw new Error('model returned no steps and no question');
    return done({ steps: merged, question: question.trim(), source: 'agent' });
  } catch (error) {
    let reason = error instanceof Error ? error.message : String(error);
    if (error instanceof Anthropic.AuthenticationError) reason = 'the Anthropic API key was rejected';
    else if (error instanceof Anthropic.RateLimitError) reason = 'rate limited by the Anthropic API';
    else if (error instanceof Anthropic.APIConnectionTimeoutError) reason = `no reply within ${TIMEOUT_MS}ms`;
    else if (error instanceof Anthropic.APIError) reason = `Anthropic API error ${error.status}: ${error.message}`;
    return done({ steps: fallbackSteps(taskText), question: '', source: 'fallback', error: reason });
  }
}
