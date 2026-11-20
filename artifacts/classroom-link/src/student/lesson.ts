export type Step = { id: string; text: string; done: boolean };
export type FadeMessage = {
  text: string;
  speechText?: string;
  audioUrl?: string | null;
  kind?: string;
  code_quote?: string | null;
  lesson_quote?: string | null;
};

export const DEMO_TASK = 'Add a title to your page with an h1 tag, then add a paragraph under it.';

export const DEMO_STEPS: Step[] = [
  { id: 's1', text: 'Type a title for your website in an h1 tag', done: false },
  { id: 's2', text: 'Add a paragraph under your title', done: false },
];

export const INITIAL_CSS = `body {
  font-family: sans-serif;
  padding: 24px;
}

h1 {
  color: #305b9c;
}`;

export function initialHtml(studentId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Website</title>
</head>
<body>
${studentId === 'leo' ? "  <h1>Leo's Page</h1" : '  '}
</body>
</html>`;
}

// Check the source too: HTML parsers repair unfinished closing tags, including
// Leo's deliberately unfinished </h1. A repaired tag must not complete a step.
export function checkSteps(steps: Step[], html: string): Step[] {
  const clean = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  // Evaluate only authored body content, never title/head content. Keep the
  // source rather than repaired DOM so an unfinished closing tag stays pending.
  const source = /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(clean)?.[1] ?? '';
  const nonempty = (markup: string) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    return Boolean(doc.body.textContent?.replace(/ /g, ' ').trim());
  };
  const titles = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
  const title = titles.find((match) => nonempty(match[1]));
  const afterTitle = title ? source.slice(title.index! + title[0].length) : '';
  const paragraph = [...afterTitle.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .some((match) => nonempty(match[1]));
  // Steps written live by the teacher's steps agent have their own ids, so
  // work out which tag a step is about from its words (same rule as the server).
  const byText = (text: string) => {
    const tag = tagForStep(text);
    if (!tag) return false;
    if (tag === 'img') return /<img\b[^>]*>/i.test(source);
    return [...source.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'gi'))]
      .some((match) => nonempty(match[1]));
  };
  return steps.map((step) => ({
    ...step,
    done: step.done || (step.id === 's1' ? Boolean(title) : step.id === 's2' ? paragraph : byText(step.text)),
  }));
}

const TAG_WORDS: [string, RegExp][] = [
  ['p', /\bparagraph\b|<p>|\bp tag\b/i],
  ['h2', /\bh2\b|\bsubheading\b|\bsubtitle\b/i],
  ['img', /\bimg\b|\bimage\b|\bpicture\b/i],
  ['a', /\blink\b|\banchor\b|<a>|\ba tag\b/i],
  ['ul', /\bul\b|\bbulleted list\b|\bunordered list\b/i],
  ['ol', /\bol\b|\bnumbered list\b|\bordered list\b/i],
  ['li', /\bli\b|\blist item\b/i],
  ['button', /\bbutton\b/i],
  ['h1', /\btitle\b|\bmain heading\b|\bheading\b/i],
];
export function tagForStep(text: string): string | null {
  const explicit = /\b(h[1-6]|img|button|ul|ol|li)\b/i.exec(text);
  if (explicit) return explicit[1].toLowerCase();
  for (const [tag, pattern] of TAG_WORDS) if (pattern.test(text)) return tag;
  return null;
}

export function mergeSteps(previous: Step[], incoming: Step[]): Step[] {
  const completed = new Set(previous.filter((step) => step.done).map((step) => step.id));
  return incoming.map((step) => ({ ...step, done: step.done || completed.has(step.id) }));
}

export function buildPreview(html: string, css: string): string {
  // User markup stays inside an opaque, script-free iframe. CSP also blocks
  // network requests, forms, embedded frames and injected refresh metadata.
  const safeCss = css.replace(/</g, '\\3c ');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('meta, base, script, iframe, object, embed, link').forEach((node) => node.remove());
  // Preserve full-document edits without nesting another <html>/<body> tree.
  const contents = parsed.body.innerHTML;
  const head = parsed.head.innerHTML;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>body{font-family:system-ui,sans-serif;padding:20px;overflow-wrap:anywhere;color:#172e2b;background:#fff} ${safeCss}</style>
</head><body>${contents}</body></html>`;
}
