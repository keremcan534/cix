// A chat bubble the team added in Yönetim › Mağaza (data/catalog remote.bubble, lib/shop-live-core): its two colours left
// to right, or its picture stretched round the message with its corners kept (nineSlice). The picture is made at 3×, as
// a phone's screen: one of its pixels is a third of a point. Until it has loaded nothing is drawn behind the message
// (no box flashing before the picture); if it can't load, the colours are.
import { useMemo, useState, type ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { nineSlice, type BubbleLook } from '@/lib/shop-live-core';

export const BUBBLE_ART_SCALE = 1 / 3;

/** `style`: the room's bubble (its corners and padding, for the colours); a picture brings its own padding. */
export function ShopBubble({ look, style, children }: { look: BubbleLook; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  const art = look.art && failed !== look.art.url ? look.art : null;
  const slice = useMemo(() => (art ? nineSlice(art, BUBBLE_ART_SCALE) : null), [art]);
  if (!art || !slice)
    return (
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={style}>
        {children}
      </LinearGradient>
    );
  return (
    <View style={[style, slice.pad, slice.min, { borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0 }]}>
      {slice.pieces.map((p, i) => (
        <View key={i} pointerEvents="none" style={p.box}>
          <Image source={{ uri: art.url }} resizeMode="stretch" style={p.image} onError={() => setFailed(art.url)} />
        </View>
      ))}
      {children}
    </View>
  );
}
