// Live checks for the HTML lesson: does the student's code satisfy a step?
// Owned by the teacher + server half.

// Words in a step -> the tag it is about.
const TAG_WORDS = [
  ['p', /\bparagraph\b|<p>|\bp tag\b/i],
  ['h2', /\bh2\b|\bsubheading\b|\bsubtitle\b/i],
  ['img', /\bimg\b|\bimage\b|\bpicture\b/i],
  ['a', /\blink\b|\banchor\b|<a>|\ba tag\b/i],
  ['ul', /\bul\b|\bbulleted list\b|\bunordered list\b/i],
  ['ol', /\bol\b|\bnumbered list\b|\bordered list\b/i],
  ['li', /\bli\b|\blist item\b/i],
  ['button', /\bbutton\b/i],
  // Last on purpose: "add a paragraph under your title" is about the paragraph.
  ['h1', /\btitle\b|\bmain heading\b|\bheading\b/i],
];
const VOID = new Set(['img']);

export function tagForStep(text) {
  const explicit = /\b(h[1-6]|img|button|ul|ol|li)\b/i.exec(text);
  if (explicit) return explicit[1].toLowerCase();
  for (const [tag, pattern] of TAG_WORDS) if (pattern.test(text)) return tag;
  return null;
}

/** Check one tag in the student's HTML. Says what is there, never "wrong". */
export function checkTag(html, tag) {
  const code = String(html || '');
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i');
  const openLoose = new RegExp(`<${tag}\\b`, 'i');
  if (!openLoose.test(code)) return { pass: false, detail: `No <${tag}> tag yet.` };
  if (!open.test(code)) return { pass: false, detail: `<${tag} is started but its opening tag is not finished with >.` };
  if (VOID.has(tag)) return { pass: true, detail: `<${tag}> is there.` };
  const full = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'i').exec(code);
  if (!full) {
    const partialClose = new RegExp(`</${tag}(?!\\s*>)`, 'i').test(code);
    return {
      pass: false,
      detail: partialClose
        ? `<${tag}> is opened and the closing tag </${tag} is started but is missing its final >.`
        : `<${tag}> is opened but there is no closing </${tag}> tag.`,
    };
  }
  if (!full[2].replace(/<[^>]*>/g, '').trim()) return { pass: false, detail: `<${tag}></${tag}> is there but has no text inside.` };
  return { pass: true, detail: `<${tag}> is opened, has text, and is closed.` };
}

/**
 * @param {{id:string,text:string}[]} steps
 * @returns {{ id:string, text:string, pass:boolean, detail:string }[]}
 */
export function runChecks(steps, html) {
  return steps.map((step) => {
    const tag = tagForStep(step.text);
    if (!tag) return { id: step.id, text: step.text, pass: false, detail: 'No automatic check for this step.', checkable: false };
    return { id: step.id, text: step.text, ...checkTag(html, tag), checkable: true };
  });
}

/** Index of the first step that doesn't pass yet; steps.length when all pass. */
export function currentStepIndex(steps, html) {
  const results = runChecks(steps, html);
  const index = results.findIndex((r) => !r.pass);
  return index === -1 ? results.length : index;
}
