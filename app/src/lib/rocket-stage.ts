// The Oda roketi's show on the room's stage (lib/fx-queue, docs/ODA_ROKETI.md; Güncelleme 7, madde 5b): a level's
// launch waits for the gift on screen and the ones already in line (the gift that filled the level among them), and the
// gifts sent after it wait for the rocket; two big effects never play at once. The winners' line follows its launch in
// the same turn. Pure: the room keeps the stage in its state; lib/live/room-rocket hands the server's news on.
import { addCue, updateCue, ROOM, type Stage } from '@/lib/fx-queue';
import type { RocketNews } from '@/lib/live/room-bus';

/**
 * Before a 'rocket' packet goes on the stage: the server announces the launch a moment after the gift that filled the
 * level, and the sender's own phone lines that gift up only when its send answers, which can be later still. Waiting
 * this long lets the gift in first. The payout waits as long, so it never comes before its launch.
 */
export const ROCKET_GRACE_MS = 1_500;
/** How long the shows take without a video: the rocket rising, then the winners' line. */
export const LAUNCH_MS = 2_600;
export const PAID_MS = 3_600;

/** What a rocket cue plays: the launch (then its payout, once it came) or a payout on its own. */
export type RocketPlay = { kind: 'rocket'; news: RocketNews; paid: RocketNews | null };

/** The same announcement twice (around a reconnect) is handed on once; the last `max` are remembered. */
export function newsGate(max = 20) {
  const seen: string[] = [];
  return (n: RocketNews) => {
    const k = `${n.launch}:${n.event}`;
    if (seen.includes(k)) return false;
    seen.push(k);
    if (seen.length > max) seen.shift();
    return true;
  };
}

/**
 * The stage with `news` in it. A launch is a new cue that is never dropped (fx-queue `keep`). A payout joins its
 * launch's cue while that one waits or plays (the winners right after the rocket), else it is a cue of its own.
 * `play` / `read` wrap and unwrap the room's own payload type.
 */
export function stageRocket<P>(
  s: Stage<P>,
  news: RocketNews,
  { at, held, key }: { at: number; held: boolean; key: string },
  play: (r: RocketPlay) => P,
  read: (p: P) => RocketPlay | null,
): Stage<P> {
  if (news.event === 'paid') {
    const joined = updateCue(
      s,
      (c) => {
        const r = read(c.payload);
        return !!r && r.news.event === 'launch' && r.news.launch === news.launch && !r.paid;
      },
      (c) => ({ ...c, ms: c.ms + PAID_MS, payload: play({ ...read(c.payload)!, paid: news }) }),
    );
    if (joined) return joined;
  }
  const ms = news.event === 'launch' ? LAUNCH_MS : PAID_MS;
  return addCue(s, { key, from: 'rocket', what: `rocket:${news.launch}:${news.event}`, to: { [ROOM]: 1 }, each: 1, price: 0, ms, keep: true, last: at, payload: play({ kind: 'rocket', news, paid: null }) }, held);
}
