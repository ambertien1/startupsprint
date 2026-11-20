# CoTeach AI — project context for Claude Code

> **Name:** the product is **CoTeach AI**. "Fade" was the working name and still appears below and in code identifiers (for example the `fade:say` event and `useStudentFade`). Anything a user sees or hears says CoTeach AI, or "CoTeach" for the helper's voice.

Read this before doing anything. It is the agreed plan for a 4-hour hackathon build (Berkeley Startup Sprint, Fri Nov 20 2026, build 12:00–4:00 PM, submit by 4:00).

## What Fade is

Fade listens to the teacher and turns what she says into step-by-step guidance on every student's screen, with a voice that helps each student through it.

- Built for students with learning differences (ADHD, dyslexia, autism), used by the whole class so nobody is singled out ("curb-cut effect").
- Works for any subject where students work on a screen. The DEMO is a coding lesson (HTML), because steps can be checked live.
- Pitch line: "The teacher says it once. Every student gets their own steps, and a patient voice to help with each one."
- Track: Student and community needs. Going for overall + Best Project Built with ElevenLabs.

## The flow

1. Teacher clicks the mic once and teaches. Fade listens and keeps the transcript (the "lesson"). Click again to stop. (Click to start and stop, not hold.)
2. Teaching and tasks are one stream: the teacher does not mark tasks. As she teaches, the STEPS AGENT listens along and, whenever she tells students to do something, rewrites it into short ordered steps. Plain explanation produces no steps.
3. Every student page gets the steps within ~2s. Fade says the current step aloud, by name.
4. Student types. Steps tick off when their code passes that step's check.
5. Student holds "Ask" and asks a question out loud. Fade answers from the lesson, in the teacher's words, with a hint and never the answer.
6. Student pauses ~20s. The STUDENT AGENT wakes and decides: hint, wait, or flag teacher.
7. Still stuck after hints → teacher page shows "Leo needs you" + reason + his code.

## Steps agent rules (rewriting the teacher's words)

- Address the student: "you" + action verb first. One action per step.
- Order by when to do it, not when she said it ("before that" moves earlier).
- Merge repeats. Take corrections ("blue, no wait, purple" → purple). Drop filler.
- Keep her key words. One short sentence per step, ~5th-grade reading level.
- Later changes update the list without resetting progress.
- If unclear, ask the teacher instead of guessing.

## Student agent (see agent.ts)

- Model decides freely; nothing is scripted. Tools:
  - Evidence: `get_student_code`, `run_checks`, `get_history` (hints given, idle time, lesson).
  - Actions (end the turn): `speak_to_student`, `flag_teacher`, `wait`.
- GROUNDING: every `speak_to_student` carries `code_quote` and `lesson_quote`, copied exactly. Code verifies they exist; if not, the call is rejected and the agent retries. It must read the code before acting. Answers must come from the lesson, or it says the teacher hasn't covered that.
- Rules: never say "wrong"; name what works first; smallest hint; cheer only if every check passes; flag teacher when hints are used up.
- `tool_choice` "any", max 6 turns, ~4s timeout with a fallback line.
- Log every tool call → shown as the agent's reasoning for judges.

## Stack

- Node + Express + Socket.IO server, all state in memory (no DB).
- Student and teacher pages served by the same server.
- Claude via Anthropic API with tool use (fast model for the student agent).
- ElevenLabs: speech-to-text (teacher mic, student questions) and text-to-speech (Fade's voice).
- Built and hosted on Replit (Core plan). Keys in Replit Secrets: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`. Publish early; use a deployment type that stays on (live connections + in-memory state).
- Chrome needs HTTPS for the mic: test on the published link, not just the preview.

## Socket events (do not rename without telling the team)

| Event | Direction | Payload |
| --- | --- | --- |
| `lesson:chunk` | teacher → server | `{ text }` — everything the teacher says; the steps agent picks tasks out of it |
| `task:spoken` | teacher → server | `{ text }` — optional: force this text to be treated as a task |
| `steps:new` | server → students | `{ steps: [{ id, text, done }] }` |
| `code:update` | student → server | `{ studentId, html, css }` |
| `question` | student → server | `{ studentId, text }` |
| `fade:say` | server → student | `{ text, audioUrl, kind, code_quote, lesson_quote }` |
| `student:update` | server → teacher | `{ studentId, name, stepIndex, status, sentence }` |
| `student:join` | student → server | `{ studentId, name }` — on page load |
| `student:idle` | student → server | `{ studentId }` — after ~20s without typing |
| `hint:request` | student → server | `{ studentId }` — Hint button |
| `steps:question` | server → teacher | `{ question }` — only for `task:spoken` |
| `teacher:helped` | teacher → server | `{ studentId }` — clears "needs you" |

`student:update` may also carry `reason`, `code`, `said`, `hintsLeft` and `reasoning` (the agent's tool-call log). Audio input goes to `POST /stt` (raw audio body) and returns `{ ok, text }`.

Fake step list to build against until the agent works:

1. Type a title for your website in an h1 tag
2. Add a paragraph under your title

## Demo is the goal (golden path, ~2 min)

1. Teacher explains HTML in two sentences; words appear live.
2. Teacher: "Add a title to your page with an h1 tag, then add a paragraph under it."
3. Steps appear on Maya's screen; Fade: "Hi Maya! First, type a title in an h1 tag."
4. Maya types the title; step 1 ticks; Fade cheers.
5. Maya asks aloud "What's a paragraph tag?"; Fade answers in the teacher's words.
6. Leo (pre-set stuck, code `<h1>Leo's Page</h1`) → teacher sees "Leo needs you."

Real: sync, voice, one live agent decision with visible evidence. Simplified: one lesson, students pre-joined, Leo pre-set, pre-generated audio for known lines, text-box fallback for teacher and for the question. Never claim staged parts are live. If asked: "The sync, voice and agent are live; the lesson and students are pre-set for the demo."

## Build order (each step is a working demo; stop anywhere)

1. Typed sentence on /teacher appears on /student (sockets only, no AI).
2. Steps agent: sentence → steps on student page.
3. Teacher mic replaces typing.
4. Fade speaks the first step.
5. Typing the title ticks step 1.
6. Student agent: a pause produces a grounded hint.
7. Spoken question + "Leo needs you."

## Team split

- Teacher side + server: server, teacher page, mic, steps agent, student agent, voice out.
- Student side: editor + live preview, Fade bar (steps, sentence, Say it again, Hint, Hold to ask), ticking, audio playback, pause trigger, demo script.
- Each person owns their own files. Don't edit the other person's files.

## Checkpoints

12:45 halves work alone · 1:00 connect · 1:45 mic + real steps + ticks + audio · 2:30 hint + flag + ask · 3:00 FEATURE FREEZE · 3:15 record backup video · 3:45 submit. If it isn't in the 2-minute story, don't build it.

## Out of scope today

Other subjects (pitch only), Chrome extension (pitch only), accounts/logins, camera/attention tracking, after-class reports, voice cloning.
