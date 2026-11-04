// What may leave the phone in a crash report (lib/reporting): no phone numbers, no message text, no query strings
// (a room password travels in one), only the server user id. Pure functions on plain objects, so they are tested
// without the Sentry SDK.

/** Masks digit runs that could be a phone number (10+ digits, spaces and dashes allowed). */
export const scrubText = (s: string) => s.replace(/\+?\d(?:[\s-]?\d){9,}/g, '[numara]');

/** An address without its query string and fragment. */
export const scrubUrl = (u: string) => u.replace(/[?#].*$/, '');

type Crumb = { category?: string; message?: string; data?: Record<string, unknown>; level?: string };

/**
 * A breadcrumb as it may be sent, or null to drop it. Console lines below warning are dropped (chat and profile
 * text can pass through logs); network ones keep method, status and the address without its query.
 */
export function scrubBreadcrumb<T extends Crumb>(b: T): T | null {
  if (b.category === 'console' && b.level !== 'warning' && b.level !== 'error') return null;
  const out: T = { ...b };
  if (typeof out.message === 'string') out.message = scrubText(out.message).slice(0, 300);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      // Request and response bodies, arguments of console calls: never.
      if (k === 'arguments' || k === 'body' || k === 'request_body' || k === 'response_body') continue;
      data[k] = typeof v === 'string' ? (k === 'url' || k === 'to' || k === 'from' ? scrubUrl(v) : scrubText(v).slice(0, 300)) : v;
    }
    out.data = data;
  }
  return out;
}
