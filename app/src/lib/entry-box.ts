// The person card's entry box (the owners' design, 20 Nov 2026: "Bu bölümde giriş efektini döndürebiliriz"): beside
// the name, the person's own room entrance plays round and round, the one everyone in a room sees when they come in
// (lib/room-entrance entryPlanOf: their entry effect, ride, noble rank and VIP colours, a VIP level alone too). Their
// clip, muted and looped, when it is already on this phone and may play; else the drawn banner made small; the team's
// own clips with the plate their name is written on. Nobody wearing anything: no box. What it shows and where it sits
// are worked out here, pure, so they are unit tested (tests/entry-box.test.ts); components/room/entry-box draws it.
import type { EntryPlan } from '@/lib/room-entrance';
import type { Plate } from '@/lib/shop-live-core';

/**
 * What the box plays: the clip (with the plate the name is written on: the team's own entries, Yönetim › Mağaza), or
 * the drawn banner, moving or still.
 */
export type EntryBoxShow = { kind: 'video'; plate: Plate | null } | { kind: 'banner'; still: boolean };

export type EntryBoxSettings = {
  /** Ayarlar › "Hareketi azalt" (the room's "Animasyonları azalt"): the banner standing still, no clip. */
  reduceMotion: boolean;
  /** Düşük veri modu: never the clip (the drawn banner, which costs nothing). */
  lowData: boolean;
  /** Efektler or Giriş efektleri off on this phone: what they wear is still shown, standing still. */
  effectsOff: boolean;
  /** Their clip is on this phone already (components/fx/video-fx entryClipKept: the card never downloads one). */
  clipKept: boolean;
};

/** What the box shows for an entrance (`plan`, null: they wear nothing that shows, so no box). */
export function entryBoxShow(plan: EntryPlan | null, s: EntryBoxSettings): EntryBoxShow | null {
  if (!plan) return null;
  const still = s.reduceMotion || s.effectsOff;
  if (!still && !s.lowData && s.clipKept) return { kind: 'video', plate: plan.clip ? (plan.plate ?? null) : null };
  return { kind: 'banner', still };
}

/**
 * The card's head (components/room/person-card): the card is the screen less 8 on each side and keeps 16 inside each
 * side; their framed photo takes 104 with 6 after it.
 */
export const CARD_HEAD = { inset: 2 * 8 + 2 * 16, avatar: 104, gap: 6 } as const;

/**
 * The box beside the name: as tall as the photo (the 9 × 16 clips fit it best upright), 8 from the name, and clear of
 * the close button's column to its right, as in the design. `whoMin`: what the name, ID and country keep at the least
 * (a 12-digit ID is about 130 wide; the phone draws it a little smaller to fit). Under the head: the card's width.
 */
export const ENTRY_BOX = { h: 104, minW: 60, maxW: 116, gap: 8, closeCol: 20, whoMin: 112, belowH: 76 } as const;

export type EntryBoxPlace = { beside: boolean; w: number; h: number };

/**
 * Where the box sits on a phone `width` wide whose text the phone grows by `fontScale` (the app caps it at
 * `maxScale`, components/text MAX_FONT_SCALE): beside the name while the name, ID and country keep `whoMin` (the
 * box narrows down to `minW` first), else under the head as a strip as wide as the card (a small phone, or large text).
 */
export function entryBoxPlace(width: number, fontScale = 1, maxScale = 1.15): EntryBoxPlace {
  const content = Math.max(0, width - CARD_HEAD.inset);
  const scale = Math.min(Math.max(Number.isFinite(fontScale) ? fontScale : 1, 1), maxScale);
  const room = content - CARD_HEAD.avatar - CARD_HEAD.gap - ENTRY_BOX.gap - ENTRY_BOX.closeCol - Math.round(ENTRY_BOX.whoMin * scale);
  if (room >= ENTRY_BOX.minW) return { beside: true, w: Math.min(ENTRY_BOX.maxW, Math.floor(room)), h: ENTRY_BOX.h };
  return { beside: false, w: Math.floor(content), h: ENTRY_BOX.belowH };
}

/**
 * Where a clip goes in a `w` × `h` box: the whole 540 × 960 picture, as large as fits, in the middle (the player
 * draws it aspect-fit too, so the plate lands where the panel put it).
 */
export function clipStage(w: number, h: number) {
  const k = Math.max(0, Math.min(w / 540, h / 960));
  const sw = Math.round(540 * k);
  const sh = Math.round(960 * k);
  return { w: sw, h: sh, left: Math.round((w - sw) / 2), top: Math.round((h - sh) / 2) };
}
