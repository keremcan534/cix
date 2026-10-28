// Room visuals (docs/GORSEL_URETIM_LISTESI.md §5, 3D delivery, items 1–40): 192 px PNGs for room types,
// themes, level badges and the room's own tools. Emoji inside chat lines and system messages stay text.
// Not delivered or not approved yet (Ailem, speaker queue, room bot, hidden entry) keep their emoji; the
// camera button keeps its Ionicons on/off glyph.
import { Image, Text, View, type StyleProp, type TextStyle } from 'react-native';

import type { RoomTheme, RoomType } from '@/data/catalog';

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

/** A picture followed by text on one line, e.g. a level badge and "Lv.5". */
export function ArtText({ art, size, children, style }: { art: number; size: number; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
      <Image source={art} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      <Text style={[style, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}
