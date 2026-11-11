// The room's stage: a sea photo chosen by the room theme (the same set as the screens' backdrops) under a
// navy veil tinted in the theme's colors, two soft spotlights falling on the host seat, a glow behind the
// mics, a few out-of-focus lights, and a darker floor so the chat stays readable. When the room art from
// docs/ODA_GORSEL_LISTESI.md arrives it replaces the photo here. Colors follow docs/TASARIM_YONU.md.
// Oda Süslemesi (components/room/decor) puts a background of the room's own over the theme's photo: a free or
// paid one from the app's pictures (ROOM_BG_ART), or the owner's uploaded picture. The spotlights and the theme's
// tint make way for it; the floor stays dark so the chat stays readable.
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { RoomBackground, RoomTheme } from '@/data/catalog';
import { colors, semantic } from '@/theme';

const GLOW = require('../../../assets/fx/glow.png');

type Look = { photo: ImageSourcePropType; top: string; mid: string; light: string; second: string };
const LOOKS: Record<RoomTheme, Look> = {
  chat: { photo: require('../../../assets/bg/sahne-mesajlar.jpg'), top: '#0C3445', mid: '#0A1C2E', light: semantic.action, second: semantic.social },
  music: { photo: require('../../../assets/bg/sahne-oyun-merkezi.jpg'), top: '#0B2D52', mid: '#0A1830', light: semantic.social, second: semantic.action },
  game: { photo: require('../../../assets/bg/sahne-kesfet.jpg'), top: '#073A3E', mid: '#081C26', light: semantic.action, second: semantic.money },
  party: { photo: require('../../../assets/bg/sahne-vip.jpg'), top: '#3A1F2A', mid: '#160F1E', light: semantic.social, second: semantic.money },
  pk: { photo: require('../../../assets/bg/sahne-aile.jpg'), top: '#2E1A26', mid: '#0E1424', light: semantic.social, second: semantic.action },
  friends: { photo: require('../../../assets/bg/sahne-giris.jpg'), top: '#33202A', mid: '#111526', light: semantic.social, second: semantic.action },
};

// Out-of-focus lights: fixed spots (left %, top %, size, which color), so the stage never jumps.
const BOKEH: [number, number, number, 0 | 1][] = [
  [8, 14, 46, 0],
  [82, 9, 30, 1],
  [70, 30, 18, 0],
  [18, 38, 22, 1],
  [92, 46, 40, 0],
  [4, 58, 28, 0],
  [60, 52, 14, 1],
];

/**
 * The pictures of the room backgrounds the app carries, by id: the free ones (data/catalog ROOM_BACKGROUNDS, the
 * sea scenes no room theme uses) and, once their art is delivered, the paid ones (ROOM_BG_PAID; none yet, see
 * docs/GORSEL_URETIM_LISTESI.md §14). A paid background with no picture here can't be bought in this app.
 */
export const ROOM_BG_ART: Record<string, ImageSourcePropType> = {
  bg1: require('../../../assets/bg/sahne-ana-sayfa.jpg'),
  bg2: require('../../../assets/bg/sahne-seviye.jpg'),
  bg3: require('../../../assets/bg/sahne-cuzdan.jpg'),
  bg4: require('../../../assets/bg/sahne-magaza.jpg'),
};
/** The theme's own stage photo (Oda Süslemesi's "Tema görünümü" tile). */
export const themeStagePhoto = (theme: RoomTheme): ImageSourcePropType => (LOOKS[theme] ?? LOOKS.chat).photo;

/**
 * The picture a room background draws, or null for the theme's stage: the owner's picture by its address, a paid
 * or free one from the app's own. A paid one this app has no picture for falls back to the room's free one.
 */
export function roomBgSource(bg: RoomBackground | null | undefined, freeId?: string | null): ImageSourcePropType | null {
  if (!bg) return null;
  if (bg.kind === 'custom') return bg.url ? { uri: bg.url } : null;
  return (bg.id ? ROOM_BG_ART[bg.id] : undefined) ?? (bg.kind === 'paid' && freeId ? ROOM_BG_ART[freeId] : undefined) ?? null;
}

export function StageBackdrop({ theme, background, freeId }: { theme: RoomTheme; background?: RoomBackground | null; freeId?: string | null }) {
  const look = LOOKS[theme] ?? LOOKS.chat;
  const picture = roomBgSource(background, freeId);
  // A picture that can't be loaded (the address that failed): the theme's stage shows instead.
  const [failed, setFailed] = useState<string | null>(null);
  const uri = picture && typeof picture === 'object' && 'uri' in picture ? (picture.uri ?? null) : null;
  if (picture && !(uri && uri === failed)) {
    return (
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden', backgroundColor: colors.bg }]}>
        <Image source={look.photo} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
        <Image source={picture} resizeMode="cover" onError={() => setFailed(uri)} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
        {/* A navy veil, lighter than the theme's so the picture shows behind the mics (names and seats stay readable
            on a bright picture), solid toward the chat. */}
        <LinearGradient colors={['rgba(8,15,30,0.40)', 'rgba(8,15,30,0.50)', 'rgba(8,15,30,0.88)', colors.bg]} locations={[0, 0.4, 0.68, 0.9]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(8,15,30,0.85)', colors.bg]} locations={[0, 0.6, 1]} style={s.floor} />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden', backgroundColor: colors.bg }]}>
      <Image source={look.photo} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
      {/* Theme tint over the photo: light at the top so the scene shows behind the mics, solid toward the chat. */}
      <LinearGradient colors={[`${look.top}99`, `${look.mid}8C`, `${look.mid}E6`, colors.bg]} locations={[0, 0.4, 0.68, 0.9]} style={StyleSheet.absoluteFill} />
      {/* Glow behind the mic grid. */}
      <Image source={GLOW} style={[s.glow, { top: -120, opacity: 0.35, tintColor: look.light }]} />
      <Image source={GLOW} style={[s.glowSmall, { top: 180, right: -180, opacity: 0.14, tintColor: look.second }]} />
      {/* Two spotlights from above, crossing on the host seat. */}
      <View style={[s.beamWrap, { transform: [{ rotate: '-14deg' }], left: '18%' }]}>
        <LinearGradient colors={[`${look.light}33`, `${look.light}0D`, 'transparent']} style={s.beam} />
      </View>
      <View style={[s.beamWrap, { transform: [{ rotate: '14deg' }], right: '18%' }]}>
        <LinearGradient colors={[`${look.second}26`, `${look.second}0A`, 'transparent']} style={s.beam} />
      </View>
      {BOKEH.map(([left, top, size, c], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${left}%`,
            top: `${top}%`,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c ? look.second : look.light,
            opacity: 0.07 + (i % 3) * 0.03,
          }}
        />
      ))}
      {/* Darker floor under the chat. */}
      <LinearGradient colors={['transparent', 'rgba(8,15,30,0.85)', colors.bg]} locations={[0, 0.6, 1]} style={s.floor} />
    </View>
  );
}

const s = StyleSheet.create({
  glow: { position: 'absolute', alignSelf: 'center', width: 620, height: 620 },
  glowSmall: { position: 'absolute', width: 420, height: 420 },
  beamWrap: { position: 'absolute', top: -40, width: 150, height: 520, alignItems: 'center' },
  beam: { width: 150, height: 520, borderBottomLeftRadius: 75, borderBottomRightRadius: 75 },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
});
