// Profil izleri on a photo (lib/profile-marks, lib/mark-store), Muzip hediyeler: the mark a gift left, drawn over the
// photo and never into it. Its picture (lib/profile-marks markLayerOf): the overlay staff uploaded for its kind (the
// catalog's marks=2), else the app's own (assets/marks: Kaka İzi, Kırık Cam's placeholder, drawn by scripts/mark-art.py
// and scripts/kirik-cam-art.py), else only the gift's small picture on the photo. Kaka İzi keeps that badge, as
// before; a drawn overlay is shown whole. When it comes off, Kaka İzi washes away with the water's splash, every other
// kind fades with a sparkle. Drawn inside the photo's circle, so a frame (components/fx/frame-art, ui FramedAvatar) lies
// over it: photo → mark → frame → name, mic and badges. A mark landing splats on; "hareketi azalt" shows it still.
// MarkLayer fills its parent; `size` is the photo's.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { markKinds, useLiveCatalog } from '@/lib/live/catalog-live';
import { cleanGiftFor, markKeyOf } from '@/lib/live/marks-live';
import { useMarkOf } from '@/lib/mark-store';
import { markLayerOf, ownMarkNote } from '@/lib/profile-marks';
import { useSettings } from '@/store';

/** The app's own picture of each kind it knows (lib/profile-marks COMPILED_MARKS); the panel's other kinds: theirs or the badge. */
const DIRT: Record<string, ImageSourcePropType> = {
  kaka: require('../../assets/marks/kaka-iz.png'),
  'kirik-cam': require('../../assets/marks/kirik-cam.png'),
};
const SPLASH = require('../../assets/marks/su-sicrama.png');
/** Where the sparkles of a clean go (shares of the photo), and how big. */
const SPARKS = [
  { x: 0.22, y: 0.28, s: 0.26, d: 0 },
  { x: 0.7, y: 0.2, s: 0.2, d: 0.15 },
  { x: 0.62, y: 0.68, s: 0.3, d: 0.3 },
];

/**
 * The mark on `uid`'s photo (a local id: 'me', a server id, a sample id), over a photo of `size` px. Nothing when there
 * is none. `badge`: the gift's little picture on the photo where its kind has one (off where the photo is too small).
 */
export function MarkLayer({ uid, size, badge = true }: { uid: string | null | undefined; size: number; badge?: boolean }) {
  const { mark, fresh } = useMarkOf(markKeyOf(uid));
  const { reduceMotion } = useSettings();
  useLiveCatalog();
  const [land] = useState(() => new Animated.Value(1));
  const [wash] = useState(() => new Animated.Value(1));
  // A picture address that didn't load here: the next one down (the app's own, else the badge).
  const [failed, setFailed] = useState<string | null>(null);
  // What just happened (lib/mark-store keeps it a few seconds): a mark landing, or coming off.
  const landing = !reduceMotion && fresh?.type === 'land' && !!mark;
  const washing = !reduceMotion && fresh?.type === 'wash' && !mark ? fresh.mark : null;
  const at = fresh?.at ?? 0;
  useEffect(() => {
    if (!landing) return;
    land.setValue(0);
    Animated.timing(land, { toValue: 1, duration: 460, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }).start();
  }, [landing, at, land]);
  useEffect(() => {
    if (!washing) return;
    wash.setValue(0);
    Animated.timing(wash, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [washing, at, wash]);
  const shown = mark ?? washing;
  if (!shown) return null;
  const layer = markLayerOf(shown.kind, markKinds(), failed);
  const dirt = layer.art ? { uri: layer.art.uri } : layer.compiled ? DIRT[layer.compiled] : undefined;
  // The badge sits low on the photo, right of the middle: clear of the corners where the mic, camera and heart badges go.
  const b = Math.max(14, Math.round(size * 0.32));
  const water = layer.wash === 'water';
  const look = mark
    ? landing
      ? { opacity: land.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: land.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }] }
      : null
    : water
      ? { opacity: wash.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.75, 0] }), transform: [{ translateY: wash.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.14] }) }] }
      : { opacity: wash.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 0] }), transform: [{ scale: wash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.clip]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, look]}>
        {dirt && (
          <Image
            source={dirt}
            style={s.fill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onError={layer.art ? () => setFailed(layer.art?.uri ?? null) : undefined}
          />
        )}
        {badge && layer.badge && (
          <View style={[s.badge, { width: b, height: b, left: `${60 - (b / size) * 50}%`, top: `${63 - (b / size) * 50}%` }]}>
            <GiftArt giftId={shown.gift} emoji={shown.emoji} size={b} />
          </View>
        )}
      </Animated.View>
      {washing && water && (
        <Animated.Image
          source={SPLASH}
          resizeMode="contain"
          style={[
            s.fill,
            {
              opacity: wash.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 0.85, 0] }),
              transform: [{ scale: wash.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.2] }) }],
            },
          ]}
        />
      )}
      {washing &&
        !water &&
        SPARKS.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              s.spark,
              {
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                opacity: wash.interpolate({ inputRange: [0, p.d + 0.1, p.d + 0.45, 1], outputRange: [0, 1, 0.9, 0], extrapolate: 'clamp' }),
                transform: [{ scale: wash.interpolate({ inputRange: [0, p.d + 0.3, 1], outputRange: [0.3, 1.15, 0.8], extrapolate: 'clamp' }) }],
              },
            ]}
          >
            <Ionicons name="sparkles" size={Math.max(8, Math.round(size * p.s))} color="#FFF4C2" />
          </Animated.View>
        ))}
    </View>
  );
}

/**
 * My own profile's line while a mark shows on my photo: who left it, how long it stays and what cleans it. There is no
 * free removal (the owners' decision): Gizlilik only chooses who may leave a new one.
 */
export function OwnMarkNote({ style, textColor }: { style?: object; textColor?: string }) {
  const { mark } = useMarkOf(markKeyOf('me'));
  if (!mark) return null;
  const clean = cleanGiftFor(mark.kind);
  return (
    <View style={[s.note, style]} accessibilityRole="text">
      <GiftArt giftId={mark.gift} emoji={mark.emoji} size={22} />
      <Text style={[s.noteText, textColor ? { color: textColor } : null]} numberOfLines={4}>
        {ownMarkNote(mark, clean?.emoji ?? null)} Kimlerin yeni iz bırakabileceğini Ayarlar › Gizlilik’ten seçebilirsin.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  clip: { borderRadius: 9999, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(146, 84, 38, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(146, 84, 38, 0.35)',
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
});
