// Full-screen transparent videos for some gifts and entry effects (modules/similar-alpha-video): each MP4 is stacked,
// the picture in its top half and its alpha in the bottom half (scripts/alpha-stack.sh), cut out of the black-ground
// videos the designer delivered, with their sound. Never takes touches; it ends itself when the clip ends, or after a
// safety timeout when the player can't start. Phones with the module only: the web build and an older APK keep the
// code-drawn effects (giftVideoOf / entryVideoOf say null there).
import { useEffect, useRef, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import type { EntryFx } from '@/components/fx/entry';

import { AlphaVideoView, alphaVideoAvailable } from '../../../modules/similar-alpha-video';

/** Gifts that play a video instead of their show or animation, by gift id (data/mock GIFTS). */
const GIFT_VIDEOS: Record<string, number> = {
  g6: require('../../../assets/video/fx/roket.mp4'),
  h13: require('../../../assets/video/fx/tatli-ayicik.mp4'),
  h14: require('../../../assets/video/fx/kraliyet-taci.mp4'),
  c13: require('../../../assets/video/fx/pirlanta-yuzuk.mp4'),
};
/** Entry effects that play a video under the name banner, by effect (data/catalog COSMETICS `fx`). */
const ENTRY_VIDEOS: Partial<Record<EntryFx, number>> = {
  dragon: require('../../../assets/video/fx/ejderha.mp4'),
};

/** Every video, for the admins' preview (Ayarlar › Hediye ve giriş efektleri). */
export const EFFECT_VIDEOS: { key: string; label: string; kind: 'Hediye' | 'Giriş efekti'; media: number }[] = [
  { key: 'g6', label: 'Roket', kind: 'Hediye', media: GIFT_VIDEOS.g6 },
  { key: 'h13', label: 'Tatlı Ayıcık', kind: 'Hediye', media: GIFT_VIDEOS.h13 },
  { key: 'h14', label: 'Kraliyet Tacı', kind: 'Hediye', media: GIFT_VIDEOS.h14 },
  { key: 'c13', label: 'Pırlanta Yüzük', kind: 'Hediye', media: GIFT_VIDEOS.c13 },
  { key: 'dragon', label: 'Ejderha', kind: 'Giriş efekti', media: ENTRY_VIDEOS.dragon! },
];

export const giftVideoOf = (giftId?: string): number | null => (alphaVideoAvailable && giftId ? (GIFT_VIDEOS[giftId] ?? null) : null);
export const entryVideoOf = (fx?: EntryFx): number | null => (alphaVideoAvailable && fx ? (ENTRY_VIDEOS[fx] ?? null) : null);

/** The clips are 5 s; a player that never starts or ends still lets the next effect come. */
const SAFETY_MS = 8000;

export function VideoFx({ media, muted = true, onDone, children }: { media: number; muted?: boolean; onDone: () => void; children?: ReactNode }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => done.current(), SAFETY_MS);
    return () => clearTimeout(t);
  }, []);
  const source = Image.resolveAssetSource(media)?.uri ?? null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AlphaVideoView source={source} muted={muted} style={StyleSheet.absoluteFill} pointerEvents="none" onEnd={() => done.current()} onError={() => done.current()} />
      {children}
    </View>
  );
}

/** A gift's video with a line naming who sent it to whom. */
export function GiftVideoFx({ media, fromName, toText, giftName, count, muted, onDone }: { media: number; fromName: string; toText: string; giftName: string; count: number; muted?: boolean; onDone: () => void }) {
  return (
    <VideoFx media={media} muted={muted} onDone={onDone}>
      <View style={s.banner}>
        <Text style={s.bannerText} numberOfLines={1}>
          {fromName} → {toText} · {giftName}
          {count > 1 ? ` ×${count}` : ''}
        </Text>
      </View>
    </VideoFx>
  );
}

const s = StyleSheet.create({
  banner: { position: 'absolute', top: 120, alignSelf: 'center', maxWidth: '86%', backgroundColor: 'rgba(22,14,18,0.72)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bannerText: { color: '#FFE7A3', fontWeight: '800', fontSize: 14 },
});
