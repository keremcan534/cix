// Where a notice may lead. A live build doesn't open the demo-only parts (Anlar, Tayfa, Kabile, Hemen Tanış,
// calls) or a sample person or room (u1…, r1… from the demo), so a notice pointing there opens nothing: it is
// only marked read. Pure, so the node tests can check it.

/** Parts of the app that only exist in the demo (a live build hides them). */
const DEMO_ONLY = /^\/(?:\(tabs\)\/)?(?:anlar|aile|kabile|eslesme|arama)(?:[/?#]|$)/;
/** A sample person or room from data/mock (u1–u12, r1–r7), by the screens that open them. */
const SAMPLE = /^\/(?:oda|sohbet|kullanici|arama)\/(?:u|r)\d+(?:[/?#]|$)/;

/** The link to open for a notice, or undefined when there is none (or, in a live build, none that works). */
export function noticeHref(href: string | undefined, live: boolean): string | undefined {
  if (!href || !live) return href;
  return DEMO_ONLY.test(href) || SAMPLE.test(href) ? undefined : href;
}
