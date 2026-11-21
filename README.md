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
| **Example class, teacher view** | https://deep-naive-files.replit.app/teacher?demo |
| **Example lesson, student view** | https://deep-naive-files.replit.app/student?demo |

The two **Demo** links open an example with sample students and a sample lesson, clearly labelled on screen, so you can see the whole product in ten seconds. Every page also has a Demo switch. The other links are the real, live product.

To try it live: open the teacher page and one or two student pages in separate tabs, click once on each student page so sound can play, then press **Start listening** on the teacher page and teach. Use Chrome and allow the microphone. Typing works everywhere as a fallback ("Type instead").

---

## 1. Problem understanding and user evidence

### The problem

In a classroom, instructions are given once, out loud, in the middle of everything else the teacher is saying. To act on them a student has to catch them, hold all of them in mind, put them in order, and start, while the lesson keeps moving.

For many students that is the hardest part of the task, and it has nothing to do with whether they can do the work. A student who is "stuck" is very often not stuck on the idea. They are stuck on what they were supposed to do next.

### What the research says

**Following multi-step spoken instructions depends on working memory, and classrooms overload it.** Researchers Susan Gathercole and Tracy Alloway, who studied working memory in classrooms for years, describe children with poor working memory as struggling to follow multi-step instructions and losing their place in tasks. A typical sign is a child who completes the first step, then loses track and copies what the rest of the class is doing. Their classroom guidance recommends exactly what CoTeach AI automates: shorter instructions, given one step at a time, with something the student can look back at.
Sources: [MRC Cognition and Brain Sciences Unit, "Understanding how working memory problems impair classroom learning"](https://www.mrc-cbu.cam.ac.uk/our-research/gathercole/classroom-learning/) · [Gathercole and Alloway, *Understanding Working Memory: A Classroom Guide*](https://calm.mrc-cbu.cam.ac.uk/wp-content/uploads/calm/sites/5/2024/03/WM-classroom-guide.pdf) · [Dunning, Holmes and Gathercole, *Developmental Science* (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4232921/)

**The students this affects most are a large part of every class.**

| Who | How many | Source |
| --- | --- | --- |
| Students receiving special education services (IDEA), 2022–23 | 7.5 million, about 15% of all US public school students | [NCES](https://nces.ed.gov/programs/coe/indicator/cgg/students-with-disabilities) |
| Of those, students with a specific learning disability such as dyslexia | 32%, the largest single category | [NCES](https://nces.ed.gov/programs/coe/indicator/cgg/students-with-disabilities) |
| US children aged 3–17 ever diagnosed with ADHD (2022, parent-reported) | 11.4%, about 7.1 million, roughly 1 in 9 | [CDC](https://www.cdc.gov/adhd/data/index.html) |
| 8-year-olds identified with autism (2022 data, 16 monitoring sites) | About 1 in 31 | [CDC ADDM report, as reported by NBC News](https://www.nbcnews.com/health/health-news/autism-rates-up-cdc-report-2025-rfk-jr-rcna201305) |

**And they are in the general classroom.** Roughly two-thirds of students with disabilities spend 80% or more of their school day in general classes ([Education Week, from federal data](https://www.edweek.org/teaching-learning/special-education-definition-statistics-and-trends/2019/12); see also [NCES](https://nces.ed.gov/fastfacts/display.asp?id=59)). That means one teacher, one set of spoken instructions, and a room where several students need those instructions in a different form.

These figures come from the linked sources. We did not collect them ourselves.

### Why this helps every classroom, not only students with a diagnosis

The need is widest where it is least visible:

- **English learners** are 10.6% of US public school students, about 5.3 million ([NCES, fall 2021](https://nces.ed.gov/programs/coe/indicator/cgf/english-learners)). Hearing an instruction once in a second language is hard. Reading it, step by step, in the teacher's own key words, is far easier.
- **Any student who looked away for five seconds**, came in late, or was finishing the last task. Today they either interrupt the lesson or quietly fall behind.
- **Students who won't ask.** In a room of screens, the quiet student who is stuck looks exactly like the one who is fine.
- **The teacher.** Every minute spent repeating the same three steps to five students is a minute not spent teaching.

This is the idea behind Universal Design for Learning, the framework many schools already use: build the support into the lesson for everyone, so no one has to be singled out to get it. One of its core guidelines is to offer alternatives for auditory information, such as text for spoken language ([CAST UDL Guidelines](https://udlguidelines.cast.org/)). It is the classroom version of the curb cut: built for wheelchairs, used by everyone with a stroller or a suitcase. Because the whole class uses CoTeach AI, the student who needs it most is just another student using it.

### Our evidence: what we have seen teaching

We are not guessing at this problem. We are the users.

**Nabiha has taught a lot of coding camps**, with students of different ages and different needs in the same room. A coding task is a chain of small steps, and it is very easy to get lost in the middle of one. A student misses one instruction, or gets sidetracked for a moment, and from then on they are not behind on the idea, they are behind on *where we are*. The same instructions get repeated to one student after another, and the students who need the most support are usually the ones who lose the thread first.

**Amber teaches math**, and the same thing happens there. A problem is a sequence of steps too. Students are unsure what to do first and where to go next, and a lot of teaching time goes into saying the same thing again rather than moving forward.

What we have both seen, in two different subjects:

- **A lot of repetition.** The same instruction, given again and again, one student at a time.
- **A lot of confusion about what to do and where to go next**, far more often than confusion about the idea itself.
- **Not enough of us.** One teacher cannot help every student perfectly and still keep the lesson on time. There is a set amount of content and a strict time frame. Every minute spent re-explaining steps to one student is a minute the rest of the class is waiting, or a minute cut from the lesson.

With students who have different needs, we have seen it show up in specific ways:

- **Students with attention differences such as ADHD** catch the first step and miss the rest, or get sidetracked partway through and cannot find their place again. They are often the first to be told off for being off task, when what they have lost is the instruction.
- **Students with dyslexia or other reading differences** are not helped much by a long block of instructions on the board. Rereading it costs them the time everyone else spends working, so they start behind every time.
- **Autistic students** can stall on instructions that are vague or implied ("finish that off", "do the next bit"). They do much better with one literal step at a time, and a change of plan in the middle of a task is hard without something to look back at.
- **Students who process more slowly** are still working on step one when step three is given. By the time they look up, the class has moved on.
- **Students who are anxious about asking** stay quiet. They would rather sit stuck than be seen needing help again, and being helped out loud in front of everyone is exactly what they are trying to avoid.
- **The students who need the most support often get it last.** The students who call out get attention first, and the quiet student who has been stuck for ten minutes is the one we find at the end.

None of these students lack the ability to do the task. What they lack is the instruction, in a form they can hold on to, at the moment they need it.

That last point is getting harder, not easier. At the start of the 2024–25 school year, 74% of US public schools reported difficulty filling at least one teaching position with a fully certified teacher, and special education positions were the hardest of all to fill ([NCES School Pulse Panel](https://nces.ed.gov/learn/press-release/most-u-s-public-elementary-and-secondary-schools-faced-hiring-challenges-start-2024-25-academic-year)). The students who most need a patient adult beside them are in classrooms that have the fewest adults to spare.

**We would use this ourselves.** In a coding camp it would hold every student's place in the steps, so nobody is lost just because they looked away. In a math class it would do the same for the steps of a problem. It would give us back the time we spend repeating instructions and let us spend it on the students who need a person. And because what we have seen is the same in coding and in math, we are confident other teachers would find it useful too: the problem is not the subject, it is spoken multi-step instructions and one teacher for a whole room.

**What we have not done yet:** we built this in four hours and have not run it with a real class. Our evidence today is the research above and our own experience teaching. Putting it in front of real students and teachers is the first next step (Section 4).

---

## 2. Usefulness and product experience

### For the teacher: nothing new to do

1. **She clicks once and teaches.** There is no form to fill in and no "task" button to remember. CoTeach AI listens and keeps the lesson transcript.
2. **It picks the instructions out of the lesson.** Explaining ("HTML is made of tags") creates nothing. An instruction ("now add a title with an h1 tag, then a paragraph under it") becomes short, ordered steps in her own key words.
3. **She sees one plain sentence per student**, stuck students first: "Maya is on step 2 of 3", "Leo needs you". A stuck student's card shows the reason, their code, and what CoTeach AI already tried, so she arrives knowing what to say.
4. **She can check what it heard** ("View transcript") and see why it did anything ("How CoTeach AI decided").

### For the student: always know the next step

1. **Steps appear in about a second**, and CoTeach AI says the current one aloud by name: "Hi Maya! First, add a title to your page with an h1 tag."
2. **One step is marked "Now".** The others are "Done" or "Next", with a progress bar. A student who lost track can see exactly where they are, and press **Say it again** as often as they like.
3. **It follows their work as they type.** When a step is right it ticks, and CoTeach AI moves them on: "Nice work, Maya! Step 1 is done. Next, …"
4. **They can ask out loud or by typing.** The answer comes from what the teacher said, in her words, with a hint and never the finished answer. A "Why CoTeach AI said this" toggle shows the teacher's sentence and the part of their own code it was talking about.
5. **If they get stuck, it notices.** When they stop typing with a step unfinished, it looks at their code and decides whether to nudge, wait, or bring in the teacher. If it calls the teacher, it tells the student so.

### Design choices made for the students who need it most

- One short sentence per step, at about a 5th-grade reading level, one action per step.
- Status is never shown by colour alone: every chip has an icon and a word.
- CoTeach AI is not allowed to say "wrong", "mistake" or "error". It names what is working first.
- Voice and text always appear together, and every microphone feature has a typed fallback.
- Steps and conversation are on separate tabs, so the list of what to do is never pushed off screen by a chat.

The demo lesson is HTML because code can be checked live, but the same flow works for any subject where students work on a screen.

---

## 3. Technical execution

### How it is built

- **One Node server** (Express + Socket.IO) serves both pages and holds the classroom in memory. No database and no logins, so there is nothing to set up before a lesson.
- **React** front end for the teacher and student pages.
- **Claude** (Anthropic API) runs two agents, with structured output and tool use.
- **ElevenLabs** provides speech-to-text for the teacher's microphone and students' questions, text-to-speech for CoTeach AI's voice, and a live voice conversation on the student page.
- **Replit** for building and hosting.

### The two agents

**The steps agent** hears everything the teacher says and first decides one thing: did she just give the class a task? If not, nothing changes on any screen. If so, it rewrites it: one action per step, ordered by when to do it rather than when she said it, corrections applied ("blue, no wait, purple" becomes purple), filler dropped, her key words kept. Later instructions update the list without resetting anyone's progress. When it is unsure whether something was a task, it treats it as not a task rather than guessing.

**The student agent** is woken by a pause, a hint request, or a question. Nothing it does is scripted. It has three evidence tools (read the student's code, run the step checks, get the lesson and hint history) and three actions (speak, flag the teacher, wait), and it chooses.

### The decisions we made, and why

| Decision | Why |
| --- | --- |
| **The teacher never marks what is a task.** One stream of speech; the AI finds the instructions. | A button she has to press before giving instructions is one more thing to forget, and it turns the product into a voice-typed form. Telling "the h1 tag makes a big title" apart from "now add a title with an h1 tag" is the hard, valuable part. |
| **Rules are enforced in code, not only in the prompt.** | A prompt is a request. We wanted guarantees. The server rejects any action that breaks a rule and makes the agent try again. |
| **Every spoken line must be grounded.** It carries an exact quote from the student's code and an exact quote from the teacher's lesson, and the server checks both really exist. | This is what stops an AI helper inventing things or drifting from what the teacher taught. A made-up quote is refused. |
| **A question always gets an answer; a hint budget cannot silence it.** | In testing, a question once went unanswered because hints had run out. We changed the rule: answers never count as hints, and if the lesson did not cover it, CoTeach AI says the teacher has not covered that yet. |
| **The server watches each student, not the page.** | The server re-checks a student each time they stop typing on an unfinished step, and keeps looking at a stuck student until the step passes or the teacher is called. It does not depend on the student pressing anything. |
| **The fast Claude model for both agents.** | Steps have to arrive while the teacher's sentence is still in the air. On the live app a task became steps on every screen in about 1.3 seconds. |
| **Anything not from the AI is labelled.** | If the AI cannot be reached, a plain sentence splitter produces steps and the teacher page says "Basic steps (AI unavailable)". Nothing staged is ever passed off as AI. |
| **Every tool call is logged and shown.** | The teacher page shows what the agent read, what it tried, and what was rejected, under "How CoTeach AI decided". The reasoning is visible, not a black box. |

Other rules the server enforces on the student agent: it must read the student's code before acting; it cannot say "wrong", "mistake" or "error"; it can only cheer when every check passes; hints are limited, after which it must bring in the teacher and tell the student.

### How we know it works

- **26 automated tests** cover the rules above: grounding, the hint limit, questions always being answered, step checks, live progress, and the full teacher-to-student flow.
- **An end-to-end run** (`server/demo-run.mjs`) plays a whole lesson against a running server with one teacher and four students and checks 12 things, from "explaining creates no steps" to "Leo needs you reaches the teacher with a reason and his code".
- **On the live app, with real keys, that run passed 12 of 12**, including real AI decisions and generated audio.

### What is live and what is set up for the demo

We would rather be exact about this.

- **Live:** the real-time sync, the microphone and transcription, both AI agents and every decision they make, the grounding checks, the voice, the step checks, and the "needs you" flag.
- **Set up for the demo:** one lesson, students who join by a name in the link (Maya by default), and Leo, who starts with a deliberately unfinished line of code so there is a stuck student to show.
- **Sample data:** anything shown with the **Demo** switch on. It is labelled on screen and never mixed with the live class.

### Where things live

| Path | What it is |
| --- | --- |
| `artifacts/classroom-link/server.mjs` | The one server: pages, sockets, audio |
| `artifacts/classroom-link/server/stepsAgent.mjs` | Teacher's words into steps |
| `artifacts/classroom-link/server/studentAgent.mjs` | The student agent and its grounding rules |
| `artifacts/classroom-link/server/checks.mjs` | Live checks for each step |
| `artifacts/classroom-link/server/classroom.mjs` | Socket events, classroom state, the watching loop |
| `artifacts/classroom-link/server/voice.mjs`, `stt.mjs` | Speech out and speech in |
| `artifacts/classroom-link/server/*.test.mjs`, `demo-run.mjs` | Tests and the end-to-end run |
| `artifacts/classroom-link/src/teacher/` | Teacher page |
| `artifacts/classroom-link/src/pages/student.tsx`, `src/student/` | Student page |
| `CLAUDE.md` | The original plan and the full list of socket events |

---

## 4. Differentiation and next-step business reasoning

### What is different

Most classroom AI today sits in one of four places:

- **Live captions and transcription** write down everything the teacher says. They do not separate the instruction from the explanation, and a wall of text is no easier to follow than speech.
- **AI tutors and chatbots** wait for a student to ask, and many will simply give the answer. They do not know what this teacher said in this lesson.
- **Direction and worksheet generators** turn text a teacher types beforehand into steps. They do not work from live speech, and they produce one shared handout.
- **Classroom monitoring tools** watch student screens for off-task behaviour. They do not help the student do the task.

CoTeach AI does the part in between that none of those do: it **starts from the teacher's live voice**, finds the instruction inside the lesson with no extra action from her, gives **each student their own tracked steps**, follows their work as they type, and answers **in the teacher's own words**.

**As of right now, there is no platform targeting this use case.** Nothing on the market takes a teacher's live voice, in the moment she is teaching, and turns it into each student's own steps on their own screen. Every existing tool makes someone do extra work first: the teacher types the instructions ahead of time, or the student has to know what to ask. CoTeach AI is the first built around the way teaching actually happens: out loud, once, in real time.

Three things we think are hard to copy quickly:

1. **Grounding checked by code.** The helper can only say things backed by an exact quote from the lesson and from the student's work.
2. **The teacher stays the authority.** It repeats her, it does not replace her, and it hands the student back to her when it should.
3. **Whole-class by design.** It is not a special-education add-on, so a school can adopt it for everyone and the students who need it most are never singled out.

### Next steps

**1. Prove it in private programs.** We have not tested with students yet. The first step is a handful of real sessions in the kinds of programs we teach in: coding camps and math tutoring. We would measure two things: how often students ask for instructions to be repeated, and how long a stuck student waits before getting help.

**2. A Chrome extension, so it works on every site.** Today CoTeach AI is its own page with its own code editor. Schools already run on Google Docs, Google Classroom, Canvas, Desmos, Scratch and many others, and Chromebooks are common in classrooms. As a browser extension, the same CoTeach AI panel would float over whatever site the class is using, and the "follow the student's work" checks would read the page they are on. Nobody has to move their class to a new platform, which is usually the thing that stops a school adopting a new tool.

**3. Beyond coding.** The steps agent already works on any spoken instruction. What changes per subject is how a step is checked: text in a document, an answer in a maths tool, a completed field in a form. We would add subjects one check type at a time.

**4. What a real product needs.** Accounts and classes so lessons carry over; student data privacy built for schools before any real deployment; and after-class summaries for the teacher showing which instructions students lost most often and who needed help.

### Business reasoning

- **Where we start: the private sector, to prove the concept.** Coding camps, tutoring and math learning centres, and after-school and enrichment programs. These are the settings we teach in ourselves, so we can get it in front of real students quickly. They decide in days rather than budget cycles, they have small groups where one instructor covers many students on screens, and they compete on how much individual attention each student gets, which is exactly what CoTeach AI stretches.
- **What the proof of concept has to show:** in a handful of real sessions, that students ask for instructions to be repeated less often, that stuck students wait less time for help, and that instructors would choose to keep using it. Those results are what we would take to schools.
- **Where it goes next: schools and districts.** The larger market and the slower sale, with procurement and student-privacy requirements we would meet before any school deployment. Evidence from private programs is what earns that conversation.
- **Who pays:** the program or learning centre first, and later the school or district, per classroom or per instructor. Not families and not students.
- **Why they would:** it supports students with learning differences inside the general classroom, where about two-thirds of them already spend most of their day, without extra staff time, and it helps the whole class at the same time. With most schools reporting difficulty filling teaching positions, and special education the hardest to staff, a tool that gives one teacher more reach addresses a problem schools are already feeling.
- **What it costs to run:** both agents use Claude's fast model. From our prompt sizes, each AI decision costs a fraction of a cent at current API prices. This is our estimate, not a measured bill; voice is the larger cost and is the first thing we would measure in a pilot.

These are our hypotheses going in. The pilot in step 1 is what would confirm or change them.

---

## Run it yourself

It is developed and hosted on Replit, which is the simplest way to run it: import this repository, add the secrets below, and press Run.

| Secret | Needed for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Both agents |
| `ELEVENLABS_API_KEY` | Voice in and out (permissions: Text to Speech, Speech to Text, Voices read) |
| `ELEVENLABS_VOICE_ID` | Optional. Which voice to use; without it the first voice on the account is used |
| `VITE_ELEVENLABS_AGENT_ID` | Optional. The live voice conversation on the student page |

Without the keys the app still runs, with steps from the labelled fallback.

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

The full end-to-end run, against a running server:

```bash
node server/demo-run.mjs http://localhost:5000
```

## Team

Nabiha: teacher side and server (steps agent, student agent, voice, teacher page).
Amber: student side (editor, live preview, the CoTeach AI panel, voice conversation).

## Sources

- NCES, *Students With Disabilities*, Condition of Education: https://nces.ed.gov/programs/coe/indicator/cgg/students-with-disabilities
- NCES Fast Facts, inclusion of students with disabilities: https://nces.ed.gov/fastfacts/display.asp?id=59
- NCES, *English Learners in Public Schools*: https://nces.ed.gov/programs/coe/indicator/cgf/english-learners
- CDC, *Data and Statistics on ADHD*: https://www.cdc.gov/adhd/data/index.html
- CDC ADDM Network autism report (April 2025), as reported by NBC News: https://www.nbcnews.com/health/health-news/autism-rates-up-cdc-report-2025-rfk-jr-rcna201305
- Education Week, *Special Education: Definition, Statistics, and Trends*: https://www.edweek.org/teaching-learning/special-education-definition-statistics-and-trends/2019/12
- MRC Cognition and Brain Sciences Unit, working memory and classroom learning: https://www.mrc-cbu.cam.ac.uk/our-research/gathercole/classroom-learning/
- Gathercole and Alloway, *Understanding Working Memory: A Classroom Guide*: https://calm.mrc-cbu.cam.ac.uk/wp-content/uploads/calm/sites/5/2024/03/WM-classroom-guide.pdf
- Dunning, Holmes and Gathercole (2013), *Developmental Science*: https://pmc.ncbi.nlm.nih.gov/articles/PMC4232921/
- CAST, *Universal Design for Learning Guidelines*: https://udlguidelines.cast.org/
- NCES School Pulse Panel, hiring challenges at the start of 2024–25: https://nces.ed.gov/learn/press-release/most-u-s-public-elementary-and-secondary-schools-faced-hiring-challenges-start-2024-25-academic-year
