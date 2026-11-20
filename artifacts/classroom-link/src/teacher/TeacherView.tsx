import { useRef, useState, type KeyboardEvent } from 'react';
import * as D from '@radix-ui/react-dialog';
import {
  AlertTriangle, ArrowUp, Bell, Check, CircleCheck, FileText, Info, Layers, Mic, MicOff,
  Pause, Play, Plus, Users, UserPlus, X, XCircle, Zap, LoaderCircle, Pencil,
} from 'lucide-react';
import { MAX_LEN } from '@/lib/socket';
import type { StudentUpdate, TeacherViewProps, Step } from './types';
import './teacher-view.css';

type Tab = 'teach' | 'students' | 'history';

function decisionSummary(value: unknown, depth = 0): string {
  const shorten = (t: string) => (t.length > 320 ? `${t.slice(0, 317)}…` : t);
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return shorten(value.replace(/\s+/g, ' ').trim()) || 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'object') return String(value);
  if (depth > 2) return Array.isArray(value) ? `${value.length} items` : 'Additional details';
  if (Array.isArray(value)) {
    if (!value.length) return 'No items';
    return shorten(value.slice(0, 3).map(i => decisionSummary(i, depth + 1)).join('; ')
      + (value.length > 3 ? `; +${value.length - 3} more` : ''));
  }
  const entries = Object.entries(value);
  if (!entries.length) return 'No additional input';
  return shorten(entries.slice(0, 4).map(([k, i]) => `${k.replace(/_/g, ' ')}: ${decisionSummary(i, depth + 1)}`).join('; ')
    + (entries.length > 4 ? `; +${entries.length - 4} more fields` : ''));
}

function progress(s: StudentUpdate, total: number) {
  if (!total) return { label: 'No steps yet', pct: 0 };
  const pos = s.status === 'done' ? total : Math.min(total, Math.max(0, s.stepIndex) + 1);
  return { label: `Step ${pos} / ${total}`, pct: Math.round((pos / total) * 100) };
}

function statusMeta(s: StudentUpdate) {
  if (s.status === 'needs_help') return { label: 'Needs help', Icon: AlertTriangle, cls: 'help' };
  if (s.status === 'done') return { label: 'Done', Icon: CircleCheck, cls: 'done' };
  return { label: 'On track', Icon: Pencil, cls: 'track' };
}

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();

function StudentDetail({ student, online, pending, onHelp, total }: {
  student: StudentUpdate; online: boolean; pending: boolean; onHelp: (id: string) => void; total: number;
}) {
  const needsHelp = student.status === 'needs_help';
  const m = statusMeta(student);
  const p = progress(student, total);
  return (
    <article className={`td-detail ${needsHelp ? 'is-help' : ''}`} data-student-id={student.studentId} data-status={student.status}>
      <header className="td-detail-head">
        <span className="td-avatar" aria-hidden="true">{initial(student.name)}</span>
        <div className="td-grow">
          <h3 className="td-detail-name">{student.name}</h3>
          <p className="td-muted td-small">{p.label}</p>
        </div>
        <span data-testid="student-status" className={`td-status ${m.cls}`}><m.Icon aria-hidden="true" />{m.label}</span>
      </header>
      <p aria-live="polite" className={`td-sentence ${needsHelp ? 'big' : ''}`}>{student.sentence}</p>

      {needsHelp && (
        <div className="td-stack">
          {student.reason && <p data-testid="student-reason" className="td-reason">{student.reason}</p>}
          <pre aria-label={`${student.name}'s HTML`} className="td-code">
            <code>{student.code === undefined ? 'No code has been shared yet.' : student.code || 'The editor is empty.'}</code>
          </pre>
          <button type="button" data-testid="button-helped" disabled={!online || pending}
            onClick={() => onHelp(student.studentId)} className="td-btn td-btn-dark">
            <Check aria-hidden="true" />I'm with them
          </button>
          {pending && <p role="status" className="td-muted td-small">Waiting for the student update…</p>}
        </div>
      )}

      {student.said && (
        <div data-testid="student-said" className="td-said">
          <h4>What Fade told {student.name}</h4>
          <p className="td-said-text">{student.said.text}</p>
          <div className="td-quotes">
            <div><h5>From their code</h5><blockquote className="mono">{student.said.code_quote || 'No code quote shared.'}</blockquote></div>
            <div><h5>From your lesson</h5><blockquote>{student.said.lesson_quote || 'No lesson quote shared.'}</blockquote></div>
          </div>
        </div>
      )}

      <details data-testid="student-reasoning" className="td-reasoning">
        <summary>How Fade decided</summary>
        <div className="td-reasoning-body">
          {student.reasoning && (
            <dl className="td-meta">
              <div><dt>Trigger</dt><dd>{student.reasoning.trigger.replace(/_/g, ' ')}</dd></div>
              <div><dt>Action</dt><dd>{student.reasoning.action.replace(/_/g, ' ')}</dd></div>
              <div><dt>Time</dt><dd>{student.reasoning.ms} ms</dd></div>
            </dl>
          )}
          {typeof student.hintsLeft === 'number' && <p className="td-small">Hints left: {student.hintsLeft}</p>}
          {student.reasoning?.log.length ? (
            <ol className="td-log">
              {student.reasoning.log.map((e, i) => (
                <li key={i} data-testid="reasoning-entry">
                  <div className="td-log-head">
                    <span className="mono">{i + 1}. {e.tool}</span>
                    <span className={`td-verdict ${e.ok === false ? 'no' : 'yes'}`}>
                      {e.ok === false ? <XCircle aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                      {e.ok === false ? 'Rejected' : 'Accepted'}
                    </span>
                  </div>
                  <p className="td-muted td-xs">{e.t} ms</p>
                  <dl className="td-io">
                    <div><dt>Input</dt><dd>{decisionSummary(e.input)}</dd></div>
                    <div><dt>Result</dt><dd>{decisionSummary(e.result)}</dd></div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : <p className="td-muted td-small">No decisions have been shared yet.</p>}
        </div>
      </details>
    </article>
  );
}

function Modal({ open, onOpenChange, title, description, children, side }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string;
  children: React.ReactNode; side?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="td-overlay" />
        <D.Content className={`td-dialog ${side ? 'side' : ''}`}
          onOpenAutoFocus={() => { opener.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}>
          <div className="td-dialog-head">
            <div>
              <D.Title className="td-dialog-title">{title}</D.Title>
              {description ? <D.Description className="td-muted td-small">{description}</D.Description>
                : <D.Description className="td-sr">{title}</D.Description>}
            </div>
            <D.Close className="td-icon-btn" aria-label="Close"><X aria-hidden="true" /></D.Close>
          </div>
          <div className="td-dialog-body">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Taught({ taught }: { taught: string[] }) {
  return taught.length ? (
    <ol data-testid="taught-list" className="td-taught">
      {taught.map((t, i) => <li key={i}><span className="td-num small">{i + 1}</span><p>{t}</p></li>)}
    </ol>
  ) : (
    <div className="td-empty"><FileText aria-hidden="true" /><p>Nothing taught yet. Start listening or type to begin.</p></div>
  );
}

function StepsList({ steps }: { steps: Step[] }) {
  return (
    <ol data-testid="class-steps" className="td-steps">
      {steps.map((s, i) => (
        <li key={s.id} className={s.done ? 'done' : ''}>
          <span className="td-num">{i + 1}</span>
          <p>{s.text}{s.done && <span className="td-step-done"><Check aria-hidden="true" />Done</span>}</p>
        </li>
      ))}
      <li className="td-step-next" aria-hidden={steps.length ? 'true' : undefined}>
        <span className="td-num ghost"><Plus aria-hidden="true" /></span>
        <p>Next step will appear as you teach…</p>
      </li>
    </ol>
  );
}

function Shape() {
  return (
    <svg viewBox="0 0 320 260" className="td-shape" aria-hidden="true">
      <defs>
        <radialGradient id="tdSphere" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fde3cf" /><stop offset=".55" stopColor="#f2b48f" /><stop offset="1" stopColor="#d98a64" />
        </radialGradient>
        <linearGradient id="tdTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbf6ea" /><stop offset="1" stopColor="#efe4cc" /></linearGradient>
        <linearGradient id="tdLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4d6b6" /><stop offset="1" stopColor="#cdbd98" /></linearGradient>
        <linearGradient id="tdRight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6c7a4" /><stop offset="1" stopColor="#b9a882" /></linearGradient>
        <linearGradient id="tdPill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9fc0a0" /><stop offset="1" stopColor="#5f8a68" /></linearGradient>
        <filter id="tdBlur"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <ellipse cx="165" cy="228" rx="118" ry="14" fill="#3f5a45" opacity=".16" filter="url(#tdBlur)" />
      <g className="td-float a">
        <path d="M70 120 L130 92 L190 120 L130 148 Z" fill="url(#tdTop)" />
        <path d="M70 120 L130 148 L130 214 L70 186 Z" fill="url(#tdLeft)" />
        <path d="M190 120 L130 148 L130 214 L190 186 Z" fill="url(#tdRight)" />
      </g>
      <g className="td-float b"><rect x="186" y="150" width="108" height="46" rx="23" transform="rotate(-24 240 173)" fill="url(#tdPill)" /></g>
      <g className="td-float c">
        <circle cx="206" cy="78" r="52" fill="url(#tdSphere)" />
        <ellipse cx="190" cy="58" rx="16" ry="10" fill="#fff8ef" opacity=".55" />
      </g>
    </svg>
  );
}

export default function TeacherView(p: TeacherViewProps) {
  const { voice, status, steps, sortedStudents } = p;
  const [tab, setTab] = useState<Tab>('teach');
  const [typeOpen, setTypeOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ teach: null, students: null, history: null });

  const online = status === 'online';
  const total = steps.length;
  const helpList = sortedStudents.filter(s => s.status === 'needs_help');
  const selectedStudent = sortedStudents.find(s => s.studentId === selected) ?? null;

  const recording = voice.phase === 'recording';
  const paused = voice.phase === 'paused';
  const active = recording || paused || voice.phase === 'requesting';
  const blocked = !active && (!online || voice.pending > 0 || voice.phase === 'finishing');
  const timer = `${Math.floor(voice.elapsed / 60)}:${String(voice.elapsed % 60).padStart(2, '0')}`;
  const sending = p.pendingLessons > 0 || p.pendingTask;
  const canSend = online && !!p.lesson.trim() && !sending;

  const tabs: { id: Tab; label: string; Icon: typeof Mic }[] = [
    { id: 'teach', label: 'Teach', Icon: Mic },
    { id: 'students', label: 'Students', Icon: Users },
    { id: 'history', label: 'History', Icon: Layers },
  ];
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = tabs.findIndex(t => t.id === tab);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  }

  const statusLine = voice.error || voice.note
    || (voice.phase === 'requesting' ? 'Opening microphone…'
      : voice.phase === 'finishing' ? 'Finishing the last part…'
        : voice.processing === 'sending' ? `Sending your words${voice.pending > 1 ? ` · ${voice.pending} parts remaining` : ''}`
          : voice.processing === 'transcribing' || voice.pending > 0 ? `Turning speech into words${voice.pending > 1 ? ` · ${voice.pending} parts remaining` : ''}`
            : recording ? 'Keep talking. Your words are sent in order about every 12 seconds.'
              : paused ? 'Microphone is off. Resume when you are ready.'
                : 'Recording stops automatically after 5 minutes.');

  const detailProps = (s: StudentUpdate) => ({
    student: s, online, pending: p.helpPending.has(s.studentId), onHelp: p.helpStudent, total,
  });

  return (
    <div className="teacher-dashboard">
      <header className="td-top">
        <div className="td-brand">Fade<span className="td-dot" aria-hidden="true" />
          <span className="td-sr">{status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Offline'}</span>
        </div>
        <div role="tablist" aria-label="Teacher views" className="td-tabs">
          {tabs.map(t => (
            <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" type="button"
              id={`td-tab-${t.id}`} aria-controls={`td-panel-${t.id}`} aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1} onKeyDown={onTabKey} onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`} className="td-tab">
              <t.Icon aria-hidden="true" /><span>{t.label}</span>
              {t.id === 'students' && helpList.length > 0 && <span className="td-tab-badge">{helpList.length}</span>}
            </button>
          ))}
        </div>
        <div className="td-top-right">
          <button type="button" className="td-icon-btn bell" onClick={() => setBellOpen(true)} data-testid="button-attention"
            aria-label={helpList.length ? `${helpList.length} ${helpList.length === 1 ? 'student needs' : 'students need'} help` : 'No students need help'}>
            <Bell aria-hidden="true" />{helpList.length > 0 && <span className="td-bell-count">{helpList.length}</span>}
          </button>
          <span className="td-me" aria-label="Teacher">N</span>
        </div>
      </header>

      {!online && (
        <p role="status" className="td-banner">
          {status === 'connecting' ? 'Connecting to the classroom…' : 'Connection lost. Sending is paused until it returns.'}
        </p>
      )}

      <main className="td-main">
        <section id="td-panel-teach" role="tabpanel" aria-labelledby="td-tab-teach" hidden={tab !== 'teach'} className="td-teach">
          <div className="td-upper">
            <div className="td-card td-hero">
              <div className="td-hero-text">
                <span className={`td-chip ${recording ? 'live' : ''}`}>
                  <span className="td-chip-dot" aria-hidden="true" />{recording ? 'Live' : paused ? 'Paused' : 'Ready'}
                </span>
                <h1 className="td-h1">{recording ? 'Teaching in progress' : paused ? 'Paused' : 'Ready to teach'}</h1>
                <p className="td-sub">Fade is listening, creating steps, and supporting your students in real time.</p>
                {(recording || paused) && (
                  <p className="td-timer"><span className={`td-rec ${recording ? 'on' : ''}`} aria-hidden="true" />
                    <span role="timer" aria-label="Recording time">{timer}</span></p>
                )}
                <div className="td-controls">
                  <button type="button" data-testid="voice-teach" disabled={blocked} aria-pressed={active}
                    aria-describedby="td-voice-note" className="td-btn td-btn-dark lg"
                    onClick={() => { if (active) voice.stop(); else void voice.start(); }}>
                    {voice.phase === 'requesting' || (!active && (voice.pending > 0 || voice.phase === 'finishing'))
                      ? <LoaderCircle aria-hidden="true" className="td-spin" />
                      : active ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                    {active ? 'Stop listening' : 'Start listening'}
                  </button>
                  <button type="button" data-testid="voice-pause" className="td-btn td-btn-outline lg"
                    disabled={!recording && !(paused && online)}
                    onClick={() => { if (recording) voice.pause(); else if (paused) void voice.resume(); }}>
                    {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
                <p id="td-voice-note" role="status" className={`td-quiet ${voice.error ? 'err' : ''}`}>{statusLine}</p>
                <div role="status" className="td-quiet">
                  {sending && <p>Listening for a task…</p>}
                  {p.newSteps && <p className="ok">New steps sent to your class</p>}
                </div>
                {p.result?.source === 'fallback' && (
                  <p data-testid="fallback-note" className="td-quiet"><Info aria-hidden="true" />Basic steps (AI unavailable)</p>
                )}
                {p.lessonError && <p role="alert" className="td-quiet err">{p.lessonError}</p>}

                <button type="button" className="td-link" aria-expanded={typeOpen} aria-controls="td-type"
                  onClick={() => setTypeOpen(o => !o)} data-testid="button-type-instead">
                  {typeOpen ? 'Hide typing' : 'Type instead'}
                </button>
                {typeOpen && (
                  <form id="td-type" className="td-type" onSubmit={p.teach}>
                    <label htmlFor="teach" className="td-sr">Type to your class</label>
                    <textarea id="teach" data-testid="input-teach" value={p.lesson} maxLength={MAX_LEN} rows={3} autoFocus
                      onChange={e => p.setLesson(e.target.value)} placeholder="Explain something to your class…"
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (canSend) void p.teach(); } }} />
                    <div className="td-type-row">
                      <span className="td-muted td-xs">Ctrl + Enter to send</span>
                      <div className="td-type-btns">
                        <button type="button" className="td-btn td-btn-outline sm" disabled={!canSend}
                          onClick={() => void p.sendTask()} data-testid="button-send-task">Send as a task</button>
                        <button type="submit" data-testid="button-teach" className="td-btn td-btn-dark sm" disabled={!canSend}>
                          {sending ? 'Sending' : 'Send'}<ArrowUp aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
              <div className="td-art"><Shape /></div>
            </div>

            <section className="td-card td-steps-card" aria-labelledby="td-steps-h">
              <div className="td-card-head">
                <span className="td-icon-tile"><Layers aria-hidden="true" /></span>
                <div className="td-grow">
                  <h2 id="td-steps-h" className="td-h2">Lesson steps</h2>
                  <p className="td-muted td-small">Automatically generated from your teaching.</p>
                </div>
                <span className="td-chip lilac"><Zap aria-hidden="true" />Auto-updating</span>
              </div>
              {p.question && <p data-testid="steps-question" className="td-question"><Info aria-hidden="true" />{p.question}</p>}
              <StepsList steps={steps} />
            </section>
          </div>

          <section className="td-card td-progress" aria-labelledby="td-prog-h">
            <div className="td-card-head">
              <span className="td-icon-tile"><Users aria-hidden="true" /></span>
              <div className="td-grow">
                <h2 id="td-prog-h" className="td-h2">Student progress</h2>
                <p className="td-muted td-small">Live view of your class. Get help when students are stuck.</p>
              </div>
              <button type="button" className="td-btn td-btn-outline sm" onClick={() => setTranscriptOpen(true)} data-testid="button-transcript">
                <FileText aria-hidden="true" />View transcript
              </button>
            </div>
            <ul className="td-grid" data-testid="student-list">
              {sortedStudents.map(s => {
                const m = statusMeta(s); const pr = progress(s, total);
                return (
                  <li key={s.studentId} data-student-id={s.studentId} data-status={s.status}>
                    <button type="button" className={`td-scard ${m.cls}`} onClick={() => setSelected(s.studentId)}
                      aria-label={`${s.name}, ${m.label}, ${pr.label}. Open details`}>
                      <span className="td-scard-top">
                        <span className="td-avatar" aria-hidden="true">{initial(s.name)}</span>
                        <span className="td-scard-name">{s.name}</span>
                      </span>
                      <span className={`td-status ${m.cls}`}><m.Icon aria-hidden="true" />{m.label}</span>
                      <span className="td-bar" aria-hidden="true"><span style={{ transform: `scaleX(${pr.pct / 100})` }} /></span>
                      <span className="td-muted td-xs">{pr.label}</span>
                    </button>
                  </li>
                );
              })}
              <li className="td-scard muted" aria-live="polite">
                <UserPlus aria-hidden="true" />
                {sortedStudents.length
                  ? <span><strong>{sortedStudents.length}</strong> joined · in class</span>
                  : <span>No students yet<br /><span className="td-xs">They appear here as they join.</span></span>}
              </li>
            </ul>
          </section>
        </section>

        <section id="td-panel-students" role="tabpanel" aria-labelledby="td-tab-students" hidden={tab !== 'students'} className="td-card td-pad">
          <h2 className="td-h2">Your class</h2>
          <p className="td-muted td-small">Students who need you are shown first.</p>
          {sortedStudents.length ? (
            <ul className="td-detail-list">
              {sortedStudents.map(s => <li key={s.studentId}><StudentDetail {...detailProps(s)} /></li>)}
            </ul>
          ) : <div className="td-empty"><Users aria-hidden="true" /><p>No students have joined yet. Share the class link and they will appear here.</p></div>}
        </section>

        <section id="td-panel-history" role="tabpanel" aria-labelledby="td-tab-history" hidden={tab !== 'history'} className="td-history">
          <div className="td-card td-pad">
            <h2 className="td-h2">What you've taught so far</h2>
            <Taught taught={p.taught} />
          </div>
          <div className="td-card td-pad">
            <h2 className="td-h2">Current steps</h2>
            {total ? (
              <ol className="td-steps">{steps.map((s, i) => (
                <li key={s.id} className={s.done ? 'done' : ''}><span className="td-num">{i + 1}</span><p>{s.text}{s.done && <span className="td-step-done"><Check aria-hidden="true" />Done</span>}</p></li>
              ))}</ol>
            ) : <div className="td-empty"><Layers aria-hidden="true" /><p>No steps yet. They appear once you give your class a task.</p></div>}
          </div>
        </section>
      </main>

      <Modal open={!!selectedStudent} onOpenChange={o => { if (!o) setSelected(null); }} side
        title={selectedStudent?.name ?? 'Student'} description="Live details for this student.">
        {selectedStudent && <StudentDetail {...detailProps(selectedStudent)} />}
      </Modal>
      <Modal open={transcriptOpen} onOpenChange={setTranscriptOpen} title="What you've taught so far"
        description="Everything you said or typed, in order.">
        <Taught taught={p.taught} />
      </Modal>
      <Modal open={bellOpen} onOpenChange={setBellOpen} title="Needs your attention"
        description={helpList.length ? 'Students whose latest update requests help.' : 'No help requests in the latest student updates.'}>
        {helpList.length ? (
          <ul className="td-attn">
            {helpList.map(s => (
              <li key={s.studentId}>
                <button type="button" className="td-attn-row" onClick={() => { setBellOpen(false); setSelected(s.studentId); }}>
                  <span className="td-avatar" aria-hidden="true">{initial(s.name)}</span>
                  <span className="td-grow"><strong>{s.name}</strong><span className="td-muted td-small td-block">{s.reason || s.sentence}</span></span>
                  <AlertTriangle aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="td-empty"><CircleCheck aria-hidden="true" /><p>No one needs help right now.</p></div>}
      </Modal>
    </div>
  );
}
