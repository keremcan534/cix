// A person's or a room's picture with a fallback for when there is none, or when it can't be loaded (no blank
// hole on the screen). Sample people and rooms carry no stock photos (no real people's faces): a face falls back
// to a tinted disc with a person glyph, a cover to one of the app's own sea scenes, picked steadily from `seed`
// so the same room keeps the same picture.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, View, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';

import { SCENES } from '@/components/fx/scenes';
import { failedTry, freshTry, retryAfter, showsImage, type ImageTry } from '@/lib/image-retry';
import { useSettings } from '@/store';
import { useTheme } from '@/theme';

/**
 * A picture from the network that fades in once it is there instead of popping in (a fifth of a second). It
 * starts when the load ends either way, so a picture never stays hidden; "Animasyonları azalt" shows it at once.
 */
export function FadeImage({ style, onLoadEnd, ...rest }: Omit<ImageProps, 'style'> & { style?: StyleProp<ImageStyle> }) {
  const { reduceMotion } = useSettings();
  const [o] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  return (
    <Animated.Image
      {...rest}
      style={[style, { opacity: o }]}
      onLoadEnd={() => {
        Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
        onLoadEnd?.();
      }}
    />
  );
}

/**
 * A network picture that failed is tried again (lib/image-retry: after 3 s, then 20 s) before its fallback stays; a
 * new address starts over. `show`: draw the picture now (else the fallback); `key` mounts it again for a retry.
 */
export function useImageRetry(uri: string | undefined) {
  const [t, setT] = useState<ImageTry>(() => freshTry(uri));
  const cur = t.uri === uri ? t : freshTry(uri);
  useEffect(() => {
    if (!cur.waiting) return;
    const ms = retryAfter(cur.fails);
    if (ms === null) return;
    const fails = cur.fails;
    const timer = setTimeout(() => setT((p) => (p.uri === uri && p.fails === fails ? { ...p, waiting: false } : p)), ms);
    return () => clearTimeout(timer);
  }, [uri, cur.waiting, cur.fails]);
  // The key changes only for a retry: a new address keeps the picture mounted, as before.
  return { show: showsImage(t, uri), key: `try-${cur.fails}`, onError: () => setT((p) => failedTry(p, uri)) };
}

const COVERS = Object.values(SCENES).map((s) => s.photo);
const FILL = { width: '100%', height: '100%' } as const;

const pick = (seed = '') => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
};

type Props = Omit<ImageProps, 'source' | 'style'> & { uri?: string; kind: 'face' | 'cover'; seed?: string; style?: StyleProp<ImageStyle> };

export function Photo({ uri, kind, seed, style, onError, ...rest }: Props) {
  const { colors, semantic } = useTheme();
  // An address that failed to load shows the fallback while it waits for its next try, and for good after the last.
  const img = useImageRetry(uri);
  if (uri && img.show) {
    return (
      <FadeImage
        key={img.key}
        source={{ uri }}
        style={style}
        {...rest}
        onError={(e) => {
          img.onError();
          onError?.(e);
        }}
      />
    );
  }
  // A bundled picture brings its own size (a whole screen wide): it fills the box it is given instead, or a box sized
  // by flex alone (the mini room card's cover) would spill out of its frame.
  if (kind === 'cover') return <Image source={pick(seed)} style={[FILL, style]} resizeMode="cover" {...rest} />;
  const flat = StyleSheet.flatten(style) ?? {};
  const side = typeof flat.width === 'number' ? flat.width : typeof flat.height === 'number' ? flat.height : 40;
  return (
    <View style={[style as object, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, overflow: 'hidden' }]}>
      <Ionicons name="person" size={Math.max(14, Math.round(side * 0.5))} color={semantic.actionText} />
    </View>
  );
}
