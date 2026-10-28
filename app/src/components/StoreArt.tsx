// Store visuals (docs/GORSEL_URETIM_LISTESI.md §4, 3D partial delivery): 192 px PNGs for the store tabs
// and for the entry effects, rides and chat bubbles that have one, keyed by cosmetic id. Items with no
// delivered picture (Scooter, Şeker, Galaksi, special IDs) keep their emoji. Frames need none here: the
// store shows the frame itself, illustrated (components/fx/frame-art.tsx) or code-drawn.
import type { CosmeticKind } from '@/data/catalog';

export const STORE_TAB_ART: Partial<Record<CosmeticKind, number>> = {
  frame: require('../../assets/store/magaza-sekme-cerceve.png'),
  entry: require('../../assets/store/magaza-sekme-giris-efekti.png'),
  ride: require('../../assets/store/magaza-sekme-binek.png'),
  bubble: require('../../assets/store/magaza-sekme-sohbet-balonu.png'),
};

const ART: Record<string, number> = {
  'en-sparkle': require('../../assets/store/giris-efekti-isilti.png'),
  'en-thunder': require('../../assets/store/giris-efekti-simsek.png'),
  'en-comet': require('../../assets/store/giris-efekti-kuyruklu-yildiz.png'),
  'en-dragon': require('../../assets/store/giris-efekti-ejderha.png'),
  'rd-sport': require('../../assets/store/binek-spor-araba.png'),
  'rd-jet': require('../../assets/store/binek-ozel-jet.png'),
  'bb-gold': require('../../assets/store/balon-altin.png'),
};

export const storeArtOf = (id?: string | null): number | undefined => (id ? ART[id] : undefined);
