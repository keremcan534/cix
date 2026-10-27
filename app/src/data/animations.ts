// Central animation catalog (spec "Hareketli Emoji, Mikrofon Efektleri ve Animasyon Mağazası" §4).
// Every animated reaction, mic effect and effect gift is one record here; the app never refers to a
// provider's ids directly (provider_id is kept only for mapping), so providers can be swapped.
//
// How a record plays: `asset` is what is drawn (emoji, a bundled 3D icon or effect picture, or an image URL) and `motion`
// is a data-driven preset run by components/fx/anim-player.tsx. New records therefore need no code.
// Formats that need a native player we don't ship yet (lottie, rive, svga, pag, vap, video) fall back
// to the preview asset with the same motion until that player is added.
import type { AnimArtName } from '@/components/fx/anim-art';
import type { Icon3DName } from '@/components/Icon3D';

export type AnimFormat = 'emoji' | 'image' | 'code' | 'lottie' | 'rive' | 'svga' | 'pag' | 'vap' | 'video';
export type DisplayType = 'mic_effect' | 'reaction' | 'gift' | 'fullscreen' | 'entry';
export type Motion = 'rise' | 'orbit' | 'burst' | 'rain' | 'fly' | 'zoom' | 'ring' | 'wave';
export type LicenseStatus = 'approved' | 'pending' | 'rejected' | 'expired';
export type Asset = { kind: 'emoji'; value: string } | { kind: 'icon'; value: Icon3DName } | { kind: 'art'; value: AnimArtName } | { kind: 'url'; value: string };

export type Animation = {
  animation_id: string;
  provider: string; // provider key (lib/animations PROVIDERS)
  provider_id: string | null;
  name: string;
  category_id: string;
  preview_asset: Asset;
  animation_asset: Asset | { kind: 'file'; value: string };
  format: AnimFormat;
  motion: Motion;
  /** Particles / copies drawn by the motion (scaled down in lite mode). */
  count: number;
  duration_ms: number;
  display_type: DisplayType;
  audio_asset: string | null;
  coin_price: number;
  is_free: boolean;
  is_active: boolean;
  license_status: LicenseStatus;
  license_note: string;
  /** Campaign window (ISO dates); outside it the record is hidden even if active. */
  starts_at?: string;
  ends_at?: string;
  created_at: string;
  updated_at: string;
};

// Each category's icon: components/fx/anim-art ANIM_CATEGORY_ART.
export const ANIM_CATEGORIES: { id: string; name: string }[] = [
  { id: 'mic', name: 'Mikrofon ve ses' },
  { id: 'love', name: 'Romantik' },
  { id: 'ride', name: 'Araçlar' },
  { id: 'fantasy', name: 'Fantastik' },
  { id: 'royal', name: 'İhtişam' },
  { id: 'space', name: 'Uzay ve gösteri' },
  { id: 'wealth', name: 'Zenginlik' },
  { id: 'cute', name: 'Sevimli' },
  { id: 'event', name: 'Özel gün' },
];

export const DISPLAY_LABEL: Record<DisplayType, string> = {
  mic_effect: 'Mikrofon efekti',
  reaction: 'Küçük tepki',
  gift: 'Hediye efekti',
  fullscreen: 'Tam ekran',
  entry: 'Giriş animasyonu',
};
export const MOTION_LABEL: Record<Motion, string> = {
  rise: 'Koltuktan yüksel',
  orbit: 'Mikrofon çevresinde dön',
  burst: 'Koltuktan patla',
  rain: 'Ekrana yağ',
  fly: 'Ekranı geç',
  zoom: 'Ortada büyü',
  ring: 'Neon halka',
  wave: 'Ses dalgası',
};

const T0 = '2026-10-01T00:00:00Z';
type Seed = Pick<Animation, 'animation_id' | 'name' | 'category_id' | 'motion' | 'count' | 'duration_ms' | 'display_type' | 'coin_price'> & { asset: Asset; free?: boolean; starts_at?: string; ends_at?: string };
const icon = (value: Icon3DName): Asset => ({ kind: 'icon', value });
const art = (value: AnimArtName): Asset => ({ kind: 'art', value });
const make = (s: Seed): Animation => ({
  animation_id: s.animation_id,
  provider: 'builtin',
  provider_id: null,
  name: s.name,
  category_id: s.category_id,
  preview_asset: s.asset,
  animation_asset: s.asset,
  format: s.asset.kind === 'emoji' ? 'emoji' : 'image',
  motion: s.motion,
  count: s.count,
  duration_ms: s.duration_ms,
  display_type: s.display_type,
  audio_asset: null,
  coin_price: s.free ? 0 : s.coin_price,
  is_free: !!s.free,
  is_active: true,
  license_status: 'approved',
  license_note: 'Yerleşik içerik: uygulamanın kendi görselleri ve 3D ikonları.',
  starts_at: s.starts_at,
  ends_at: s.ends_at,
  created_at: T0,
  updated_at: T0,
});

export const ANIMATION_SEED: Animation[] = [
  // A · mic effects (automatic while speaking; bought once, then equipped)
  make({ animation_id: 'an-mic-neon', name: 'Neon Halka', category_id: 'mic', asset: art('neon-halka'), motion: 'ring', count: 1, duration_ms: 1400, display_type: 'mic_effect', coin_price: 500 }),
  make({ animation_id: 'an-mic-wave', name: 'Ses Dalgası', category_id: 'mic', asset: art('ses-dalgasi'), motion: 'wave', count: 3, duration_ms: 1500, display_type: 'mic_effect', coin_price: 300, free: true }),
  make({ animation_id: 'an-mic-stars', name: 'Dönen Yıldızlar', category_id: 'mic', asset: art('donen-yildizlar'), motion: 'orbit', count: 5, duration_ms: 1800, display_type: 'mic_effect', coin_price: 800 }),
  make({ animation_id: 'an-mic-notes', name: 'Müzik Notaları', category_id: 'mic', asset: art('muzik-notalari'), motion: 'rise', count: 3, duration_ms: 1600, display_type: 'mic_effect', coin_price: 600 }),
  // Small reactions from the seat (free)
  make({ animation_id: 'an-hearts', name: 'Uçan Kalpler', category_id: 'love', asset: art('ucan-kalpler'), motion: 'rise', count: 6, duration_ms: 1800, display_type: 'reaction', coin_price: 0, free: true }),
  make({ animation_id: 'an-clap', name: 'Alkış', category_id: 'cute', asset: art('alkis'), motion: 'burst', count: 8, duration_ms: 1200, display_type: 'reaction', coin_price: 0, free: true }),
  make({ animation_id: 'an-laugh', name: 'Kahkaha', category_id: 'cute', asset: art('kahkaha'), motion: 'rise', count: 5, duration_ms: 1600, display_type: 'reaction', coin_price: 0, free: true }),
  make({ animation_id: 'an-butterfly', name: 'Kelebekler', category_id: 'love', asset: art('kelebekler'), motion: 'rise', count: 5, duration_ms: 2200, display_type: 'reaction', coin_price: 20 }),
  // Gift effects from the seat (paid)
  make({ animation_id: 'an-bouquet', name: 'Gül Buketi', category_id: 'love', asset: art('gul-buketi'), motion: 'zoom', count: 1, duration_ms: 2200, display_type: 'gift', coin_price: 99 }),
  make({ animation_id: 'an-panda', name: 'Dans Eden Panda', category_id: 'cute', asset: art('dans-eden-panda'), motion: 'rise', count: 3, duration_ms: 2400, display_type: 'gift', coin_price: 150 }),
  make({ animation_id: 'an-crown', name: 'Kraliyet Tacı', category_id: 'royal', asset: icon('crown'), motion: 'zoom', count: 1, duration_ms: 2600, display_type: 'gift', coin_price: 500 }),
  make({ animation_id: 'an-chest', name: 'Hazine Sandığı', category_id: 'wealth', asset: icon('gift'), motion: 'burst', count: 10, duration_ms: 2400, display_type: 'gift', coin_price: 300 }),
  // Full screen (paid, large)
  make({ animation_id: 'an-heart-rain', name: 'Kalp Yağmuru', category_id: 'love', asset: art('kalp-yagmuru'), motion: 'rain', count: 24, duration_ms: 3200, display_type: 'fullscreen', coin_price: 999 }),
  make({ animation_id: 'an-coin-rain', name: 'Altın Yağmuru', category_id: 'wealth', asset: icon('coin'), motion: 'rain', count: 22, duration_ms: 3200, display_type: 'fullscreen', coin_price: 1_999 }),
  make({ animation_id: 'an-diamond-rain', name: 'Elmas Yağmuru', category_id: 'royal', asset: icon('diamond'), motion: 'rain', count: 20, duration_ms: 3200, display_type: 'fullscreen', coin_price: 2_999 }),
  make({ animation_id: 'an-supercar', name: 'Spor Araba', category_id: 'ride', asset: art('spor-araba'), motion: 'fly', count: 1, duration_ms: 2600, display_type: 'fullscreen', coin_price: 4_999 }),
  make({ animation_id: 'an-jet', name: 'Özel Jet', category_id: 'ride', asset: art('ozel-jet'), motion: 'fly', count: 1, duration_ms: 3000, display_type: 'fullscreen', coin_price: 9_999 }),
  make({ animation_id: 'an-dragon', name: 'Ejderha', category_id: 'fantasy', asset: art('ejderha'), motion: 'fly', count: 1, duration_ms: 3400, display_type: 'fullscreen', coin_price: 19_999 }),
  make({ animation_id: 'an-rocket', name: 'Roket Fırlatma', category_id: 'space', asset: art('roket-firlatma'), motion: 'rise', count: 1, duration_ms: 2600, display_type: 'fullscreen', coin_price: 2_499 }),
  make({ animation_id: 'an-fireworks', name: 'Havai Fişek', category_id: 'space', asset: art('havai-fisek'), motion: 'burst', count: 16, duration_ms: 2800, display_type: 'fullscreen', coin_price: 1_499 }),
  // I · campaign item, only inside its window
  make({ animation_id: 'an-newyear', name: 'Yılbaşı Kutlaması', category_id: 'event', asset: art('yilbasi-kutlamasi'), motion: 'rain', count: 18, duration_ms: 3200, display_type: 'fullscreen', coin_price: 999, starts_at: '2026-12-20', ends_at: '2027-01-07' }),
];
