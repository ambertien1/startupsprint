import { useEffect } from 'react';
import { Shell } from '@/components/shell';
import { useClassroomLink, formatTime } from '@/lib/socket';
import { cn } from '@/lib/utils';

export default function Student() {
  const { status, sentence } = useClassroomLink();
  useEffect(() => { document.title = 'Student · Classroom Link'; }, []);
  const len = sentence?.text.length ?? 0;
  const size = len > 400 ? 'text-2xl sm:text-3xl' : len > 140 ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-6xl';
  return (
    <Shell status={status}>
      <div className="flex flex-1 flex-col justify-center py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">From your teacher</p>
        <div className="mt-6 rounded-3xl border bg-card px-6 py-10 shadow-[0_30px_60px_-40px_hsl(166_44%_20%/0.4)] sm:px-12 sm:py-16">
          <div aria-live="polite" aria-atomic="true" data-testid="text-sentence">
            {sentence === null ? (
              <div className="space-y-4" aria-label="Loading">
                <div className="h-10 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-10 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ) : sentence.text ? (
              <p key={sentence.sentAt ?? sentence.text} className={cn('ink-in whitespace-pre-wrap break-words font-serif leading-[1.15] tracking-tight', size)}>{sentence.text}</p>
            ) : (
              <p className="font-serif text-3xl text-muted-foreground sm:text-4xl">Waiting for the first sentence<span className="pulse-dot inline-block">.</span></p>
            )}
          </div>
        </div>
        <p className="mt-4 h-5 font-mono text-xs text-muted-foreground" data-testid="text-sent-at">
          {sentence?.sentAt ? `Sent at ${formatTime(sentence.sentAt)}` : ''}
        </p>
      </div>
    </Shell>
  );
}
