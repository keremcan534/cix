// The one place the Oyun Salonu screens take their pictures from (docs/GORSEL_URETIM_LISTESI.md §16, §17, §19, §24). Each
// picture the list names has a line below; until its PNG is delivered the line stays a comment and the game draws
// its emoji or code fallback. When the owner sends a file: put it in app/assets/games/ under exactly that name
// (shrunk: an opaque background as a JPEG, everything else a PNG) and uncomment its line, pointing it there; every
// place that draws it switches at once (tests/salon-art.test.ts fails while a delivered picture's line is still a
// comment, and while an open line names a file that isn't there). Kızıl Yedi's pack and the shared JACKPOT pieces
// stay in app/assets/art/. Pictures carry no text or digits: the app writes multipliers and amounts over them.
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
  | 'bilye-kanal'
  // §24 Kızıl Yedi deneme paketi (one machine dressed in full: fx/slot-skin)
  | 'kizil-yedi-arka-plan'
  | 'kizil-yedi-cerceve'
  | 'kizil-yedi-kazanc'
  | 'kizil-yedi-cevir'
  | 'kizil-yedi-kapak'
  | 'slot-kiraz'
  | 'slot-limon'
  | 'slot-mango'
  | 'slot-uzum'
  | 'slot-yedi'
  | 'slot-elmas'
  | 'jackpot-levha'
  | 'jackpot-isik'
  | 'jeton-altin'
  | 'jeton-yigini'
  | 'parilti'
  // §24 Hazine Kulesi
  | 'hazine-kulesi-arka-plan'
  | 'hazine-kulesi-cerceve'
  | 'hazine-kulesi-kazanc'
  | 'hazine-kulesi-cevir'
  | 'hazine-kulesi-kapak'
  | 'slot-can'
  | 'slot-bar'
  | 'slot-bar2'
  | 'slot-dolar'
  | 'slot-77-wild'
  // §24 Vahşi Patika
  | 'vahsi-patika-arka-plan'
  | 'vahsi-patika-cerceve'
  | 'vahsi-patika-kazanc'
  | 'vahsi-patika-cevir'
  | 'vahsi-patika-kapak'
  | 'patika-10'
  | 'patika-j'
  | 'patika-q'
  | 'patika-k'
  | 'patika-a'
  | 'patika-gergedan'
  | 'patika-timsah'
  | 'patika-fil'
  | 'patika-goril'
  | 'patika-aslan-wild'
  // §24 Neon Bulvar
  | 'neon-bulvar-arka-plan'
  | 'neon-bulvar-cerceve'
  | 'neon-bulvar-kazanc'
  | 'neon-bulvar-cevir'
  | 'neon-bulvar-kapak'
  | 'neon-j'
  | 'neon-q'
  | 'neon-k'
  | 'neon-karpuz'
  | 'neon-dudak'
  | 'neon-kalp'
  | 'neon-elmas'
  | 'neon-wild'
  // §24 Konfeti Kutusu (its cabinet has not come: the reels stand in a drawn box)
  | 'konfeti-kutusu-arka-plan'
  | 'konfeti-kutusu-kazanc'
  | 'konfeti-kutusu-cevir'
  | 'konfeti-kutusu-kapak'
  | 'konfeti-j'
  | 'konfeti-q'
  | 'konfeti-k'
  | 'konfeti-a'
  | 'konfeti-biber'
  | 'konfeti-tako'
  | 'konfeti-marakas'
  | 'konfeti-gitar'
  | 'konfeti-kafatasi'
  | 'konfeti-pinata-wild'
  // §24 Kayıp Parşömen
  | 'kayip-parsomen-arka-plan'
  | 'kayip-parsomen-cerceve'
  | 'kayip-parsomen-kazanc'
  | 'kayip-parsomen-cevir'
  | 'kayip-parsomen-kapak'
  | 'parsomen-mum'
  | 'parsomen-tomar'
  | 'parsomen-asa'
  | 'parsomen-kadeh'
  | 'parsomen-yuzuk'
  | 'parsomen-muska'
  | 'parsomen-kedi'
  | 'parsomen-cadi-wild'
  | 'parsomen-kitap'
  // §24 Bereket Ağacı
  | 'bereket-agaci-arka-plan'
  | 'bereket-agaci-cerceve'
  | 'bereket-agaci-kazanc'
  | 'bereket-agaci-cevir'
  | 'bereket-agaci-kapak'
  | 'bereket-agac'
  | 'bereket-para-kirmizi'
  | 'bereket-para-mavi'
  | 'bereket-para-yesil'
  // §16 Kapaklar (Lezzet Çarkı, Sihir Destesi)
  | 'lezzet-carki-kapak'
  | 'sihir-destesi-kapak'
  // Ortak kontroller: Çevir, Turbo, Oto, bahis, Tekrar, Temizle, kurallar, fişler (sıradaki yerine göre), Büyük Kazanç levhası, kilit
  | 'dugme-cevir'
  | 'dugme-cevir-dur'
  | 'dugme-turbo'
  | 'dugme-turbo-acik'
  | 'dugme-oto'
  | 'dugme-oto-acik'
  | 'dugme-eksi'
  | 'dugme-arti'
  | 'dugme-tekrar'
  | 'dugme-temizle'
  | 'dugme-kurallar'
  | 'fis-1'
  | 'fis-2'
  | 'fis-3'
  | 'fis-4'
  | 'fis-5'
  | 'fis-6'
  | 'levha-buyuk-kazanc'
  | 'kilit-oyun';

const ART: Partial<Record<SalonArtName, number>> = {
  // §16
  'cark-ibre': require('../../../../assets/games/cark-ibre.png'),
  'gece-carki-gobek': require('../../../../assets/games/gece-carki-gobek.png'),
  'meyve-karpuz': require('../../../../assets/games/meyve-karpuz.png'),
  'meyve-elma': require('../../../../assets/games/meyve-elma.png'),
  'meyve-limon': require('../../../../assets/games/meyve-limon.png'),
  'meyve-uzum': require('../../../../assets/games/meyve-uzum.png'),
  'meyve-77': require('../../../../assets/games/meyve-77.png'),
  'lezzet-tabak': require('../../../../assets/games/lezzet-tabak.png'),
  'lezzet-doner': require('../../../../assets/games/lezzet-doner.png'),
  'lezzet-hamburger': require('../../../../assets/games/lezzet-hamburger.png'),
  'lezzet-tavuk': require('../../../../assets/games/lezzet-tavuk.png'),
  'lezzet-et': require('../../../../assets/games/lezzet-et.png'),
  'lezzet-domates': require('../../../../assets/games/lezzet-domates.png'),
  'lezzet-balkabagi': require('../../../../assets/games/lezzet-balkabagi.png'),
  'lezzet-mantar': require('../../../../assets/games/lezzet-mantar.png'),
  'lezzet-lahana': require('../../../../assets/games/lezzet-lahana.png'),
  'lezzet-salata': require('../../../../assets/games/lezzet-salata.png'),
  'lezzet-pizza': require('../../../../assets/games/lezzet-pizza.png'),
  'lezzet-bos-tabak': require('../../../../assets/games/lezzet-bos-tabak.png'),
  'sihir-kart-arkasi': require('../../../../assets/games/sihir-kart-arkasi.png'),
  'sihir-burc-kova': require('../../../../assets/games/sihir-burc-kova.png'),
  'sihir-burc-basak': require('../../../../assets/games/sihir-burc-basak.png'),
  'sihir-burc-boga': require('../../../../assets/games/sihir-burc-boga.png'),
  'sihir-burc-yengec': require('../../../../assets/games/sihir-burc-yengec.png'),
  'sihir-burc-balik': require('../../../../assets/games/sihir-burc-balik.png'),
  'sihir-burc-aslan': require('../../../../assets/games/sihir-burc-aslan.png'),
  'sihir-burc-yay': require('../../../../assets/games/sihir-burc-yay.png'),
  'sihir-burc-akrep': require('../../../../assets/games/sihir-burc-akrep.png'),
  'sihir-joker': require('../../../../assets/games/sihir-joker.png'),
  // 'ruzgar-ozet-rozet': require('../../../../assets/art/ruzgar-ozet-rozet.png'),
  'ruzgar-merkez': require('../../../../assets/games/ruzgar-merkez.png'),
  // 'ruzgar-ok': require('../../../../assets/art/ruzgar-ok.png'),
  // §17
  // 'yorunge-roket': require('../../../../assets/art/yorunge-roket.png'),
  // 'yorunge-gezegen': require('../../../../assets/art/yorunge-gezegen.png'),
  // 'yorunge-rampa': require('../../../../assets/art/yorunge-rampa.png'),
  'balonavi-kucuk': require('../../../../assets/games/balonavi-kucuk.png'),
  // 'balonavi-kalp': require('../../../../assets/art/balonavi-kalp.png'),
  'balonavi-yildiz': require('../../../../assets/games/balonavi-yildiz.png'),
  'balonavi-konfeti': require('../../../../assets/games/balonavi-konfeti.png'),
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
  // §24
  'kizil-yedi-arka-plan': require('../../../../assets/art/kizil-yedi-arka-plan.png'),
  'kizil-yedi-cerceve': require('../../../../assets/art/kizil-yedi-cerceve.png'),
  'kizil-yedi-kazanc': require('../../../../assets/art/kizil-yedi-kazanc.png'),
  'kizil-yedi-cevir': require('../../../../assets/art/kizil-yedi-cevir.png'),
  'kizil-yedi-kapak': require('../../../../assets/art/kizil-yedi-kapak.png'),
  'slot-kiraz': require('../../../../assets/art/slot-kiraz.png'),
  'slot-limon': require('../../../../assets/art/slot-limon.png'),
  'slot-mango': require('../../../../assets/art/slot-mango.png'),
  'slot-uzum': require('../../../../assets/art/slot-uzum.png'),
  'slot-yedi': require('../../../../assets/art/slot-yedi.png'),
  'slot-elmas': require('../../../../assets/art/slot-elmas.png'),
  'jackpot-levha': require('../../../../assets/art/jackpot-levha.png'),
  'jackpot-isik': require('../../../../assets/art/jackpot-isik.png'),
  'jeton-altin': require('../../../../assets/art/jeton-altin.png'),
  'jeton-yigini': require('../../../../assets/art/jeton-yigini.png'),
  'parilti': require('../../../../assets/art/parilti.png'),
  // §24 Hazine Kulesi
  'hazine-kulesi-arka-plan': require('../../../../assets/games/hazine-kulesi-arka-plan.jpg'),
  'hazine-kulesi-cerceve': require('../../../../assets/games/hazine-kulesi-cerceve.png'),
  'hazine-kulesi-kazanc': require('../../../../assets/games/hazine-kulesi-kazanc.png'),
  'hazine-kulesi-cevir': require('../../../../assets/games/hazine-kulesi-cevir.png'),
  'hazine-kulesi-kapak': require('../../../../assets/games/hazine-kulesi-kapak.png'),
  'slot-can': require('../../../../assets/games/slot-can.png'),
  'slot-bar': require('../../../../assets/games/slot-bar.png'),
  'slot-bar2': require('../../../../assets/games/slot-bar2.png'),
  'slot-dolar': require('../../../../assets/games/slot-dolar.png'),
  'slot-77-wild': require('../../../../assets/games/slot-77-wild.png'),
  // §24 Vahşi Patika
  'vahsi-patika-arka-plan': require('../../../../assets/games/vahsi-patika-arka-plan.jpg'),
  'vahsi-patika-cerceve': require('../../../../assets/games/vahsi-patika-cerceve.png'),
  'vahsi-patika-kazanc': require('../../../../assets/games/vahsi-patika-kazanc.png'),
  'vahsi-patika-cevir': require('../../../../assets/games/vahsi-patika-cevir.png'),
  'vahsi-patika-kapak': require('../../../../assets/games/vahsi-patika-kapak.png'),
  'patika-10': require('../../../../assets/games/patika-10.png'),
  'patika-j': require('../../../../assets/games/patika-j.png'),
  'patika-q': require('../../../../assets/games/patika-q.png'),
  'patika-k': require('../../../../assets/games/patika-k.png'),
  'patika-a': require('../../../../assets/games/patika-a.png'),
  'patika-gergedan': require('../../../../assets/games/patika-gergedan.png'),
  'patika-timsah': require('../../../../assets/games/patika-timsah.png'),
  'patika-fil': require('../../../../assets/games/patika-fil.png'),
  'patika-goril': require('../../../../assets/games/patika-goril.png'),
  'patika-aslan-wild': require('../../../../assets/games/patika-aslan-wild.png'),
  // §24 Neon Bulvar
  'neon-bulvar-arka-plan': require('../../../../assets/games/neon-bulvar-arka-plan.jpg'),
  'neon-bulvar-cerceve': require('../../../../assets/games/neon-bulvar-cerceve.png'),
  'neon-bulvar-kazanc': require('../../../../assets/games/neon-bulvar-kazanc.png'),
  'neon-bulvar-cevir': require('../../../../assets/games/neon-bulvar-cevir.png'),
  'neon-bulvar-kapak': require('../../../../assets/games/neon-bulvar-kapak.png'),
  'neon-j': require('../../../../assets/games/neon-j.png'),
  'neon-q': require('../../../../assets/games/neon-q.png'),
  'neon-k': require('../../../../assets/games/neon-k.png'),
  'neon-karpuz': require('../../../../assets/games/neon-karpuz.png'),
  'neon-dudak': require('../../../../assets/games/neon-dudak.png'),
  'neon-kalp': require('../../../../assets/games/neon-kalp.png'),
  'neon-elmas': require('../../../../assets/games/neon-elmas.png'),
  'neon-wild': require('../../../../assets/games/neon-wild.png'),
  // §24 Konfeti Kutusu (its cabinet has not come: the reels stand in a drawn box)
  'konfeti-kutusu-arka-plan': require('../../../../assets/games/konfeti-kutusu-arka-plan.jpg'),
  'konfeti-kutusu-kazanc': require('../../../../assets/games/konfeti-kutusu-kazanc.png'),
  'konfeti-kutusu-cevir': require('../../../../assets/games/konfeti-kutusu-cevir.png'),
  'konfeti-kutusu-kapak': require('../../../../assets/games/konfeti-kutusu-kapak.png'),
  'konfeti-j': require('../../../../assets/games/konfeti-j.png'),
  'konfeti-q': require('../../../../assets/games/konfeti-q.png'),
  'konfeti-k': require('../../../../assets/games/konfeti-k.png'),
  'konfeti-a': require('../../../../assets/games/konfeti-a.png'),
  'konfeti-biber': require('../../../../assets/games/konfeti-biber.png'),
  'konfeti-tako': require('../../../../assets/games/konfeti-tako.png'),
  'konfeti-marakas': require('../../../../assets/games/konfeti-marakas.png'),
  'konfeti-gitar': require('../../../../assets/games/konfeti-gitar.png'),
  'konfeti-kafatasi': require('../../../../assets/games/konfeti-kafatasi.png'),
  'konfeti-pinata-wild': require('../../../../assets/games/konfeti-pinata-wild.png'),
  // §24 Kayıp Parşömen
  'kayip-parsomen-arka-plan': require('../../../../assets/games/kayip-parsomen-arka-plan.jpg'),
  'kayip-parsomen-cerceve': require('../../../../assets/games/kayip-parsomen-cerceve.png'),
  'kayip-parsomen-kazanc': require('../../../../assets/games/kayip-parsomen-kazanc.png'),
  'kayip-parsomen-cevir': require('../../../../assets/games/kayip-parsomen-cevir.png'),
  'kayip-parsomen-kapak': require('../../../../assets/games/kayip-parsomen-kapak.png'),
  'parsomen-mum': require('../../../../assets/games/parsomen-mum.png'),
  'parsomen-tomar': require('../../../../assets/games/parsomen-tomar.png'),
  'parsomen-asa': require('../../../../assets/games/parsomen-asa.png'),
  'parsomen-kadeh': require('../../../../assets/games/parsomen-kadeh.png'),
  'parsomen-yuzuk': require('../../../../assets/games/parsomen-yuzuk.png'),
  'parsomen-muska': require('../../../../assets/games/parsomen-muska.png'),
  'parsomen-kedi': require('../../../../assets/games/parsomen-kedi.png'),
  'parsomen-cadi-wild': require('../../../../assets/games/parsomen-cadi-wild.png'),
  'parsomen-kitap': require('../../../../assets/games/parsomen-kitap.png'),
  // §24 Bereket Ağacı
  'bereket-agaci-arka-plan': require('../../../../assets/games/bereket-agaci-arka-plan.jpg'),
  'bereket-agaci-cerceve': require('../../../../assets/games/bereket-agaci-cerceve.png'),
  'bereket-agaci-kazanc': require('../../../../assets/games/bereket-agaci-kazanc.png'),
  'bereket-agaci-cevir': require('../../../../assets/games/bereket-agaci-cevir.png'),
  'bereket-agaci-kapak': require('../../../../assets/games/bereket-agaci-kapak.png'),
  'bereket-agac': require('../../../../assets/games/bereket-agac.png'),
  'bereket-para-kirmizi': require('../../../../assets/games/bereket-para-kirmizi.png'),
  'bereket-para-mavi': require('../../../../assets/games/bereket-para-mavi.png'),
  'bereket-para-yesil': require('../../../../assets/games/bereket-para-yesil.png'),
  // §16 Kapaklar (Lezzet Çarkı, Sihir Destesi)
  'lezzet-carki-kapak': require('../../../../assets/games/lezzet-carki-kapak.png'),
  'sihir-destesi-kapak': require('../../../../assets/games/sihir-destesi-kapak.png'),
  // Ortak kontroller: Çevir, Turbo, Oto, bahis, Tekrar, Temizle, kurallar, fişler (sıradaki yerine göre), Büyük Kazanç levhası, kilit
  'dugme-cevir': require('../../../../assets/games/dugme-cevir.png'),
  'dugme-cevir-dur': require('../../../../assets/games/dugme-cevir-dur.png'),
  'dugme-turbo': require('../../../../assets/games/dugme-turbo.png'),
  'dugme-turbo-acik': require('../../../../assets/games/dugme-turbo-acik.png'),
  'dugme-oto': require('../../../../assets/games/dugme-oto.png'),
  'dugme-oto-acik': require('../../../../assets/games/dugme-oto-acik.png'),
  'dugme-eksi': require('../../../../assets/games/dugme-eksi.png'),
  'dugme-arti': require('../../../../assets/games/dugme-arti.png'),
  'dugme-tekrar': require('../../../../assets/games/dugme-tekrar.png'),
  'dugme-temizle': require('../../../../assets/games/dugme-temizle.png'),
  'dugme-kurallar': require('../../../../assets/games/dugme-kurallar.png'),
  'fis-1': require('../../../../assets/games/fis-1.png'),
  'fis-2': require('../../../../assets/games/fis-2.png'),
  'fis-3': require('../../../../assets/games/fis-3.png'),
  'fis-4': require('../../../../assets/games/fis-4.png'),
  'fis-5': require('../../../../assets/games/fis-5.png'),
  'fis-6': require('../../../../assets/games/fis-6.png'),
  'levha-buyuk-kazanc': require('../../../../assets/games/levha-buyuk-kazanc.png'),
  'kilit-oyun': require('../../../../assets/games/kilit-oyun.png'),
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
