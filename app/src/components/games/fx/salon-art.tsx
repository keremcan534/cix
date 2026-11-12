// The one place the Oyun Salonu screens take their pictures from (docs/GORSEL_URETIM_LISTESI.md §16, §17, §19). Each
// picture the list names has a line below; until its PNG is delivered the line stays a comment and the game draws
// its emoji or code fallback. When the owner sends a file: put it in app/assets/art/ under exactly that name and
// uncomment its line; every place that draws it switches at once (tests/salon-art.test.ts fails while a delivered
// PNG's line is still a comment, and while an open line names a file that isn't there). Pictures carry no text or
// digits: the app writes multipliers and amounts over them.
import type { ReactNode } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

export type SalonArtName =
  // §16 Çark ve tahta oyunları
  | 'cark-ibre'
  | 'gece-carki-gobek'
  | 'meyve-karpuz'
  | 'meyve-elma'
  | 'meyve-limon'
  | 'meyve-uzum'
  | 'meyve-77'
  | 'lezzet-tabak'
  | 'lezzet-doner'
  | 'lezzet-hamburger'
  | 'lezzet-tavuk'
  | 'lezzet-et'
  | 'lezzet-domates'
  | 'lezzet-balkabagi'
  | 'lezzet-mantar'
  | 'lezzet-lahana'
  | 'lezzet-salata'
  | 'lezzet-pizza'
  | 'lezzet-bos-tabak'
  | 'sihir-kart-arkasi'
  | 'sihir-burc-kova'
  | 'sihir-burc-basak'
  | 'sihir-burc-boga'
  | 'sihir-burc-yengec'
  | 'sihir-burc-balik'
  | 'sihir-burc-aslan'
  | 'sihir-burc-yay'
  | 'sihir-burc-akrep'
  | 'sihir-joker'
  | 'ruzgar-ozet-rozet'
  | 'ruzgar-merkez'
  | 'ruzgar-ok'
  // §17 Yörünge, Balon Avı, Yıldız Avı
  | 'yorunge-roket'
  | 'yorunge-gezegen'
  | 'yorunge-rampa'
  | 'balonavi-kucuk'
  | 'balonavi-kalp'
  | 'balonavi-yildiz'
  | 'balonavi-konfeti'
  | 'balonavi-ay'
  | 'balonavi-ucurtma'
  | 'balonavi-disko'
  | 'balonavi-ucan-daire'
  | 'balonavi-dev'
  | 'balonavi-ejderha'
  | 'balonavi-top-namlu'
  | 'balonavi-top-kaide'
  | 'balonavi-bulutlar'
  | 'yildizavi-kucuk'
  | 'yildizavi-orta'
  | 'yildizavi-buyuk'
  | 'yildizavi-altin'
  | 'yildizavi-kuyruklu'
  | 'yildizavi-kule'
  | 'oyun-balon-avi'
  | 'oyun-yildiz-avi'
  // §19 Pachinko
  | 'oyun-pachinko'
  | 'bilye-top'
  | 'bilye-civi'
  | 'bilye-kupa-altin'
  | 'bilye-kupa-yakut'
  | 'bilye-kupa-zumrut'
  | 'bilye-tahta'
  | 'bilye-kanal';

const ART: Partial<Record<SalonArtName, number>> = {
  // §16
  // 'cark-ibre': require('../../../../assets/art/cark-ibre.png'),
  // 'gece-carki-gobek': require('../../../../assets/art/gece-carki-gobek.png'),
  // 'meyve-karpuz': require('../../../../assets/art/meyve-karpuz.png'),
  // 'meyve-elma': require('../../../../assets/art/meyve-elma.png'),
  // 'meyve-limon': require('../../../../assets/art/meyve-limon.png'),
  // 'meyve-uzum': require('../../../../assets/art/meyve-uzum.png'),
  // 'meyve-77': require('../../../../assets/art/meyve-77.png'),
  // 'lezzet-tabak': require('../../../../assets/art/lezzet-tabak.png'),
  // 'lezzet-doner': require('../../../../assets/art/lezzet-doner.png'),
  // 'lezzet-hamburger': require('../../../../assets/art/lezzet-hamburger.png'),
  // 'lezzet-tavuk': require('../../../../assets/art/lezzet-tavuk.png'),
  // 'lezzet-et': require('../../../../assets/art/lezzet-et.png'),
  // 'lezzet-domates': require('../../../../assets/art/lezzet-domates.png'),
  // 'lezzet-balkabagi': require('../../../../assets/art/lezzet-balkabagi.png'),
  // 'lezzet-mantar': require('../../../../assets/art/lezzet-mantar.png'),
  // 'lezzet-lahana': require('../../../../assets/art/lezzet-lahana.png'),
  // 'lezzet-salata': require('../../../../assets/art/lezzet-salata.png'),
  // 'lezzet-pizza': require('../../../../assets/art/lezzet-pizza.png'),
  // 'lezzet-bos-tabak': require('../../../../assets/art/lezzet-bos-tabak.png'),
  // 'sihir-kart-arkasi': require('../../../../assets/art/sihir-kart-arkasi.png'),
  // 'sihir-burc-kova': require('../../../../assets/art/sihir-burc-kova.png'),
  // 'sihir-burc-basak': require('../../../../assets/art/sihir-burc-basak.png'),
  // 'sihir-burc-boga': require('../../../../assets/art/sihir-burc-boga.png'),
  // 'sihir-burc-yengec': require('../../../../assets/art/sihir-burc-yengec.png'),
  // 'sihir-burc-balik': require('../../../../assets/art/sihir-burc-balik.png'),
  // 'sihir-burc-aslan': require('../../../../assets/art/sihir-burc-aslan.png'),
  // 'sihir-burc-yay': require('../../../../assets/art/sihir-burc-yay.png'),
  // 'sihir-burc-akrep': require('../../../../assets/art/sihir-burc-akrep.png'),
  // 'sihir-joker': require('../../../../assets/art/sihir-joker.png'),
  // 'ruzgar-ozet-rozet': require('../../../../assets/art/ruzgar-ozet-rozet.png'),
  // 'ruzgar-merkez': require('../../../../assets/art/ruzgar-merkez.png'),
  // 'ruzgar-ok': require('../../../../assets/art/ruzgar-ok.png'),
  // §17
  // 'yorunge-roket': require('../../../../assets/art/yorunge-roket.png'),
  // 'yorunge-gezegen': require('../../../../assets/art/yorunge-gezegen.png'),
  // 'yorunge-rampa': require('../../../../assets/art/yorunge-rampa.png'),
  // 'balonavi-kucuk': require('../../../../assets/art/balonavi-kucuk.png'),
  // 'balonavi-kalp': require('../../../../assets/art/balonavi-kalp.png'),
  // 'balonavi-yildiz': require('../../../../assets/art/balonavi-yildiz.png'),
  // 'balonavi-konfeti': require('../../../../assets/art/balonavi-konfeti.png'),
  // 'balonavi-ay': require('../../../../assets/art/balonavi-ay.png'),
  // 'balonavi-ucurtma': require('../../../../assets/art/balonavi-ucurtma.png'),
  // 'balonavi-disko': require('../../../../assets/art/balonavi-disko.png'),
  // 'balonavi-ucan-daire': require('../../../../assets/art/balonavi-ucan-daire.png'),
  // 'balonavi-dev': require('../../../../assets/art/balonavi-dev.png'),
  // 'balonavi-ejderha': require('../../../../assets/art/balonavi-ejderha.png'),
  // 'balonavi-top-namlu': require('../../../../assets/art/balonavi-top-namlu.png'),
  // 'balonavi-top-kaide': require('../../../../assets/art/balonavi-top-kaide.png'),
  // 'balonavi-bulutlar': require('../../../../assets/art/balonavi-bulutlar.png'),
  // 'yildizavi-kucuk': require('../../../../assets/art/yildizavi-kucuk.png'),
  // 'yildizavi-orta': require('../../../../assets/art/yildizavi-orta.png'),
  // 'yildizavi-buyuk': require('../../../../assets/art/yildizavi-buyuk.png'),
  // 'yildizavi-altin': require('../../../../assets/art/yildizavi-altin.png'),
  // 'yildizavi-kuyruklu': require('../../../../assets/art/yildizavi-kuyruklu.png'),
  // 'yildizavi-kule': require('../../../../assets/art/yildizavi-kule.png'),
  // 'oyun-balon-avi': require('../../../../assets/art/oyun-balon-avi.png'),
  // 'oyun-yildiz-avi': require('../../../../assets/art/oyun-yildiz-avi.png'),
  // §19
  // 'oyun-pachinko': require('../../../../assets/art/oyun-pachinko.png'),
  // 'bilye-top': require('../../../../assets/art/bilye-top.png'),
  // 'bilye-civi': require('../../../../assets/art/bilye-civi.png'),
  // 'bilye-kupa-altin': require('../../../../assets/art/bilye-kupa-altin.png'),
  // 'bilye-kupa-yakut': require('../../../../assets/art/bilye-kupa-yakut.png'),
  // 'bilye-kupa-zumrut': require('../../../../assets/art/bilye-kupa-zumrut.png'),
  // 'bilye-tahta': require('../../../../assets/art/bilye-tahta.png'),
  // 'bilye-kanal': require('../../../../assets/art/bilye-kanal.png'),
};

/** The delivered picture, or undefined while the game still draws its fallback. */
export const salonArt = (name: SalonArtName): number | undefined => ART[name];

/**
 * The picture when it has been delivered, else `fallback` (the emoji or the code drawing it stands in for). Square
 * unless `h` is given.
 */
export function SalonArt({ name, size, h, fallback, style }: { name: SalonArtName; size: number; h?: number; fallback: ReactNode; style?: StyleProp<ImageStyle> }) {
  const src = ART[name];
  if (src === undefined) return <>{fallback}</>;
  return <Image source={src} style={[{ width: size, height: h ?? size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** Art names of the boards' options, by option id (lib/board-games). */
export const OPTION_ART: Record<string, SalonArtName> = {
  melon: 'meyve-karpuz',
  apple: 'meyve-elma',
  lemon: 'meyve-limon',
  grape: 'meyve-uzum',
  seven: 'meyve-77',
  crab: 'lezzet-doner',
  fish: 'lezzet-hamburger',
  shrimp: 'lezzet-tavuk',
  steak: 'lezzet-et',
  tomato: 'lezzet-domates',
  pumpkin: 'lezzet-balkabagi',
  mushroom: 'lezzet-mantar',
  cabbage: 'lezzet-lahana',
  salad: 'lezzet-salata',
  pizza: 'lezzet-pizza',
  empty: 'lezzet-bos-tabak',
  aquarius: 'sihir-burc-kova',
  virgo: 'sihir-burc-basak',
  taurus: 'sihir-burc-boga',
  cancer: 'sihir-burc-yengec',
  pisces: 'sihir-burc-balik',
  leo: 'sihir-burc-aslan',
  sagittarius: 'sihir-burc-yay',
  scorpio: 'sihir-burc-akrep',
  joker: 'sihir-joker',
};
