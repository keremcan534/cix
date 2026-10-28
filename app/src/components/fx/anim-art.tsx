// Effect and animation pictures (docs/GORSEL_URETIM_LISTESI.md §2): the still image a catalog record
// draws with its motion preset (asset kind 'art'), 192 px for the panel and seat effects, 512 px for
// full-screen plays. Moving versions (Lottie / transparent video) are separate work; until then the
// motion presets in anim-player move these stills.
import { Image } from 'react-native';

const ART = {
  alkis: { sm: require('../../../assets/anim/192/animasyon-alkis.png'), lg: require('../../../assets/anim/512/animasyon-alkis.png') },
  'anka-kusu': { sm: require('../../../assets/anim/192/animasyon-anka-kusu.png'), lg: require('../../../assets/anim/512/animasyon-anka-kusu.png') },
  'dans-eden-panda': { sm: require('../../../assets/anim/192/animasyon-dans-eden-panda.png'), lg: require('../../../assets/anim/512/animasyon-dans-eden-panda.png') },
  'donen-yildizlar': { sm: require('../../../assets/anim/192/animasyon-donen-yildizlar.png'), lg: require('../../../assets/anim/512/animasyon-donen-yildizlar.png') },
  ejderha: { sm: require('../../../assets/anim/192/animasyon-ejderha.png'), lg: require('../../../assets/anim/512/animasyon-ejderha.png') },
  'galaksi-tuneli': { sm: require('../../../assets/anim/192/animasyon-galaksi-tuneli.png'), lg: require('../../../assets/anim/512/animasyon-galaksi-tuneli.png') },
  'gul-buketi': { sm: require('../../../assets/anim/192/animasyon-gul-buketi.png'), lg: require('../../../assets/anim/512/animasyon-gul-buketi.png') },
  'havai-fisek': { sm: require('../../../assets/anim/192/animasyon-havai-fisek.png'), lg: require('../../../assets/anim/512/animasyon-havai-fisek.png') },
  kahkaha: { sm: require('../../../assets/anim/192/animasyon-kahkaha.png'), lg: require('../../../assets/anim/512/animasyon-kahkaha.png') },
  'kalp-yagmuru': { sm: require('../../../assets/anim/192/animasyon-kalp-yagmuru.png'), lg: require('../../../assets/anim/512/animasyon-kalp-yagmuru.png') },
  kelebekler: { sm: require('../../../assets/anim/192/animasyon-kelebekler.png'), lg: require('../../../assets/anim/512/animasyon-kelebekler.png') },
  'kristal-kale': { sm: require('../../../assets/anim/192/animasyon-kristal-kale.png'), lg: require('../../../assets/anim/512/animasyon-kristal-kale.png') },
  'muzik-notalari': { sm: require('../../../assets/anim/192/animasyon-muzik-notalari.png'), lg: require('../../../assets/anim/512/animasyon-muzik-notalari.png') },
  'neon-halka': { sm: require('../../../assets/anim/192/animasyon-neon-halka.png'), lg: require('../../../assets/anim/512/animasyon-neon-halka.png') },
  'ozel-jet': { sm: require('../../../assets/anim/192/animasyon-ozel-jet.png'), lg: require('../../../assets/anim/512/animasyon-ozel-jet.png') },
  'pelus-ayi': { sm: require('../../../assets/anim/192/animasyon-pelus-ayi.png'), lg: require('../../../assets/anim/512/animasyon-pelus-ayi.png') },
  'roket-firlatma': { sm: require('../../../assets/anim/192/animasyon-roket-firlatma.png'), lg: require('../../../assets/anim/512/animasyon-roket-firlatma.png') },
  'ses-dalgasi': { sm: require('../../../assets/anim/192/animasyon-ses-dalgasi.png'), lg: require('../../../assets/anim/512/animasyon-ses-dalgasi.png') },
  'spor-araba': { sm: require('../../../assets/anim/192/animasyon-spor-araba.png'), lg: require('../../../assets/anim/512/animasyon-spor-araba.png') },
  'ucan-kalpler': { sm: require('../../../assets/anim/192/animasyon-ucan-kalpler.png'), lg: require('../../../assets/anim/512/animasyon-ucan-kalpler.png') },
  'yilbasi-kutlamasi': { sm: require('../../../assets/anim/192/animasyon-yilbasi-kutlamasi.png'), lg: require('../../../assets/anim/512/animasyon-yilbasi-kutlamasi.png') },
} as const;
export type AnimArtName = keyof typeof ART;
export const ANIM_ART_NAMES = Object.keys(ART) as AnimArtName[];

/** Category icons (data/animations ANIM_CATEGORIES ids). */
export const ANIM_CATEGORY_ART: Record<string, number> = {
  mic: require('../../../assets/anim/192/animasyon-kategori-mikrofon-ve-ses.png'),
  love: require('../../../assets/anim/192/animasyon-kategori-romantik.png'),
  ride: require('../../../assets/anim/192/animasyon-kategori-araclar.png'),
  fantasy: require('../../../assets/anim/192/animasyon-kategori-fantastik.png'),
  royal: require('../../../assets/anim/192/animasyon-kategori-ihtisam.png'),
  space: require('../../../assets/anim/192/animasyon-kategori-uzay-ve-gosteri.png'),
  wealth: require('../../../assets/anim/192/animasyon-kategori-zenginlik.png'),
  cute: require('../../../assets/anim/192/animasyon-kategori-sevimli.png'),
  event: require('../../../assets/anim/192/animasyon-kategori-ozel-gun.png'),
};

export function AnimArt({ name, size }: { name: AnimArtName; size: number }) {
  const a = ART[name];
  // 192 px covers up to ~64 pt on 3x screens.
  return <Image source={size > 64 ? a.lg : a.sm} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
