# CoTeach AI

**The teacher says it once. Every student gets their own steps, and a patient voice to help with each one.**

CoTeach AI listens while a teacher teaches. When she tells the class to do something, it turns her words into short, ordered steps on every student's screen, says each step aloud by name, follows each student's work as they type, and tells the teacher who needs her.

Built in four hours at the Berkeley Startup Sprint (November 20, 2026) by Nabiha and Amber.

## Try it

| | Link |
| --- | --- |
| Live app | https://deep-naive-files.replit.app |
| Teacher page | https://deep-naive-files.replit.app/teacher |
| Student page (Maya) | https://deep-naive-files.replit.app/student |
| A student who starts stuck (Leo) | https://deep-naive-files.replit.app/student?name=Leo |
| **Example class, teacher view** | https://deep-naive-files.replit.app/teacher?demo |
| **Example lesson, student view** | https://deep-naive-files.replit.app/student?demo |

The two **Demo** links open an example with sample students and a sample lesson, clearly labelled on screen, so you can see the whole product in ten seconds. Every page also has a Demo switch. The other links are the real, live product.

To try it live: open the teacher page and one or two student pages in separate tabs, click once on each student page so sound can play, then press **Start listening** on the teacher page and teach. Use Chrome, and allow the microphone. Typing works everywhere as a fallback ("Type instead").

## The need

In a classroom, instructions are given once, out loud, in the middle of everything else the teacher is saying. A student has to catch them, hold all of them in their head, put them in order, and start, all while the lesson keeps moving.

For many students that is the hardest part of the task, and it has nothing to do with whether they can do the work:

- A student with **ADHD** catches step one and misses steps two and three.
- A student with **dyslexia** or a processing difference is still working out the first instruction when the third one is given.
- An **autistic** student may need the instruction to be literal and unambiguous, and spoken instructions rarely are.
- Any student who looked away for five seconds is now lost, and often won't ask.

The usual fixes cost the teacher time she doesn't have: writing every instruction on the board, repeating herself, or going desk to desk. And help that is given to one student in front of the class singles that student out.

## Why we built it: our experience teaching

We have both taught, and this is a problem we have run into ourselves. In our experience, most of the time a student who is "stuck" is not stuck on the idea. They are stuck on what they were supposed to do next, and they are waiting for an adult to come back around.

What we kept wishing for as teachers:

- **To say it once.** Not to stop the lesson to re-explain the same three steps to five different students.
- **To know who actually needs us.** In a room of students on screens, the quiet ones who are stuck look exactly like the ones who are fine.
- **For help to be private and patient.** A student will ask a calm voice in their headphones the question they would never ask out loud in front of the class.
- **To stay the teacher.** We don't want a tool that hands out answers. We want one that repeats *our* words, points at the right spot, and then gets us when it should.

CoTeach AI is the tool we would want in our own classrooms. It would give us back the minutes we spend repeating instructions, and it would give our students who struggle most with instructions the same starting line as everyone else. Because the whole class uses it, nobody is singled out: the same way curb cuts built for wheelchairs help everyone with a stroller or a suitcase.

## What it does

1. **The teacher clicks once and teaches.** CoTeach AI listens and keeps the lesson transcript.
2. **It picks the instructions out of the lesson.** The teacher never marks what is a task. Explaining ("HTML is made of tags") creates nothing. An instruction ("now add a title with an h1 tag, then a paragraph under it") becomes short, ordered steps, in her own key words.
3. **Every student gets the steps in about a second**, and hears their current step by name: "Hi Maya! First, add a title to your page with an h1 tag."
4. **It follows each student's work as they type.** Steps tick off when the code is right, and it gives the next one: "Nice work, Maya! Step 1 is done. Next, …"
5. **A student can ask out loud.** The answer comes from what the teacher said, in her words, with a hint and never the finished answer.
6. **It keeps watching a student who is stuck.** When they stop typing with a step unfinished, it looks at their code and decides: nudge, wait, or call the teacher.
7. **The teacher sees one plain sentence per student**, stuck students first: "Leo needs you", with the reason, his code, and what CoTeach AI already tried.

The demo lesson is HTML because code can be checked live, but the idea works for any subject where students work on a screen.

## How it works

Two AI agents run on the server, both on Claude.

**The steps agent** hears everything the teacher says and decides whether she just gave the class a task. If she did, it rewrites it: one action per step, ordered by when to do it, corrections applied ("blue, no wait, purple" becomes purple), filler dropped, her key words kept, at about a 5th-grade reading level. Later instructions update the list without resetting anyone's progress.

**The student agent** is woken by a pause, a hint request, or a question. Nothing it does is scripted. It has three evidence tools (read the student's code, run the step checks, get the lesson and hint history) and three actions (speak, flag the teacher, wait), and it chooses.

What makes it trustworthy is that the code, not the prompt, enforces the rules:

- **Grounding.** Every line it speaks must carry an exact quote from the student's code and an exact quote from the teacher's lesson. The server checks both quotes really exist. A made-up quote is rejected and the agent has to try again.
- It must read the student's code before it acts.
- It can't say "wrong", "mistake" or "error".
- It can only cheer when every check passes.
- Hints are limited. After that it has to bring in the teacher, and the student is told so.
- A question always gets an answer. If the lesson didn't cover it, it says the teacher hasn't covered that yet.

Every tool call, including the rejected ones, is logged and shown on the teacher page under **How CoTeach AI decided**, so the reasoning is visible, not a black box.

**Voice** is ElevenLabs: speech-to-text for the teacher's microphone and students' questions, text-to-speech for CoTeach AI's voice, and a live voice conversation on the student page.

### Stack

- Node, Express and Socket.IO, with all classroom state in memory (no database, no logins)
- React front end, served by the same server
- Claude (Anthropic API) with tool use and structured output
- ElevenLabs for speech in and speech out
- Built and hosted on Replit

### Where things live

| Path | What it is |
| --- | --- |
| `artifacts/classroom-link/server.mjs` | The one server: pages, sockets, audio |
| `artifacts/classroom-link/server/stepsAgent.mjs` | Teacher's words into steps |
| `artifacts/classroom-link/server/studentAgent.mjs` | The student agent and its grounding rules |
| `artifacts/classroom-link/server/checks.mjs` | Live checks for each step |
| `artifacts/classroom-link/server/classroom.mjs` | Socket events and classroom state |
| `artifacts/classroom-link/server/voice.mjs`, `stt.mjs` | Speech out and speech in |
| `artifacts/classroom-link/src/teacher/` | Teacher page |
| `artifacts/classroom-link/src/pages/student.tsx`, `src/student/` | Student page |
| `CLAUDE.md` | The original plan and the full list of socket events |

## What is live and what is set up for the demo

We would rather be exact about this.

- **Live:** the real-time sync, the microphone and transcription, both AI agents and every decision they make, the grounding checks, the voice, the step checks, and the "needs you" flag.
- **Set up for the demo:** one lesson, students who join by a name in the link (Maya by default), and Leo, who starts with a deliberately unfinished line of code so there is a stuck student to show.
- **Sample data:** anything shown with the **Demo** switch on. It is labelled on screen and never mixed with the live class.

## Does it work

- 26 automated tests cover the rules above: grounding, the hint limit, questions always being answered, step checks, and the full teacher-to-student flow.
- `server/demo-run.mjs` runs a whole lesson against a running server with one teacher and four students, and checks 12 things end to end. On the live app, with real keys, it passed 12 of 12, including real AI decisions and audio. In that run a task became steps on every screen in about 1.3 seconds.

## Run it yourself

It is developed and hosted on Replit, which is the simplest way to run it: import this repository, add the secrets below, and press Run.

| Secret | Needed for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Both agents |
| `ELEVENLABS_API_KEY` | Voice in and out (permissions: Text to Speech, Speech to Text, Voices read) |
| `ELEVENLABS_VOICE_ID` | Optional. Which voice to use; without it the first voice on the account is used |
| `VITE_ELEVENLABS_AGENT_ID` | Optional. The live voice conversation on the student page |

Without the keys the app still runs: steps fall back to a simple sentence splitter and are labelled "Basic steps (AI unavailable)", so nothing staged is ever passed off as AI.

From the repository root:

```bash
pnpm install
```

```bash
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/classroom-link run dev
```

Tests, from `artifacts/classroom-link`:

```bash
node --test server/*.test.mjs
```

The full demo run, against a running server:

```bash
node server/demo-run.mjs http://localhost:5000
```

## What's next

- **Other subjects.** Anything done on a screen: writing, maths, science labs. The steps agent already works on any spoken instruction; the live checks are what change per subject.
- **A browser extension**, so CoTeach AI sits on top of the tools schools already use and nobody has to switch platforms.
- **Accounts and classes**, so a teacher's lessons and students carry over from day to day.
- **After-class summaries** for the teacher: which instructions students lost most often, and who needed help.

## Team

Nabiha: teacher side and server (steps agent, student agent, voice, teacher page).
Amber: student side (editor, live preview, the CoTeach AI panel, voice conversation).
