// Patron koltuğu's rule in Otomatik mode, pure (no database), so boss-seat.mjs applies it inside the gift's
// transaction and the app's demo (app lib/patron-seat bossStep) can be held to the same answers by its tests.
//
//   1. While the seat is empty, a send of at least `coins` in the room sits its sender on it for `minutes`.
//   2. Every further send of the holder while they sit adds `minutes` to the end; their spending adds up.
//   3. Once the holder has sat more than HOLD_MS, someone else's single send larger than everything the holder spent
//      in this sitting takes the seat: a new sitting of `minutes` with that send as its spending.
// A sitting whose end has passed is an empty seat (the sweep may not have come by yet).

/** The holder sits this long before anyone may take the seat. */
export const BOSS_HOLD_MS = 5_000;

/**
 * The seat after one send. `seat`: { holder, since, until, spent } (times in ms) or null; `send`: { sender, coins };
 * `cfg`: { coins, minutes }; `now` in ms. Returns { seat, event, before }: event 'sat' | 'took' | 'extended' | null
 * (nothing changed), `before` the holder whose sitting had ended unseen (null otherwise).
 */
export function bossStep(seat, send, cfg, now) {
  const coins = Number(send.coins);
  const term = cfg.minutes * 60_000;
  const ended = !!seat && seat.until !== null && seat.until <= now;
  const before = ended ? seat.holder : null;
  const current = seat && !ended ? seat : null;
  if (!Number.isSafeInteger(coins) || coins <= 0) return { seat: current, event: null, before };
  const sit = (event) => ({ seat: { holder: send.sender, since: now, until: now + term, spent: coins }, event, before });
  if (!current) return coins >= cfg.coins ? sit('sat') : { seat: null, event: null, before };
  if (current.holder === send.sender) {
    // The Davet mode's seat has no end and isn't moved by gifts; boss-seat.mjs doesn't ask then.
    if (current.until === null) return { seat: current, event: null, before };
    return { seat: { ...current, until: current.until + term, spent: current.spent + coins }, event: 'extended', before };
  }
  if (now - current.since > BOSS_HOLD_MS && coins > current.spent) return sit('took');
  return { seat: current, event: null, before };
}
