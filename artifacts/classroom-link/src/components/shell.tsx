import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import type { Status } from '@/lib/socket';

const label: Record<Status, string> = { online: 'Connected', connecting: 'Connecting', offline: 'Offline, retrying' };

export function StatusPill({ status }: { status: Status }) {
  return (
    <div role="status" data-testid="status-connection" className="flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', status === 'online' && 'bg-primary', status === 'connecting' && 'bg-accent pulse-dot', status === 'offline' && 'bg-destructive pulse-dot')} />
      {label[status]}
    </div>
  );
}

export function Shell({ status, children }: { status: Status; children: ReactNode }) {
  const [loc] = useLocation();
  const isStudent = loc === '/student';
  const tab = (href: string, text: string, active: boolean, id: string) => (
    <Link href={href} data-testid={id} aria-current={active ? 'page' : undefined}
      className={cn('relative rounded-full px-4 py-1.5 text-sm transition-colors duration-200', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
      {text}
    </Link>
  );
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-md bg-primary font-serif text-lg text-primary-foreground">C</span>
          <span className="hidden font-serif text-lg sm:inline">Classroom Link</span>
        </div>
        <nav aria-label="View" className="flex items-center gap-1 rounded-full border bg-card/70 p-1">
          {tab('/teacher', 'Teacher', !isStudent, 'link-teacher')}
          {tab('/student', 'Student', isStudent, 'link-student')}
        </nav>
        <StatusPill status={status} />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-10 sm:px-8">{children}</main>
    </div>
  );
}
