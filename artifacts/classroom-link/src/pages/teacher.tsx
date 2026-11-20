import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Check, AlertCircle } from 'lucide-react';
import { Shell } from '@/components/shell';
import { useClassroomLink, MAX_LEN, formatTime } from '@/lib/socket';
import { cn } from '@/lib/utils';

export default function Teacher() {
  const { status, sentence, send } = useClassroomLink();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { document.title = 'Teacher · Classroom Link'; ref.current?.focus(); }, []);

  const online = status === 'online';
  const blank = text.trim().length === 0;
  const canSend = online && !blank && !sending;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    setSending(true); setError(null);
    try {
      await send(text);
      setText(''); setJustSent(true);
      setTimeout(() => setJustSent(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false); ref.current?.focus();
    }
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  }

  const remaining = MAX_LEN - text.length;
  return (
    <Shell status={status}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 py-6">
        <div className="ink-in">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Teacher</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">Write it once. <span className="text-primary">Everyone sees it.</span></h1>
        </div>

        <form onSubmit={submit} className="ink-in rounded-2xl border bg-card p-2 shadow-[0_20px_50px_-30px_hsl(166_44%_20%/0.35)] transition focus-within:border-primary/50" style={{ animationDelay: '80ms' }}>
          <label htmlFor="sentence" className="sr-only">Sentence for students</label>
          <textarea id="sentence" ref={ref} data-testid="input-sentence" value={text} maxLength={MAX_LEN} rows={4}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }} onKeyDown={onKey}
            placeholder="Type a sentence for the class..."
            className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 font-serif text-xl leading-relaxed outline-none placeholder:text-muted-foreground/60" />
          <div className="flex items-center justify-between gap-3 px-3 pb-1">
            <span data-testid="text-char-count" className={cn('font-mono text-xs tabular-nums text-muted-foreground', remaining < 100 && 'text-accent')}>
              {text.length} / {MAX_LEN}
              <span className="ml-3 hidden sm:inline opacity-70">Ctrl + Enter to send</span>
            </span>
            <button type="submit" data-testid="button-send" disabled={!canSend}
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0">
              {sending ? 'Sending' : justSent ? 'Sent' : 'Send'}
              {justSent ? <Check className="h-4 w-4" /> : <ArrowUp className={cn('h-4 w-4 transition-transform', !sending && 'group-hover:-translate-y-0.5', sending && 'pulse-dot')} />}
            </button>
          </div>
        </form>

        <div className="min-h-6 -mt-4 px-1 text-sm" aria-live="polite">
          {error ? (
            <p data-testid="text-send-error" className="ink-in flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>
          ) : !online ? (
            <p className="text-muted-foreground">{status === 'connecting' ? 'Connecting to the classroom...' : 'Connection lost. Sending is paused until it returns.'}</p>
          ) : null}
        </div>

        <section aria-labelledby="live-label" className="border-t border-dashed pt-6">
          <div className="flex items-baseline justify-between">
            <h2 id="live-label" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Students now see</h2>
            {sentence?.sentAt && <span data-testid="text-sent-at" className="font-mono text-xs text-muted-foreground">{formatTime(sentence.sentAt)}</span>}
          </div>
          {sentence === null ? (
            <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-muted" />
          ) : sentence.text ? (
            <p key={sentence.sentAt ?? ''} data-testid="text-current-sentence" className="ink-in mt-3 whitespace-pre-wrap break-words border-l-2 border-accent pl-4 font-serif text-lg">{sentence.text}</p>
          ) : (
            <p data-testid="text-current-sentence" className="mt-3 text-muted-foreground">Nothing yet. The student screen is waiting.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}
