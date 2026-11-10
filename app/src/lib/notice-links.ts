// Where a notice may lead. A live build doesn't start a call from a notice (it would ring the other person) or
// open a sample person, room or family (u1…, r1…, k1… from the demo), so a notice pointing there opens nothing: it
// is only marked read. Anlar, Aile and Hemen Tanış run on the server, so their links open. Pure, so the node tests
// can check it.

/** Opening the call screen from a notice would ring the person: a live build never does. */
const CALL = /^\/arama(?:[/?#]|$)/;
/** A sample person, room or family from data/mock (u1–u12, r1–r7, k1…), by the screens that open them. */
const SAMPLE = /^\/(?:oda|sohbet|kullanici|arama|kabile)\/(?:u|r|k)\d+(?:[/?#]|$)/;

/** The link to open for a notice, or undefined when there is none (or, in a live build, none that works). */
export function noticeHref(href: string | undefined, live: boolean): string | undefined {
  if (!href || !live) return href;
  return CALL.test(href) || SAMPLE.test(href) ? undefined : href;
}
