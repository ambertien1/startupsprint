import { forwardRef, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

type Lang = 'html' | 'css';

type Props = {
  id: string;
  filename: string;
  lang: Lang;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  active?: boolean;
  onFocus?: () => void;
};

type Tok = { t: string; c?: string };

function tokHtml(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /(<!--[\s\S]*?(?:-->|$))|(<\/?)([a-zA-Z][\w-]*)?([^>]*)(>?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: src.slice(last, m.index) });
    if (m[1]) out.push({ t: m[1], c: 'com' });
    else {
      out.push({ t: m[2], c: 'pun' });
      if (m[3]) out.push({ t: m[3], c: 'tag' });
      if (m[4]) {
        const ar = /([\w-:]+)|("[^"]*"?|'[^']*'?)|([^\w"']+)/g;
        let a: RegExpExecArray | null;
        while ((a = ar.exec(m[4]))) {
          if (a[1]) out.push({ t: a[1], c: 'attr' });
          else if (a[2]) out.push({ t: a[2], c: 'str' });
          else out.push({ t: a[3], c: 'pun' });
        }
      }
      if (m[5]) out.push({ t: m[5], c: 'pun' });
    }
    last = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < src.length) out.push({ t: src.slice(last) });
  return out;
}

function tokCss(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /(\/\*[\s\S]*?(?:\*\/|$))|("[^"]*"?|'[^']*'?)|([\w-]+)(\s*:)(?=[^{}]*[;}]|[^{}]*$)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|s|ms)?)|([{};:,])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let inBlock = false;
  const push = (t: string) => out.push({ t, c: inBlock ? undefined : 'sel' });
  while ((m = re.exec(src))) {
    if (m.index > last) push(src.slice(last, m.index));
    if (m[1]) out.push({ t: m[1], c: 'com' });
    else if (m[2]) out.push({ t: m[2], c: 'str' });
    else if (m[3] && inBlock) { out.push({ t: m[3], c: 'prop' }); out.push({ t: m[4], c: 'pun' }); }
    else if (m[3]) push(m[3] + m[4]);
    else if (m[5]) inBlock ? out.push({ t: m[5], c: 'num' }) : push(m[5]);
    else if (m[6]) {
      if (m[6] === '{') inBlock = true;
      if (m[6] === '}') inBlock = false;
      out.push({ t: m[6], c: 'pun' });
    }
    last = re.lastIndex;
  }
  if (last < src.length) push(src.slice(last));
  return out;
}

export const StudentCodeEditor = forwardRef<HTMLTextAreaElement, Props>(function StudentCodeEditor(
  { id, filename, lang, value, onChange, testId, active, onFocus },
  ref,
) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;

  const highlighted = useMemo<ReactNode[]>(() => {
    const toks = lang === 'html' ? tokHtml(value) : tokCss(value);
    return toks.map((k, i) => (k.c ? <span key={i} className={`tk-${k.c}`}>{k.t}</span> : k.t));
  }, [value, lang]);

  const sync = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) { preRef.current.scrollTop = scrollTop; preRef.current.scrollLeft = scrollLeft; }
    if (gutRef.current) gutRef.current.scrollTop = scrollTop;
  };

  return (
    <section className="fs-ed" data-active={active} aria-label={`${filename} editor`}>
      <div className="fs-tabs">
        <label htmlFor={id} className="fs-tab">
          <span className={`fs-fi fs-fi-${lang}`} aria-hidden="true">{lang === 'html' ? '<>' : '#'}</span>
          {filename}
        </label>
      </div>
      <div className="fs-code">
        <div className="fs-gutter" ref={gutRef} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
          <div>&nbsp;</div>
        </div>
        <div className="fs-surface">
          <pre className="fs-mirror" ref={preRef} aria-hidden="true">{highlighted}{'\n '}</pre>
          <textarea
            id={id}
            ref={ref}
            className="fs-input"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={sync}
            onFocus={onFocus}
            data-testid={testId}
          />
        </div>
      </div>
    </section>
  );
});
