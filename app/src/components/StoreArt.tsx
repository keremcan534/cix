// Store visuals (docs/GORSEL_URETIM_LISTESI.md §4, 3D partial delivery): 192 px PNGs for the store tabs
// and for the entry effects, rides, chat bubbles and special IDs that have one, keyed by cosmetic id.
// Items with no picture keep their emoji. Illustrated frames (components/fx/frame-art.tsx) need none;
// code-drawn frames get a small badge (FRAME_BADGE_ART) next to the drawn frame.
import { artSource } from '@/components/Art';
import type { CosmeticKind } from '@/data/catalog';

export const STORE_TAB_ART: Partial<Record<CosmeticKind, number>> = {
  frame: require('../../assets/store/magaza-sekme-cerceve.png'),
  entry: require('../../assets/store/magaza-sekme-giris-efekti.png'),
  ride: require('../../assets/store/magaza-sekme-binek.png'),
  bubble: require('../../assets/store/magaza-sekme-sohbet-balonu.png'),
  specialId: artSource('magaza-sekme-ozel-id'),
};

/** The badge for each code-drawn frame (the store shows the frame itself; this marks its theme). */
const FRAME_BADGE_ART: Record<string, number> = {
  'fr-neon': artSource('cerceve-ses-dalgasi'),
  'fr-ocean': artSource('cerceve-yorunge'),
  'fr-aurora': artSource('cerceve-aurora'),
  'fr-fire': artSource('cerceve-ates'),
  'fr-gold': artSource('cerceve-altin-tac'),
};

export const frameBadgeArtOf = (id?: string | null): number | undefined => (id ? FRAME_BADGE_ART[id] : undefined);

/** The special-ID medallion, drawn above the number. */
export const SPECIAL_ID_ART = artSource('ozel-id-ozel-id');

const ART: Record<string, number> = {
  'en-sparkle': require('../../assets/store/giris-efekti-isilti.png'),
  'en-thunder': require('../../assets/store/giris-efekti-simsek.png'),
  'en-comet': require('../../assets/store/giris-efekti-kuyruklu-yildiz.png'),
  'en-dragon': require('../../assets/store/giris-efekti-ejderha.png'),
  'rd-sport': require('../../assets/store/binek-spor-araba.png'),
  'rd-jet': require('../../assets/store/binek-ozel-jet.png'),
  'rd-scooter': artSource('binek-scooter'),
  'bb-gold': require('../../assets/store/balon-altin.png'),
  'bb-candy': artSource('balon-seker'),
  'bb-galaxy': artSource('balon-galaksi'),
};

export const storeArtOf = (id?: string | null): number | undefined => (id ? ART[id] : undefined);
