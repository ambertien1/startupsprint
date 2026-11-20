import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useStudentFade } from '../student/useStudentFade';
import { ConversationProvider } from '@elevenlabs/react';
import { useFadeConversation } from '../student/useFadeConversation';
import { buildPreview } from '../student/lesson';
import { StudentCodeEditor } from '../student/StudentCodeEditor';
import '../student/student.css';

const STATUS_LABEL = { connecting: 'Connecting', online: 'Connected', offline: 'Offline' } as const;
const CONV_LABEL = { idle: 'Talk to Fade', connecting: 'Connecting to Fade', listening: 'Fade is listening', speaking: 'Fade is speaking' } as const;
const SR: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

function FadeAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="fs-avatar">
      <circle cx="20" cy="20" r="19" fill="#2b3a4a" />
      <circle cx="14.5" cy="18" r="2.4" fill="#e8eef5" />
      <circle cx="25.5" cy="18" r="2.4" fill="#e8eef5" />
      <path d="M13.5 25.5c3.6 3 9.4 3 13 0" stroke="#e8eef5" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Student() {
  return (
    <ConversationProvider>
      <StudentWorkspace />
    </ConversationProvider>
  );
}

function StudentWorkspace() {
  const f = useStudentFade();
  const step = f.steps[f.currentStepIndex] ?? null;
  const conversation = useFadeConversation({ studentId: f.studentId, html: f.html, css: f.css, step });
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState<'html' | 'css'>('html');
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const cssRef = useRef<HTMLTextAreaElement>(null);
  const setSuppressed = useRef(f.setVoiceSuppressed);
  setSuppressed.current = f.setVoiceSuppressed;

  useEffect(() => { document.title = 'My Website · Fade'; }, []);
  useEffect(() => { setSuppressed.current(conversation.active); }, [conversation.active]);
  useEffect(() => { setOpen(true); }, [f.message]);
  useEffect(() => { if (conversation.transcripts.length) setOpen(true); }, [conversation.transcripts]);
  useEffect(() => { if (conversation.active) setOpen(true); }, [conversation.active]);

  const srcDoc = useMemo(() => buildPreview(f.html, f.css), [f.html, f.css]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = question.trim();
    if (!t) return;
    if (f.askQuestion(t)) setQuestion('');
  };

  const focusFile = (which: 'html' | 'css') => {
    setFocused(which);
    (which === 'html' ? htmlRef : cssRef).current?.focus();
  };

  const m = f.message;
  const recent = conversation.transcripts.slice(-4);
  const showPanel = open;

  return (
    <div className="fade-student" onClickCapture={f.unlockAudio}>
      <header className="fs-top">
        <span className="fs-title">My Website</span>
        <div className="fs-who">
          <span data-testid="text-student-name">{f.name}</span>
          <span className="fs-status" data-testid="status-connection">
            <span className="fs-dot" data-s={f.status} aria-hidden="true" />
            {STATUS_LABEL[f.status]}
          </span>
        </div>
      </header>

      <div className="fs-body">
        <nav className="fs-rail" aria-label="Workspace">
          <span className="fs-rail-i" data-on="true" title="Files" aria-label="Files">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3h9l5 5v13H5z M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          </span>
        </nav>

        <aside className="fs-side">
          <p className="fs-label">Files</p>
          <ul className="fs-files">
            <li><button type="button" className="fs-file" data-on={focused === 'html'} onClick={() => focusFile('html')} data-testid="file-index"><span className="fs-fi fs-fi-html" aria-hidden="true">&lt;&gt;</span>index.html</button></li>
            <li><button type="button" className="fs-file" data-on={focused === 'css'} onClick={() => focusFile('css')} data-testid="file-style"><span className="fs-fi fs-fi-css" aria-hidden="true">#</span>style.css</button></li>
          </ul>

          <p className="fs-label">Steps</p>
          <ol className="fs-steps">
            {f.steps.map((s, i) => {
              const current = i === f.currentStepIndex && !s.done;
              return (
                <li key={s.id} className="fs-step" data-current={current} data-done={s.done} aria-current={current ? 'step' : undefined} data-testid={`step-${s.id}`}>
                  <span className="fs-mark" aria-hidden="true">
                    {s.done ? <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
                  </span>
                  <span>{s.text}{s.done ? <span style={SR}> (done)</span> : null}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="fs-editors" aria-label="Your code">
          <StudentCodeEditor ref={htmlRef} id="fs-html" filename="index.html" lang="html" value={f.html} onChange={f.setHtml} testId="input-html" active={focused === 'html'} onFocus={() => setFocused('html')} />
          <StudentCodeEditor ref={cssRef} id="fs-css" filename="style.css" lang="css" value={f.css} onChange={f.setCss} testId="input-css" active={focused === 'css'} onFocus={() => setFocused('css')} />
        </main>

        <section className="fs-preview" aria-label="Live preview">
          <div className="fs-tabs"><span className="fs-tab">Preview</span></div>
          <iframe title="Live preview of your page" sandbox="" srcDoc={srcDoc} data-testid="frame-preview" />
        </section>
      </div>

      <div className="fs-dock">
        <div className="fs-pop" data-open={showPanel} role="region" aria-label="Fade" aria-hidden={!showPanel}>
          <div className="fs-pop-head">
            <FadeAvatar size={34} />
            <span className="fs-pop-name">Fade</span>
            <button type="button" className="fs-x" onClick={() => setOpen(false)} aria-label="Dismiss Fade message" data-testid="button-dismiss-fade" tabIndex={showPanel ? 0 : -1}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <p className="fs-message" data-testid="text-fade-message">{m.text}</p>
            {m.lesson_quote ? <blockquote className="fs-quote" data-testid="text-lesson-quote">From the lesson: “{m.lesson_quote}”</blockquote> : null}
            {m.code_quote ? <blockquote className="fs-quote" data-testid="text-code-quote">In your code: <code>{m.code_quote}</code></blockquote> : null}
          </div>

          {conversation.active || recent.length ? (
            <div className="fs-convo" data-testid="status-conversation">
              {conversation.active ? <p className="fs-cstate" data-s={conversation.state}>{CONV_LABEL[conversation.state]}</p> : null}
              {recent.length ? (
                <ul className="fs-trans" aria-label="Conversation">
                  {recent.map((t) => (
                    <li key={t.id} data-src={t.source}><span className="fs-who-l">{t.source === 'fade' ? 'Fade' : 'You'}</span>{t.text}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="fs-actions">
            <button type="button" className="fs-btn" onClick={() => { if (!conversation.repeat()) f.replay(); }} data-testid="button-say-again" tabIndex={showPanel ? 0 : -1}>Say it again</button>
            <button type="button" className="fs-btn fs-btn-pri" onClick={() => f.askQuestion('Can I have a hint?')} data-testid="button-hint" tabIndex={showPanel ? 0 : -1}>Hint</button>
          </div>

          {conversation.fallback ? (
            <form className="fs-ask" onSubmit={submit}>
              <label htmlFor="fs-question" style={SR}>Type a question</label>
              <input id="fs-question" ref={f.questionInputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Type a question" data-testid="input-question" />
              <button type="submit" className="fs-btn" disabled={!question.trim()} data-testid="button-ask">Ask</button>
            </form>
          ) : null}
          {conversation.note || f.questionNote ? (
            <p className="fs-note" aria-live="polite" data-testid="text-question-note">{[conversation.note, f.questionNote].filter(Boolean).join(' ')}</p>
          ) : null}
        </div>

        <button
          type="button"
          className="fs-talk"
          data-s={conversation.state}
          aria-pressed={conversation.active}
          aria-label={conversation.active ? 'End conversation with Fade' : 'Talk to Fade'}
          title={conversation.active ? 'End conversation' : 'Talk to Fade'}
          onClick={() => { setOpen(true); void conversation.toggle(); }}
          data-testid="button-talk-to-fade"
        >
          {conversation.active ? (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
