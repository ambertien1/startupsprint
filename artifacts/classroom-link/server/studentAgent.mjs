// Student agent: wakes on a pause, a hint request or a question, looks at the
// evidence, and decides for itself: speak, flag the teacher, or wait.
// Nothing here is scripted; the code only enforces grounding and the hard rules.
// Owned by the teacher + server half. See CLAUDE.md "Student agent".
import Anthropic from '@anthropic-ai/sdk';
import { runChecks } from './checks.mjs';

const MODEL = process.env.STUDENT_AGENT_MODEL || 'claude-haiku-5-5';
const MAX_TURNS = 6;
const TIMEOUT_MS = Number(process.env.STUDENT_AGENT_TIMEOUT_MS) || 6000;
export const MAX_HINTS = Number(process.env.MAX_HINTS) || 2;

const SYSTEM = `You are CoTeach, a patient voice that helps one student during a lesson. The class includes students with ADHD, dyslexia and autism. Your words are spoken aloud to the student, so keep them short, warm and concrete: one or two short sentences at about a 5th-grade reading level.

You were woken because the student paused, asked for a hint, or asked a question. Decide what helps most right now. You have three evidence tools (get_student_code, run_checks, get_history) and three actions that end your turn (speak_to_student, flag_teacher, wait). Always read the student's code before you act; look at the checks and history when they would change your decision.

How to help:
- Name what is already working before anything else. Never say "wrong", "mistake", "error" or "incorrect".
- Give the smallest hint that lets the student take the next step themselves. Point at the place; do not give the finished code or the answer.
- Everything you say about the subject must come from what the teacher said in the lesson. Use her words. If the lesson does not cover what the student needs, say the teacher has not covered that yet and set not_covered to true.
- Use kind "cheer" only when every check passes. Use "answer" when replying to a question, "hint" otherwise.
- If the student is working and does not need you, wait. A short pause is not a problem.
- If the history shows the hints are used up and the student is still stuck, flag the teacher instead of hinting again. The reason you give is one plain sentence the teacher reads at a glance.

Grounding, which the system checks: every speak_to_student carries code_quote, copied character for character from the student's code (the part you are talking about), and lesson_quote, copied character for character from the lesson transcript (the teacher's words your help rests on). If a quote does not match exactly, the call is rejected and you must try again with an exact copy. code_quote may be empty only when the student's code is empty; lesson_quote may be empty only when not_covered is true.`;

const TOOLS = [
  {
    name: 'get_student_code',
    description: "Read the student's current HTML and CSS exactly as typed. Call this before any action.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_checks',
    description: 'Run the live check for each step against the current code. Returns, per step, whether it passes and what was found.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_history',
    description: 'Get the lesson transcript (the teacher\'s words), the hints already given to this student, how many hints are left, and how long the student has been idle.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'speak_to_student',
    description: 'Say one or two short sentences aloud to the student. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What CoTeach says aloud. One or two short sentences.' },
        kind: { type: 'string', enum: ['hint', 'answer', 'cheer'] },
        code_quote: { type: 'string', description: "Exact copy of the part of the student's code this is about." },
        lesson_quote: { type: 'string', description: "Exact copy of the teacher's words this rests on." },
        not_covered: { type: 'boolean', description: 'True only when the lesson does not cover what the student asked.' },
      },
      required: ['text', 'kind', 'code_quote', 'lesson_quote'],
      additionalProperties: false,
    },
  },
  {
    name: 'flag_teacher',
    description: 'Ask the teacher to come to this student. Use when hints are used up and the student is still stuck. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'One plain sentence for the teacher: what the student is stuck on.' } },
      required: ['reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'wait',
    description: 'Do nothing for now because the student is doing fine. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'One short sentence on why waiting is right.' } },
      required: ['reason'],
      additionalProperties: false,
    },
  },
];

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const containsExact = (haystack, quote) => squash(haystack).includes(squash(quote));

let sharedClient = null;
const getClient = () => (sharedClient ||= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 }));

export function fallbackLine(name) {
  return `${name}, take your time. Read your step one more time, and ask me if you want a hint.`;
}

/**
 * Run one agent decision.
 *
 * @param {object} ctx
 * @param {string} ctx.name            student's first name
 * @param {string} ctx.html
 * @param {string} ctx.css
 * @param {{id:string,text:string}[]} ctx.steps
 * @param {string} ctx.lesson          teacher transcript
 * @param {string[]} ctx.hints         hints already spoken to this student
 * @param {number} ctx.idleSeconds
 * @param {'pause'|'hint'|'question'} ctx.trigger
 * @param {string} [ctx.question]
 * @param {object} [deps]              { client } for tests
 * @returns {Promise<{ action:'speak'|'flag'|'wait'|'fallback', text?:string, kind?:string, code_quote?:string,
 *   lesson_quote?:string, reason?:string, log:object[], ms:number, error?:string }>}
 */
export async function runStudentAgent(ctx, { client } = {}) {
  const started = Date.now();
  const log = [];
  const note = (tool, input, result, ok = true) => log.push({ t: Date.now() - started, tool, input, result, ok });
  const finish = (out) => ({ ...out, log, ms: Date.now() - started });
  const hintsLeft = Math.max(0, MAX_HINTS - ctx.hints.length);
  const checks = () => runChecks(ctx.steps, ctx.html);
  let readCode = false;

  if (!client && !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    return finish({ action: 'fallback', text: fallbackLine(ctx.name), kind: 'fallback', error: 'ANTHROPIC_API_KEY is not set' });
  }
  const api = client || getClient();

  const wake =
    ctx.trigger === 'question'
      ? `${ctx.name} asked out loud: "${ctx.question}"`
      : ctx.trigger === 'hint'
        ? `${ctx.name} pressed the Hint button.`
        : `${ctx.name} has not typed for about ${Math.round(ctx.idleSeconds)} seconds.`;
  const messages = [{ role: 'user', content: `${wake}\nDecide what helps ${ctx.name} most right now.` }];

  // Each evidence tool returns data; each action is checked, then accepted or rejected.
  function handle(name, input) {
    if (name === 'get_student_code') {
      readCode = true;
      return { result: { html: ctx.html, css: ctx.css, empty: !squash(ctx.html) } };
    }
    if (name === 'run_checks') return { result: { checks: checks() } };
    if (name === 'get_history') {
      return {
        result: {
          lesson_transcript: ctx.lesson,
          hints_given: ctx.hints,
          hints_left: hintsLeft,
          idle_seconds: Math.round(ctx.idleSeconds),
          trigger: ctx.trigger,
        },
      };
    }
    if (!readCode) return { reject: "Read the student's code with get_student_code before acting." };
    if (name === 'wait') {
      // A student who asked something must always hear back.
      if (ctx.trigger === 'question') return { reject: 'The student asked a question, so do not wait. Answer with speak_to_student (kind "answer"), or use not_covered if the lesson does not cover it.' };
      if (ctx.trigger === 'hint') return { reject: 'The student asked for a hint, so do not wait. Give the smallest hint with speak_to_student, or flag the teacher if hints are used up.' };
      return { done: { action: 'wait', reason: squash(input?.reason) } };
    }
    if (name === 'flag_teacher') {
      if (ctx.trigger === 'question') return { reject: 'The student asked a question. Answer it first with speak_to_student (kind "answer"); answers do not use up hints. Use not_covered if the lesson does not cover it.' };
      const reason = squash(input?.reason);
      if (!reason) return { reject: 'Give the teacher a one-sentence reason.' };
      return { done: { action: 'flag', reason } };
    }
    if (name === 'speak_to_student') {
      const text = squash(input?.text);
      let kind = ['hint', 'answer', 'cheer'].includes(input?.kind) ? input.kind : 'hint';
      // A reply to a question is an answer: it never uses up the student's hints.
      if (ctx.trigger === 'question' && kind === 'hint') kind = 'answer';
      const codeQuote = String(input?.code_quote ?? '');
      const lessonQuote = String(input?.lesson_quote ?? '');
      if (!text) return { reject: 'text is empty.' };
      if (/\b(wrong|mistake|incorrect|error)\b/i.test(text)) {
        return { reject: 'Do not say "wrong", "mistake", "incorrect" or "error". Say what works, then the next small thing to try.' };
      }
      if (squash(ctx.html)) {
        if (!squash(codeQuote)) return { reject: "code_quote is empty. Copy the exact part of the student's code you are talking about." };
        if (!containsExact(ctx.html + '\n' + ctx.css, codeQuote)) {
          return { reject: `code_quote does not appear in the student's code. Copy it character for character. You sent: ${codeQuote}` };
        }
      } else if (squash(codeQuote)) {
        return { reject: "The student's code is empty, so code_quote must be empty." };
      }
      if (squash(lessonQuote)) {
        if (!containsExact(ctx.lesson, lessonQuote)) {
          return { reject: `lesson_quote does not appear in the lesson transcript. Copy the teacher's words character for character from get_history. You sent: ${lessonQuote}` };
        }
      } else if (!input?.not_covered) {
        return { reject: 'lesson_quote is empty. Quote the teacher from the lesson transcript, or set not_covered to true and say the teacher has not covered that yet.' };
      }
      if (kind === 'cheer' && !checks().every((c) => c.pass)) {
        return { reject: 'Not every check passes yet, so this cannot be a cheer. Give a hint, wait, or flag the teacher.' };
      }
      if (kind === 'hint' && hintsLeft === 0) {
        return { reject: 'The hints for this student are used up. Use flag_teacher with a one-sentence reason.' };
      }
      return { done: { action: 'speak', text, kind, code_quote: squash(codeQuote), lesson_quote: squash(lessonQuote) } };
    }
    return { reject: `Unknown tool ${name}.` };
  }

  let toolChoice = { type: 'any' };
  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const left = TIMEOUT_MS - (Date.now() - started);
      if (left <= 250) throw new Error(`no decision within ${TIMEOUT_MS}ms`);
      let response;
      const request = () =>
        api.messages.create(
          {
            model: MODEL,
            max_tokens: 1024,
            ...(toolChoice.type === 'any' ? { thinking: { type: 'disabled' } } : {}),
            system: SYSTEM,
            tools: TOOLS,
            tool_choice: toolChoice,
            messages,
          },
          { timeout: left },
        );
      try {
        response = await request();
      } catch (error) {
        // If this model rejects forced tool use, let it choose and keep going.
        if (error instanceof Anthropic.BadRequestError && toolChoice.type === 'any') {
          toolChoice = { type: 'auto' };
          note('system', {}, 'forced tool use was rejected by the model; retrying with tool_choice "auto"', false);
          response = await request();
        } else throw error;
      }
      if (response.stop_reason === 'refusal') throw new Error('the model declined to answer');
      const calls = response.content.filter((block) => block.type === 'tool_use');
      messages.push({ role: 'assistant', content: response.content });
      if (!calls.length) {
        messages.push({ role: 'user', content: 'Use one of your tools: an evidence tool, or an action to end your turn.' });
        continue;
      }
      const results = [];
      let decided = null;
      for (const call of calls) {
        const outcome = handle(call.name, call.input);
        if (outcome.done && !decided) {
          decided = outcome.done;
          note(call.name, call.input, 'accepted');
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'accepted' });
        } else if (outcome.reject) {
          note(call.name, call.input, `rejected: ${outcome.reject}`, false);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.reject, is_error: true });
        } else {
          const payload = outcome.result ?? { note: 'ignored: a decision was already made this turn' };
          note(call.name, call.input, payload);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(payload) });
        }
      }
      if (decided) return finish(decided);
      messages.push({ role: 'user', content: results });
    }
    throw new Error(`no decision within ${MAX_TURNS} turns`);
  } catch (error) {
    let reason = error instanceof Error ? error.message : String(error);
    if (error instanceof Anthropic.AuthenticationError) reason = 'the Anthropic API key was rejected';
    else if (error instanceof Anthropic.RateLimitError) reason = 'rate limited by the Anthropic API';
    else if (error instanceof Anthropic.APIConnectionTimeoutError) reason = `no reply within ${TIMEOUT_MS}ms`;
    else if (error instanceof Anthropic.APIError) reason = `Anthropic API error ${error.status}: ${error.message}`;
    note('system', {}, `fallback line used: ${reason}`, false);
    return finish({ action: 'fallback', text: fallbackLine(ctx.name), kind: 'fallback', error: reason });
  }
}
