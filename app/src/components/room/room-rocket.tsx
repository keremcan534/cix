// Oda roketi in a server room (lib/live/room-rocket, server/api/room-rocket.mjs, docs/ODA_ROKETI.md): the pill under
// the room's name (the level filling now and how full it is), its sheet (Lv.1–5, the rocket, how full, the prizes,
// the level's top three and what I put in, the last launch's winners, a button to the gift panel) and the show when a
// level launches and its prizes are paid. A level the team gave a video (Oda roketi in the panel: an SVGA, one a level)
// launches with it, once it is on the phone; otherwise the Roket gift's picture rises, in the level's own colour.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Halo } from '@/components/fx/float';
import { frameArtOf } from '@/components/fx/frame-art';
import { VideoFx, entryClipOf } from '@/components/fx/video-fx';
import { Icon3D } from '@/components/Icon3D';
import { roomStyles, useSheetBottom } from '@/components/room/parts';
import { storeArtOf } from '@/components/StoreArt';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { toLocal } from '@/lib/live';
import type { RocketNews } from '@/lib/live/room-bus';
import { pctText, prizeLabel, rocketPct, shownLevel, type RocketPrize, type RoomRocket } from '@/lib/room-rocket-core';
import { useSheetMax } from '@/lib/sheet-space';
import { SCRIM, colors } from '@/theme';

const ROCKET_ART = require('../../../assets/gifts/192/hediye-roket.png');
/** Each level's colour: pink, orange, blue, purple, gold. */
export const ROCKET_HUES = ['#FF5FA2', '#FF8A3D', '#3D9BFF', '#A855F7', '#F6BD60'] as const;
const hueOf = (level: number) => ROCKET_HUES[(level - 1) % ROCKET_HUES.length];
const KIND_EMOJI: Record<string, string> = { frame: '🖼️', entry: '✨', ride: '🏎️', bubble: '💬', wave: '🔊' };

/** The pill under the room's name: the level filling now and how full it is (✓ once all five launched today). */
export function RocketPill({ rocket, onPress }: { rocket: RoomRocket; onPress: () => void }) {
  const l = rocket.levels[shownLevel(rocket) - 1];
  const pct = rocketPct(l);
  const done = rocket.current === null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[s.pill, { borderColor: `${hueOf(l.level)}99` }]}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Oda roketi: bugünün beş seviyesi kalktı' : `Oda roketi, Lv.${l.level}, ${pctText(pct)} dolu`}>
      <Image source={ROCKET_ART} style={s.pillArt} />
      <Text style={s.pillText}>{done ? 'Lv.5 ✓' : `Lv.${l.level} ${pctText(pct)}`}</Text>
    </Pressable>
  );
}

function PrizeIcon({ p, size }: { p: RocketPrize; size: number }) {
  if (p.kind === 'coins') return <Icon3D name="coin" size={size} />;
  const frame = p.itemKind === 'frame' ? frameArtOf(p.sku) : undefined;
  const pic = frame?.src ?? storeArtOf(p.sku);
  if (pic) return <Image source={pic} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Text style={{ fontSize: size * 0.8 }}>{KIND_EMOJI[p.itemKind ?? ''] ?? '🎁'}</Text>;
}

/**
 * The rocket's sheet. Opens on the level filling now; each level's tab shows its own goal, prizes and top three.
 * `onGift`: the gift panel (the sheet closes).
 */
export function RocketSheet({ rocket, onClose, onGift }: { rocket: RoomRocket; onClose: () => void; onGift: () => void }) {
  const [level, setLevel] = useState(() => shownLevel(rocket));
  const paddingBottom = useSheetBottom();
  const maxHeight = useSheetMax(0.9);
  const l = rocket.levels[level - 1];
  const hue = hueOf(level);
  const pct = rocketPct(l);
  const last = rocket.last && rocket.last.level === level ? rocket.last : null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[roomStyles.sheet, { maxHeight, paddingBottom }]}>
        <View style={s.head}>
          <Image source={ROCKET_ART} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Oda Roketi</Text>
            <Text style={s.sub}>Odadaki hediyeler roketi doldurur, dolunca kalkar</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <View style={s.tabs}>
          {rocket.levels.map((x) => (
            <Pressable
              key={x.level}
              onPress={() => setLevel(x.level)}
              style={[s.tab, level === x.level && { backgroundColor: hueOf(x.level), borderColor: hueOf(x.level) }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: level === x.level }}
              accessibilityLabel={`Lv.${x.level}${x.launched ? ', kalktı' : ''}`}>
              <Text style={[s.tabText, level === x.level && s.tabTextOn]}>
                Lv.{x.level}
                {x.launched ? ' ✓' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={s.stage}>
            <View style={{ width: 120, height: 120 }}>
              <Halo size={120} hue={hue} strength={0.55} />
              <Image source={ROCKET_ART} style={{ width: 120, height: 120 }} accessibilityLabel={`Lv.${level} roketi`} />
            </View>
            {l.launched && <Text style={[s.launched, { color: hue }]}>Kalktı 🚀</Text>}
          </View>
          <View style={s.barTrack} accessibilityLabel={`${pctText(pct)} dolu`}>
            <View style={[s.barFill, { width: `${pct}%`, backgroundColor: hue }]} />
            <Text style={s.barText}>{pctText(pct)}</Text>
          </View>
          <Text style={s.goal}>
            {l.filled.toLocaleString('tr-TR')} / {l.goal.toLocaleString('tr-TR')} jeton
            {l.mine > 0 ? ` · Senin katkın: ${l.mine.toLocaleString('tr-TR')}` : ''}
          </Text>

          <Text style={s.section}>Ödüller</Text>
          {l.prizes.length ? (
            <View style={s.prizes}>
              {l.prizes.map((p, i) => (
                <View key={i} style={[s.prize, { borderColor: `${hue}66` }]} accessibilityLabel={`${prizeLabel(p)}, ${p.winners} kişiye`}>
                  <PrizeIcon p={p} size={34} />
                  <Text style={s.prizeName} numberOfLines={2}>
                    {p.kind === 'coins' ? `${p.amount.toLocaleString('tr-TR')} jeton` : p.name}
                  </Text>
                  <Text style={s.prizeMeta}>{p.kind === 'coins' ? `Jeton · ${p.winners} kişi` : `${p.days} gün · ${p.winners} kişi`}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.note}>Bu seviyenin ödülü yok.</Text>
          )}

          <Text style={s.section}>Katkı sıralaması</Text>
          {l.top.length ? (
            l.top.map((t) => (
              <View key={t.user.id} style={s.row}>
                <Text style={s.rank}>{['🥇', '🥈', '🥉'][t.rank - 1]}</Text>
                <Avatar uri={t.user.avatarUrl ?? undefined} name={t.user.name} size={30} />
                <Text style={s.rowName} numberOfLines={1}>
                  {toLocal(t.user.id) === 'me' ? `${t.user.name} (sen)` : t.user.name}
                </Text>
                <Icon3D name="coin" size={14} />
                <Text style={s.rowCoins}>{t.coins.toLocaleString('tr-TR')}</Text>
              </View>
            ))
          ) : (
            <Text style={s.note}>Bu seviyeye henüz hediye gelmedi.</Text>
          )}

          {last && last.winners.length > 0 && (
            <>
              <Text style={s.section}>Kazananlar</Text>
              {last.winners.map((w, i) => (
                <View key={`${w.user.id}-${i}`} style={s.row}>
                  <Avatar uri={w.user.avatarUrl ?? undefined} name={w.user.name} size={26} />
                  <Text style={s.rowName} numberOfLines={1}>
                    {toLocal(w.user.id) === 'me' ? `${w.user.name} (sen)` : w.user.name}
                  </Text>
                  <Text style={[s.rowPrize, !w.paid && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                    {prizeLabel(w.prize)}
                  </Text>
                </View>
              ))}
            </>
          )}

          <Text style={s.rules}>
            Odada gönderilen her hediye roketi jetonu kadar doldurur. Seviye dolunca roket kalkar ve ödüller o seviyeye hediye gönderenler arasında çekilir:
            kim ne kadar katkı verdiyse şansı o kadar; herkes en çok bir ödül alır. Kazanılan jeton normal jetondur. Roket her gün 00:00&apos;da
            Lv.1&apos;den başlar.
          </Text>
        </ScrollView>
        <Pressable onPress={onGift} style={[s.cta, { backgroundColor: hue }]} accessibilityRole="button">
          <Ionicons name="gift" size={18} color="#fff" />
          <Text style={s.ctaText}>Hediye göndererek roketi doldur</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * A level launching (the rocket rises across the screen) or its prizes paid (who won; mine first). `still`:
 * "hareketi azalt" (no rise, the line alone). Ends itself (onDone) after a few seconds.
 */
export function RocketShow({ news, still, muted, onDone }: { news: RocketNews; still?: boolean; muted?: boolean; onDone: () => void }) {
  const { height } = useWindowDimensions();
  const [rise] = useState(() => new Animated.Value(0));
  const launch = news.event === 'launch';
  const media = useMemo(() => (news.event === 'launch' && !still ? entryClipOf({ clip: `rocket-${news.level}` }) : null), [news, still]);
  useEffect(() => {
    // The video ends the show itself (VideoFx).
    if (media) return;
    const ms = launch ? 2600 : 3600;
    const t = setTimeout(onDone, ms);
    if (launch && !still) Animated.timing(rise, { toValue: 1, duration: 2200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    return () => clearTimeout(t);
    // One show per announcement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news]);
  const hue = hueOf(news.level);
  const mine = news.winners.find((w) => toLocal(w.user) === 'me' && w.paid);
  const others = news.winners.filter((w) => w.paid).length;
  const line = launch
    ? `Lv.${news.level} roketi kalktı! 🚀`
    : mine
      ? `Tebrikler! Lv.${news.level} roketinden ${mine.prize} kazandın`
      : others
        ? `Lv.${news.level} roketi: ${others} kişi ödül kazandı`
        : `Lv.${news.level} roketi kalktı`;
  if (media)
    return (
      <VideoFx media={media} muted={muted} onDone={onDone}>
        <View style={[s.banner, { borderColor: hue }]} accessibilityLiveRegion="polite" accessibilityLabel={line}>
          <Text style={s.bannerText}>{line}</Text>
        </View>
      </VideoFx>
    );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite" accessibilityLabel={line}>
      {launch && !still && (
        <Animated.View
          style={[
            s.flyer,
            {
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [height * 0.75, -height * 0.3] }) }],
              opacity: rise.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            },
          ]}>
          <View style={{ width: 140, height: 140 }}>
            <Halo size={140} hue={hue} strength={0.7} />
            <Image source={ROCKET_ART} style={{ width: 140, height: 140 }} />
          </View>
        </Animated.View>
      )}
      <View style={[s.banner, { borderColor: hue }]}>
        <Text style={s.bannerText}>{line}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, paddingLeft: 2, paddingRight: 7, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(8,15,30,0.55)' },
  pillArt: { width: 16, height: 16 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: SCRIM },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sub: { color: colors.textDim, fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  tabText: { color: colors.textDim, fontWeight: '800', fontSize: 12 },
  tabTextOn: { color: '#fff' },
  stage: { alignItems: 'center', paddingVertical: 8 },
  launched: { fontWeight: '800', fontSize: 13, marginTop: 4 },
  barTrack: { height: 22, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999 },
  barText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  goal: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 4 },
  section: { color: '#fff', fontWeight: '800', fontSize: 13, marginTop: 14, marginBottom: 6 },
  prizes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prize: { width: '31%', minWidth: 88, alignItems: 'center', gap: 2, padding: 8, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  prizeName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  prizeMeta: { color: colors.textDim, fontSize: 10, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rank: { fontSize: 18, width: 24, textAlign: 'center' },
  rowName: { color: '#fff', fontSize: 13, flex: 1 },
  rowCoins: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  rowPrize: { color: colors.textDim, fontSize: 12, maxWidth: '55%' },
  note: { color: colors.textDim, fontSize: 12 },
  rules: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 14 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999, marginTop: 8 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  flyer: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' },
  banner: { position: 'absolute', top: 150, alignSelf: 'center', maxWidth: '88%', backgroundColor: 'rgba(8,15,30,0.85)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  bannerText: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center' },
});
