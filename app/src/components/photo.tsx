// A person's or a room's picture with a fallback for when there is none. Sample people and rooms carry no
// stock photos (no real people's faces): a face falls back to a tinted disc with a person glyph, a cover to
// one of the app's own sea scenes, picked steadily from `seed` so the same room keeps the same picture.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, StyleSheet, View, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';

import { SCENES } from '@/components/fx/scenes';
import { colors, semantic } from '@/theme';

const COVERS = Object.values(SCENES).map((s) => s.photo);

const pick = (seed = '') => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
};

type Props = Omit<ImageProps, 'source' | 'style'> & { uri?: string; kind: 'face' | 'cover'; seed?: string; style?: StyleProp<ImageStyle> };

export function Photo({ uri, kind, seed, style, ...rest }: Props) {
  if (uri) return <Image source={{ uri }} style={style} {...rest} />;
  if (kind === 'cover') return <Image source={pick(seed)} style={style} resizeMode="cover" {...rest} />;
  const flat = StyleSheet.flatten(style) ?? {};
  const side = typeof flat.width === 'number' ? flat.width : typeof flat.height === 'number' ? flat.height : 40;
  return (
    <View style={[style as object, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, overflow: 'hidden' }]}>
      <Ionicons name="person" size={Math.max(14, Math.round(side * 0.5))} color={semantic.action} />
    </View>
  );
}
