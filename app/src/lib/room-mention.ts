// Room chat @mentions (components/room/live-room): typing "@" offers the people in the room, picking one writes
// "@Name " into the line, and a line that names me stands out in the feed. A mention is plain text in the line, so
// the room chat carries it as it is. The contact filter takes any "@word" for a social media handle, so the room
// checks a line with the mentions of people in the room written as plain names (stripMentions): "@Ayşe selam"
// goes, "@ayse.insta" (nobody in the room) is still refused. Pure, so the unit tests run it under Node.

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** The name being typed after a trailing "@" (empty right after it), or null when the line doesn't end in one. */
export function mentionQuery(draft: string): string | null {
  const m = /(?:^|\s)@([^\s@]{0,24})$/u.exec(draft);
  return m ? m[1] : null;
}

/** The line with its trailing "@…" (or, without one, its end) replaced by "@Name ". */
export function insertMention(draft: string, name: string): string {
  const q = mentionQuery(draft);
  const base = q !== null ? draft.slice(0, draft.length - q.length - 1) : draft.trim() ? `${draft.replace(/\s+$/, '')} ` : '';
  return `${base}@${name} `;
}

/** People whose name starts with (first) or contains what was typed; at most `max`. */
export function mentionPicks<T extends { name: string }>(people: T[], q: string, max = 8): T[] {
  const k = lower(q.trim());
  if (!k) return people.slice(0, max);
  const starts = people.filter((p) => lower(p.name).startsWith(k));
  const has = people.filter((p) => !lower(p.name).startsWith(k) && lower(p.name).includes(k));
  return [...starts, ...has].slice(0, max);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The line as the contact filter should read it: each "@Name" of someone in `names` (the room's people and me)
 * written as the plain name, longest names first so "@Ayşe Yılmaz" isn't cut at "@Ayşe". Any other "@word" stays.
 */
export function stripMentions(text: string, names: readonly string[]): string {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of list) out = out.replace(new RegExp(`@\\s*${escape(n)}(?![\\p{L}\\p{N}_])`, 'giu'), (m) => m.replace(/^@\s*/u, ''));
  return out;
}

/** Does the line mention this name ("@Name" followed by the end, a space or punctuation)? */
export function mentions(text: string, name: string): boolean {
  const n = lower(name.trim());
  if (!n) return false;
  const t = lower(text);
  for (let i = t.indexOf(`@${n}`); i >= 0; i = t.indexOf(`@${n}`, i + 1)) {
    const next = t[i + n.length + 1];
    if (next === undefined || !/[\p{L}\p{N}_]/u.test(next)) return true;
  }
  return false;
}

/**
 * The line cut where it names someone in `names` ("@Name", longest names first, as stripMentions reads them), so
 * the feed can draw those names in their own color. Each piece keeps its text; a mention also says whose name.
 */
export function mentionRuns(text: string, names: readonly string[]): { text: string; name?: string }[] {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].sort((a, b) => b.length - a.length);
  if (!list.length || !text.includes('@')) return [{ text }];
  const re = new RegExp(`@\\s*(${list.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  const out: { text: string; name?: string }[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i) });
    const name = list.find((n) => lower(n) === lower(m[1])) ?? m[1];
    out.push({ text: m[0], name });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out.length ? out : [{ text }];
}
