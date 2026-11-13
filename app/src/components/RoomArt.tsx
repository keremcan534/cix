// Room visuals (docs/GORSEL_URETIM_LISTESI.md §5, 3D delivery, items 1–40): 192 px PNGs for room types,
// themes, level badges and the room's own tools. Emoji inside chat lines and system messages stay text.
// Not delivered or not approved yet (Ailem, speaker queue, room bot, hidden entry) keep their emoji; the
// camera button keeps its Ionicons on/off glyph. Seats and the contribution board's laurels and podium are below; the
// stage backgrounds (themes and paid decorations) are in components/room/stage-backdrop.
import { Image, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import type { RoomTheme, RoomType } from '@/data/catalog';
import type { SeatColorId } from '@/data/seat-colors';

export const ROOM_TYPE_ART: Record<RoomType, number> = {
  free: require('../../assets/room/oda-turu-serbest-sohbet.png'),
  stage: require('../../assets/room/oda-turu-sahne.png'),
  qa: require('../../assets/room/oda-turu-soru-cevap.png'),
  music: require('../../assets/room/oda-turu-muzik-odasi.png'),
  event: require('../../assets/room/oda-turu-etkinlik-odasi.png'),
  private: require('../../assets/room/oda-turu-ozel-oda.png'),
};

export const ROOM_THEME_ART: Record<RoomTheme, number> = {
  chat: require('../../assets/room/oda-tema-sohbet.png'),
  pk: require('../../assets/room/oda-tema-pk.png'),
  music: require('../../assets/room/oda-tema-muzik.png'),
  game: require('../../assets/room/oda-tema-oyun.png'),
  party: require('../../assets/room/oda-tema-parti.png'),
  friends: require('../../assets/room/oda-tema-arkadaslik.png'),
};

// One badge per level group, in the order of ROOM_LEVEL_ICONS (data/catalog).
const BRONZE = require('../../assets/room/oda-seviye-bronz.png');
const SILVER = require('../../assets/room/oda-seviye-gumus.png');
const GOLD = require('../../assets/room/oda-seviye-altin.png');
const MEDAL = require('../../assets/room/oda-seviye-madalya.png');
const HEART = require('../../assets/room/oda-seviye-kalp.png');
const DIAMOND = require('../../assets/room/oda-seviye-elmas.png');
const ROOM_LEVEL_ART: number[] = [
  BRONZE,
  BRONZE,
  SILVER,
  SILVER,
  GOLD,
  GOLD,
  MEDAL,
  MEDAL,
  require('../../assets/room/oda-seviye-nisan.png'),
  HEART,
  HEART,
  DIAMOND,
  DIAMOND,
  require('../../assets/room/oda-seviye-tac.png'),
  require('../../assets/room/oda-seviye-uc-disli.png'),
];
export const roomLevelArt = (level: number) => ROOM_LEVEL_ART[Math.min(Math.max(level, 1), ROOM_LEVEL_ART.length) - 1];

export const ROOM_ICON_ART = {
  envelope: require('../../assets/room/oda-sansli-canta-oda-zarfi.png'),
  activity: require('../../assets/room/oda-aktivite.png'),
  poll: require('../../assets/room/oda-anket.png'),
  goal: require('../../assets/room/oda-topluluk-hedefi.png'),
  questions: require('../../assets/room/oda-sorular.png'),
  music: require('../../assets/room/oda-muzik.png'),
  agency: require('../../assets/room/oda-ajans-odasi.png'),
  bossSeat: require('../../assets/room/oda-patron-koltugu.png'),
  diceDuel: require('../../assets/room/oda-zar-duellosu.png'),
  slowMode: require('../../assets/room/oda-yavas-mod.png'),
  moderation: require('../../assets/room/oda-moderasyon.png'),
  sound: require('../../assets/room/oda-ses-ve-efekt-ayarlari.png'),
  soundOff: require('../../assets/room/oda-oda-sesi-kapali.png'),
  join: require('../../assets/room/oda-oda-uyesi-ol.png'),
} as const;

// Mic seats (docs/ODA_GORSEL_LISTESI.md "Koltuk görselleri"): the empty and the locked seat (components/room/parts
// Seat; the code adds the "+"), and the host's gold frame with its small crown. Partial: a seat with no picture here
// keeps the glass bubble drawn in code.
export const SEAT_ART: Partial<Record<'empty' | 'locked' | 'hostFrame', number>> = {
  empty: require('../../assets/room/koltuk-bos.png'),
  locked: require('../../assets/room/koltuk-kilitli.png'),
  hostFrame: require('../../assets/room/koltuk-ev-sahibi-cercevesi.png'),
};
/** Koltuk rengi (data/seat-colors): the empty and locked mic in each color; turquoise is SEAT_ART's own. */
export const SEAT_COLOR_ART: Record<SeatColorId, { empty: number; locked: number }> = {
  turkuaz: { empty: require('../../assets/room/koltuk-bos.png'), locked: require('../../assets/room/koltuk-kilitli.png') },
  pembe: { empty: require('../../assets/room/koltuk-bos-pembe.png'), locked: require('../../assets/room/koltuk-kilitli-pembe.png') },
  kirmizi: { empty: require('../../assets/room/koltuk-bos-kirmizi.png'), locked: require('../../assets/room/koltuk-kilitli-kirmizi.png') },
  turuncu: { empty: require('../../assets/room/koltuk-bos-turuncu.png'), locked: require('../../assets/room/koltuk-kilitli-turuncu.png') },
  yesil: { empty: require('../../assets/room/koltuk-bos-yesil.png'), locked: require('../../assets/room/koltuk-kilitli-yesil.png') },
  gumus: { empty: require('../../assets/room/koltuk-bos-gumus.png'), locked: require('../../assets/room/koltuk-kilitli-gumus.png') },
};
/** The host frame's square picture is this many times the avatar: its ring sits on the photo's edge, the crown above. */
export const HOST_FRAME_SCALE = 1.64;

// Oda katkı sıralaması (docs/GORSEL_URETIM_LISTESI.md §22, components/room/contrib-board): a laurel around each of
// the first three photos and the three-step podium under them. Without a picture the board draws its metal ring and
// gradient steps.
export const CONTRIB_WREATH_ART: Partial<Record<1 | 2 | 3, number>> = {
  1: require('../../assets/room/katki-celenk-altin.png'),
  2: require('../../assets/room/katki-celenk-gumus.png'),
  3: require('../../assets/room/katki-celenk-bronz.png'),
};
/** The laurel's square picture is this many times the photo (its leaves just overlap the photo's edge). */
export const CONTRIB_WREATH_SCALE = 1.5;
export const CONTRIB_PODIUM_ART: number | undefined = require('../../assets/room/katki-kursu.png');
/** The podium picture's width / height, and where each step's top surface is, from the picture's top (0–1). */
export const CONTRIB_PODIUM = { aspect: 1080 / 362, top: { 1: 0.14, 2: 0.34, 3: 0.5 } } as const;

/** A picture followed by text on one line, e.g. a level badge and "Lv.5". */
export function ArtText({ art, size, children, style }: { art: number; size: number; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
      <Image source={art} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      <Text style={[style, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}
