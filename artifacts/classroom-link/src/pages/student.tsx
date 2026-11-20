import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useStudentFade } from '../student/useStudentFade';
import { useHoldToAsk } from '../student/useHoldToAsk';
import { buildPreview } from '../student/lesson';
import { StudentCodeEditor } from '../student/StudentCodeEditor';
import '../student/student-v2.css';

const STATUS_LABEL = { connecting: 'Connecting', online: 'Connected', offline: 'Offline' } as const;
const ASK_LABEL = { idle: 'Hold to ask a question', listening: 'Listening… let go when done', thinking: 'Fade is thinking…' } as const;

const I = {
  code: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" /></svg>,
  hash: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17" /></svg>,
  play: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></svg>,
  expand: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  screen: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></svg>,
  plus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  x: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  minus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>,
  popout: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>,
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  mic: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></svg>,
};

function FadeMark() {
  return (
    <svg viewBox="0 0 40 40" className="sv-mark" aria-hidden="true">
      <defs>
        <linearGradient id="svLeafA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9e38a" /><stop offset="1" stopColor="#6fbf5f" /></linearGradient>
        <linearGradient id="svLeafB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8fd47a" /><stop offset="1" stopColor="#3f9a55" /></linearGradient>
      </defs>
      <path d="M6 30c0-9 5-14 13-14h3v3c0 8-5 13-13 13H6z" fill="url(#svLeafB)" />
      <path d="M15 22c0-9 5-15 14-15h5v5c0 9-6 15-15 15h-4z" fill="url(#svLeafA)" />
    </svg>
  );
}

type Turn = { from: 'you' | 'fade'; text: string; kind?: string; lesson?: string | null; code?: string | null };

export default function Student() {
  const f = useStudentFade();
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState(true);
  const [wide, setWide] = useState(false);
  const [focus, setFocus] = useState(false);
  const [typing, setTyping] = useState(false);
  const [file, setFile] = useState<'html' | 'css'>('html');
  const [run, setRun] = useState(0);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const cssRef = useRef<HTMLTextAreaElement>(null);
  // The panel keeps two things apart: what to do now (guide) and the
  // back-and-forth of questions and hints (thread).
  const [guide, setGuide] = useState(f.message);
  const [thread, setThread] = useState<Turn[]>([]);
  const [waiting, setWaiting] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const you = (text: string) => { setThread((t) => [...t, { from: 'you' as const, text }].slice(-8)); setWaiting(true); };
  const ask = (text: string) => { const sent = f.askQuestion(text); if (sent) you(text); return sent; };
  const hint = () => { f.requestHint(); you('Can I have a hint?'); };
  const hold = useHoldToAsk(ask);

  useEffect(() => { document.title = 'My Website · Fade'; }, []);
  useEffect(() => {
    setOpen(true);
    const msg = f.message;
    if (msg.kind === 'hint' || msg.kind === 'answer' || msg.kind === 'fallback') {
      setThread((t) => [...t, { from: 'fade' as const, text: msg.text, kind: msg.kind, lesson: msg.lesson_quote, code: msg.code_quote }].slice(-8));
      setWaiting(false);
    } else {
      setGuide(msg);
    }
  }, [f.message]);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWaiting(false), 15000);
    return () => window.clearTimeout(timer);
  }, [waiting, thread.length]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [thread.length, waiting]);

  const srcDoc = useMemo(() => buildPreview(f.html, f.css), [f.html, f.css]);
  const m = guide;

  // "Hi Maya! First, add a title…" → a greeting line and the instruction under it.
  const split = /^(.{1,28}?[!.?])\s+(.+)$/s.exec(m.text);
  const heading = split ? split[1] : m.kind === 'cheer' ? 'Nice work!' : `Hi ${f.name}!`;
  const body = split ? split[2] : m.text;

  const openFile = (which: 'html' | 'css') => {
    setFile(which);
    window.setTimeout(() => (which === 'html' ? htmlRef : cssRef).current?.focus(), 0);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = question.trim();
    if (t && ask(t)) setQuestion('');
  };
  const note = hold.note.startsWith('You asked') ? '' : hold.note;
  const pct = f.steps.length ? Math.round((f.steps.filter((x) => x.done).length / f.steps.length) * 100) : 0;
  const doneCount = f.steps.filter((s) => s.done).length;

  return (
    <div className="fade-student sv" onClickCapture={f.unlockAudio} data-focus={focus}>
      <div className="sv-window">
        <div className="sv-chrome">
          <span className="sv-lights" aria-hidden="true"><i /><i /><i /></span>
          <span className="sv-wtab">{I.code}<span>My Website</span><span className="sv-wtab-x" aria-hidden="true">{I.x}</span></span>
          <span className="sv-wplus" aria-hidden="true">{I.plus}</span>
        </div>

        <header className="sv-bar">
          <span className="sv-tile">{I.code}</span>
          <h1 className="sv-title">My Website</h1>
          <div className="sv-who">
            <span data-testid="text-student-name">{f.name}</span>
            <span className="sv-conn" data-s={f.status} data-testid="status-connection"><i aria-hidden="true" />{STATUS_LABEL[f.status]}</span>
          </div>
          <button type="button" className="sv-run" onClick={() => setRun((n) => n + 1)} data-testid="button-run">{I.play}Run</button>
          <button type="button" className="sv-sq" onClick={() => setFocus((v) => !v)} aria-pressed={focus} aria-label={focus ? 'Show files' : 'Focus on code and preview'} title={focus ? 'Show files' : 'Focus mode'}>{I.expand}</button>
        </header>

        <div className="sv-body">
          <aside className="sv-files" aria-label="Files">
            <div className="sv-files-head"><span>Files</span><span aria-hidden="true">{I.plus}</span></div>
            <ul>
              <li><button type="button" className="sv-file" data-on={file === 'html'} onClick={() => openFile('html')} data-testid="file-index">{I.code}index.html</button></li>
              <li><button type="button" className="sv-file" data-on={file === 'css'} onClick={() => openFile('css')} data-testid="file-style">{I.hash}style.css</button></li>
            </ul>
          </aside>

          <main className="sv-editor" aria-label="Your code">
            <div className="sv-etabs" role="tablist" aria-label="Open files">
              <button type="button" role="tab" aria-selected={file === 'html'} className="sv-etab" onClick={() => openFile('html')}>index.html</button>
              <button type="button" role="tab" aria-selected={file === 'css'} className="sv-etab" onClick={() => openFile('css')}>style.css</button>
            </div>
            <div className="sv-epane" hidden={file !== 'html'}>
              <StudentCodeEditor ref={htmlRef} id="fs-html" filename="index.html" lang="html" value={f.html} onChange={f.setHtml} testId="input-html" active={file === 'html'} onFocus={() => setFile('html')} />
            </div>
            <div className="sv-epane" hidden={file !== 'css'}>
              <StudentCodeEditor ref={cssRef} id="fs-css" filename="style.css" lang="css" value={f.css} onChange={f.setCss} testId="input-css" active={file === 'css'} onFocus={() => setFile('css')} />
            </div>
          </main>

          <section className="sv-preview" aria-label="Live preview">
            <div className="sv-phead">{I.screen}<span>Preview</span></div>
            <iframe key={run} title="Live preview of your page" sandbox="" srcDoc={srcDoc} data-testid="frame-preview" />
          </section>
        </div>
      </div>

      {/* Fade: the floating helper */}
      <section className="sv-fade fs-pop" data-open={open} data-wide={wide} aria-label="Fade">
        <header className="sv-fhead">
          <FadeMark />
          <span className="sv-fname">Fade</span>
          {f.steps.length > 0 && <span className="sv-count" aria-label={`${doneCount} of ${f.steps.length} steps done`}>{doneCount}/{f.steps.length}</span>}
          <button type="button" className="sv-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Minimize Fade' : 'Open Fade'} data-testid="button-dismiss-fade">{I.minus}</button>
          <button type="button" className="sv-ghost" onClick={() => { setWide((v) => !v); setOpen(true); }} aria-pressed={wide} aria-label={wide ? 'Make Fade smaller' : 'Make Fade larger'}>{I.popout}</button>
        </header>

        <div className="sv-fbody" hidden={!open}>
          {/* 1. What to do now */}
          <div className="sv-say" aria-live="polite" aria-atomic="true">
            <button type="button" className="sv-orb" key={m.text} onClick={f.replay} aria-label="Say it again" title="Say it again" data-testid="button-say-again">
              <span className="sv-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            </button>
            <div className="sv-say-text">
              <p className="sv-hi">{heading}</p>
              <p className="sv-msg" data-testid="text-fade-message">{body}</p>
            </div>
          </div>

          {/* 2. The steps, in order */}
          <section className="sv-sec" aria-labelledby="sv-steps-h">
            <div className="sv-sec-head">
              <h2 id="sv-steps-h">Your steps</h2>
              {f.steps.length > 0 && <span className="sv-sec-meta">{doneCount} of {f.steps.length} done</span>}
            </div>
            {f.steps.length > 0 && <div className="sv-prog" aria-hidden="true"><span style={{ transform: `scaleX(${pct / 100})` }} /></div>}
            {f.steps.length ? (
              <ol className="sv-steps">
                {f.steps.map((s, i) => {
                  const current = i === f.currentStepIndex && !s.done;
                  return (
                    <li key={s.id} className="sv-step" data-current={current} data-done={s.done} aria-current={current ? 'step' : undefined} data-testid={`step-${s.id}`}>
                      <span className="sv-n" aria-hidden="true">{i + 1}</span>
                      <span className="sv-stext">
                        <span className="sv-tag">{s.done ? 'Done' : current ? 'Now' : 'Next'}</span>
                        {s.text}
                      </span>
                      <span className="sv-tick" aria-hidden="true">{s.done ? I.check : null}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="sv-empty">Your steps will show up here when your teacher gives a task.</p>
            )}
          </section>

          {/* 3. Questions and hints, as a conversation */}
          {(thread.length > 0 || waiting) && (
            <section className="sv-sec" aria-labelledby="sv-chat-h">
              <div className="sv-sec-head"><h2 id="sv-chat-h">Questions</h2></div>
              <ol className="sv-chat" aria-live="polite">
                {thread.map((t, i) => (
                  <li key={i} className="sv-turn" data-from={t.from}>
                    <span className="sv-turn-who">{t.from === 'you' ? 'You' : t.kind === 'hint' ? 'Fade · hint' : 'Fade'}</span>
                    <p className="sv-bubble">{t.text}</p>
                    {t.from === 'fade' && (t.lesson || t.code) ? (
                      <div className="sv-quotes">
                        {t.lesson ? <p data-testid="text-lesson-quote"><span>Your teacher said</span>“{t.lesson}”</p> : null}
                        {t.code ? <p data-testid="text-code-quote"><span>In your code</span><code>{t.code}</code></p> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
                {waiting && <li className="sv-turn" data-from="fade"><span className="sv-turn-who">Fade</span><p className="sv-bubble sv-dots" aria-label="Fade is thinking"><i /><i /><i /></p></li>}
              </ol>
              <div ref={threadEnd} />
            </section>
          )}
        </div>

        {/* 4. Ask: always in the same place */}
        <footer className="sv-foot" hidden={!open}>
          <button
            type="button"
            className="sv-ask"
            data-s={hold.phase}
            disabled={hold.phase === 'thinking'}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); void hold.start(); }}
            onPointerUp={hold.stop}
            onPointerCancel={hold.stop}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void hold.start(); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold.stop(); } }}
            data-testid="button-talk-to-fade"
          >
            <span className="sv-mic" aria-hidden="true">{I.mic}</span>
            <span>{ASK_LABEL[hold.phase]}</span>
          </button>
          <div className="sv-row">
            <button type="button" className="sv-link" onClick={hint} data-testid="button-hint">Give me a hint</button>
            <button type="button" className="sv-link" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>{typing ? 'Hide typing' : 'Type instead'}</button>
          </div>
          {typing && (
            <form className="sv-type" onSubmit={submit}>
              <label htmlFor="fs-question" className="sv-sr">Type a question</label>
              <input id="fs-question" ref={f.questionInputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Type a question" data-testid="input-question" autoFocus />
              <button type="submit" disabled={!question.trim()} data-testid="button-ask">Ask</button>
            </form>
          )}
          {note ? <p className="sv-note" aria-live="polite" data-testid="text-question-note">{note}</p> : null}
        </footer>
      </section>
    </div>
  );
}
