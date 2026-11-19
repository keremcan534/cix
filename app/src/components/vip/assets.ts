// The VIP screen's pictures (assets/vip, made by scripts/vip-assets.py from the client's design package): one hero
// background per level, the rights' pictures and the gold decorations. Sizes are the files' own pixels.
import type { ImageSourcePropType } from 'react-native';

import type { RightArtKey } from '@/lib/vip-screen';

/** hero-<level>.webp: the card's purple (VIP 1) recoloured per level; the ring, gold and border stay. */
export const HERO_IMAGES: Record<number, ImageSourcePropType> = {
  1: require('../../../assets/vip/hero-1.webp'),
  2: require('../../../assets/vip/hero-2.webp'),
  3: require('../../../assets/vip/hero-3.webp'),
  4: require('../../../assets/vip/hero-4.webp'),
  5: require('../../../assets/vip/hero-5.webp'),
  6: require('../../../assets/vip/hero-6.webp'),
  7: require('../../../assets/vip/hero-7.webp'),
  8: require('../../../assets/vip/hero-8.webp'),
  9: require('../../../assets/vip/hero-9.webp'),
  10: require('../../../assets/vip/hero-10.webp'),
};

/** hero-glow.webp: the gold light outside the sign's border, the same on every level (lib/vip-screen HERO_GLOW). */
export const HERO_GLOW_IMAGE: ImageSourcePropType = require('../../../assets/vip/hero-glow.webp');
/**
 * lower-glow.webp: the purple wave behind the last row's empty cells, on down the points panel's right side and
 * faded out under it (553×470 px of the design; the panel's top is its row 264).
 */
export const LOWER_GLOW = { source: require('../../../assets/vip/lower-glow.webp'), w: 553, h: 470, panelTop: 264 } as const;

export const RIGHT_ART: Record<RightArtKey, { source: ImageSourcePropType; w: number; h: number }> = {
  badge: { source: require('../../../assets/vip/right-badge.png'), w: 174, h: 140 },
  frame: { source: require('../../../assets/vip/right-frame.png'), w: 152, h: 151 },
  hide_levels: { source: require('../../../assets/vip/right-hide_levels.png'), w: 160, h: 146 },
  room_password: { source: require('../../../assets/vip/right-room_password.png'), w: 129, h: 147 },
  vip_store: { source: require('../../../assets/vip/right-vip_store.png'), w: 143, h: 136 },
  vip_gifts: { source: require('../../../assets/vip/right-vip_gifts.png'), w: 145, h: 143 },
  silent_visit: { source: require('../../../assets/vip/right-silent_visit.png'), w: 127, h: 148 },
};

export const DECO = {
  crownLeft: { source: require('../../../assets/vip/crown-left.png'), w: 76, h: 62 },
  crownRight: { source: require('../../../assets/vip/crown-right.png'), w: 71, h: 59 },
  infoCrown: { source: require('../../../assets/vip/info-crown.png'), w: 99, h: 81 },
  lowerCrown: { source: require('../../../assets/vip/lower-crown.png'), w: 221, h: 141 },
  tabCrown: { source: require('../../../assets/vip/tab-crown.png'), w: 54, h: 44 },
  tabDiamond: { source: require('../../../assets/vip/tab-diamond.png'), w: 46, h: 40 },
  heroTick: { source: require('../../../assets/vip/hero-tick.png'), w: 40, h: 40 },
} as const;

/** The app's soft white light (assets/fx/glow.png, a round fall-off to transparent), tinted and stretched for the
 * design's glows: under the open tab, on the cards' rims, behind the right pictures, in the points panel. */
export const SOFT_GLOW: ImageSourcePropType = require('../../../assets/fx/glow.png');

/** dp per source px on a 390 dp phone (the design is 841 px wide). */
export const PX = 390 / 841;

/**
 * The Abonelik tab's small pictures (assets/vip/sub, made by scripts/vip-sub-assets.py from the client's Abonelik
 * package): the crowns are colour cut-outs of the design, the sparkle, tick and cross are drawn in one flat colour (so
 * tintColor recolours them). `w` × `h` is the size in dp they are drawn at.
 */
export const SUB_ART = {
  statusCrown: { source: require('../../../assets/vip/sub/status-crown.png'), w: 17.4, h: 14.9 },
  planCrown: { source: require('../../../assets/vip/sub/plan-crown.png'), w: 15.3, h: 12.8 },
  buyCrown: { source: require('../../../assets/vip/sub/buy-crown.png'), w: 24.9, h: 20.7 },
  sparkle: { source: require('../../../assets/vip/sub/sparkle.png'), w: 11, h: 11 },
  check: { source: require('../../../assets/vip/sub/check.png'), w: 15, h: 12 },
  cross: { source: require('../../../assets/vip/sub/cross.png'), w: 11, h: 11 },
} as const;
