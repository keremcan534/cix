// 3D action icons (assets/icons/ui, 192 px PNG, cut from the delivered sheet by scripts/sheet-cut.py). Screens keep
// naming Ionicons glyphs; GlyphIcon draws the 3D picture for a glyph that has one and the glyph itself otherwise, so a
// menu that mixes both still lines up.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';

type Glyph = keyof typeof Ionicons.glyphMap;

// The mic pair is the owners' neon set (24 Nov 2026): a whole round button (glass, pink neon ring and glow), the ring
// MIC_RING of the picture's width; the room's mic button draws it as the button itself (room/parts MicBtn).
export const MIC_RING = 0.87;
const SRC = {
  micOn: require('../../assets/icons/ui/mic-acik.png'),
  micOff: require('../../assets/icons/ui/mic-kapali.png'),
  hourglass: require('../../assets/icons/ui/kum-saati.png'),
  emoji: require('../../assets/icons/ui/emoji.png'),
  more: require('../../assets/icons/ui/menu.png'),
  profile: require('../../assets/icons/ui/profil.png'),
  lock: require('../../assets/icons/ui/kilit.png'),
  unlock: require('../../assets/icons/ui/kilit-acik.png'),
  exit: require('../../assets/icons/ui/cikis.png'),
  swap: require('../../assets/icons/ui/yer-degistir.png'),
  headphones: require('../../assets/icons/ui/kulaklik.png'),
  ban: require('../../assets/icons/ui/yasak.png'),
  report: require('../../assets/icons/ui/sikayet.png'),
  camera: require('../../assets/icons/ui/kamera.png'),
  cameraOff: require('../../assets/icons/ui/kamera-kapali.png'),
  settings: require('../../assets/icons/ui/ayarlar.png'),
} as const;
export type UiIconName = keyof typeof SRC;

/** Glyphs whose meaning the 3D set covers one to one. Anything else stays an Ionicons glyph. */
const FROM_GLYPH: Partial<Record<Glyph, UiIconName>> = {
  mic: 'micOn',
  'mic-outline': 'micOn',
  'mic-off': 'micOff',
  'mic-off-outline': 'micOff',
  hourglass: 'hourglass',
  'hourglass-outline': 'hourglass',
  'timer-outline': 'hourglass',
  'happy-outline': 'emoji',
  happy: 'emoji',
  'ellipsis-horizontal': 'more',
  'person-circle': 'profile',
  'person-circle-outline': 'profile',
  'lock-closed': 'lock',
  'lock-closed-outline': 'lock',
  'lock-open': 'unlock',
  'lock-open-outline': 'unlock',
  'exit-outline': 'exit',
  'log-out-outline': 'exit',
  'swap-horizontal': 'swap',
  'swap-horizontal-outline': 'swap',
  ban: 'ban',
  'ban-outline': 'ban',
  flag: 'report',
  'flag-outline': 'report',
  videocam: 'camera',
  'videocam-outline': 'camera',
  'videocam-off': 'cameraOff',
  'videocam-off-outline': 'cameraOff',
  settings: 'settings',
  'settings-outline': 'settings',
};

export const uiIconFor = (glyph?: Glyph): UiIconName | undefined => (glyph ? FROM_GLYPH[glyph] : undefined);

export function UiIcon({ name, size = 24, style }: { name: UiIconName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={SRC[name]} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/**
 * An Ionicons glyph, drawn as its 3D picture when the set has one. The picture is a little larger than the glyph
 * (`scale`) because a filled 3D shape reads smaller than an outline at the same box size; `color` only tints the glyph.
 * `plain` keeps the glyph (a place where the icon must stay one color, e.g. on a filled state button).
 */
export function GlyphIcon({ name, size = 20, color, scale = 1.3, plain }: { name: Glyph; size?: number; color?: string; scale?: number; plain?: boolean }) {
  const art = plain ? undefined : uiIconFor(name);
  const box = Math.round(size * scale);
  // Both take the picture's box, so labels beside a mix of pictures and glyphs stay in one column.
  return art ? (
    <UiIcon name={art} size={box} />
  ) : (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}
