// The room's stage, drawn in code instead of a blurred stock photo: a night gradient in the room theme's
// colors, two soft spotlights falling on the host seat, a glow behind the mics, a few out-of-focus lights,
// and a darker floor so the chat stays readable. Colors follow docs/TASARIM_YONU.md (no purple).
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

import type { RoomTheme } from '@/data/catalog';
import { colors, semantic } from '@/theme';

const GLOW = require('../../../assets/fx/glow.png');

type Look = { top: string; mid: string; light: string; second: string };
const LOOKS: Record<RoomTheme, Look> = {
  chat: { top: '#0C3445', mid: '#0A1C2E', light: semantic.action, second: semantic.social },
  music: { top: '#0B2D52', mid: '#0A1830', light: semantic.social, second: semantic.action },
  game: { top: '#073A3E', mid: '#081C26', light: semantic.action, second: semantic.money },
  party: { top: '#3A1F2A', mid: '#160F1E', light: semantic.social, second: semantic.money },
  pk: { top: '#2E1A26', mid: '#0E1424', light: semantic.social, second: semantic.action },
  friends: { top: '#33202A', mid: '#111526', light: semantic.social, second: semantic.action },
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

export function StageBackdrop({ theme }: { theme: RoomTheme }) {
  const look = LOOKS[theme] ?? LOOKS.chat;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden', backgroundColor: colors.bg }]}>
      <LinearGradient colors={[look.top, look.mid, colors.bg]} locations={[0, 0.45, 0.85]} style={StyleSheet.absoluteFill} />
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
