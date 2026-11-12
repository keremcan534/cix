// 1v1 in a chat with a real person (lib/live/one-on-one): what the two of them are to each other on the server
// (the message price, the heart level, which calls are open), the heart bar under the chat's header (drawn in the
// heart's look, components/heart-level), the call buttons in the header, and a gift sent from the chat. The server
// decides and charges; this only shows it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HeartGlyph, HeartLink } from '@/components/heart-level';
import { ProfileGiftSheet } from '@/components/profile-gift-sheet';
import { Text } from '@/components/text';
import { intimacyOf } from '@/data/messages-ui';
import { GIFTS, type Gift, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { heartShare, heartTier, heartTitle, heartView, lvAt, nextLookText, type HeartView } from '@/lib/heart-tiers';
import { liveGift, liveMode, message, toServer } from '@/lib/live';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import { loadPair, MODE_NAME, type CallGate, type CallMode, type Pair } from '@/lib/live/one-on-one';
import { useApp } from '@/store';
import { makeStyles, radius, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** The pair with `peer` on the server, while `on` (a real person in a live build). `reload` after money moved. */
export function usePair(peer: string, on: boolean) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = on ? toServer(peer) : null;
    if (!id) return;
    let alive = true;
    loadPair(id)
      .then((p) => alive && setPair(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [peer, on, n]);
  return { pair: on ? pair : null, reload: () => setN((x) => x + 1) };
}

/** A paid pair (a streamer and someone who isn't): the heart level matters, it opens the calls. */
export const paidPair = (p: Pair | null): p is Pair => !!p && p.streamer !== p.meStreamer;

/** The heart between me and `userId`: the server's (the pair, null until read) in a live build, the demo's sample one otherwise. */
export function heartOf(userId: string, pair: Pair | null): HeartView | null {
  if (liveMode()) return pair?.heart ?? null;
  return userId === 'me' ? null : heartView(intimacyOf(userId));
}

/** The next thing the heart opens, in a few words; null once everything is open. */
export function nextUnlock(p: Pair): string | null {
  const { level, voiceAt, videoAt, photoAt } = p.heart;
  const next = [
    { at: voiceAt, what: 'Sesli arama' },
    ...(photoAt === undefined ? [] : [{ at: photoAt, what: 'Mesajda fotoğraf' }]),
    { at: videoAt, what: 'Görüntülü arama' },
  ]
    .filter((x) => level < x.at)
    .sort((a, b) => a.at - b.at)[0];
  return next ? `${next.what} ${lvAt(next.at)} açılır` : null;
}

/**
 * Under the chat's header: the heart between the two of us in its look (from the pulse look on, our two photos with
 * heartbeats travelling between them), its level, and what it opens next (a paid pair) or what its next look brings.
 */
export function HeartBar({ heart, pair, them }: { heart: HeartView; pair: Pair | null; them: User }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { me } = useApp();
  const { points, level, next } = heart;
  const tier = heartTier(level);
  const paid = paidPair(pair);
  const hint = (paid && nextUnlock(pair)) || nextLookText(level) || 'Kalbiniz en parlak hâlinde';
  // Paid messages grow it too where messages are paid (and in the demo, where they cost coins).
  const grows = paid || !liveMode() ? 'Hediye ve sohbet kalbi büyütür' : 'Hediyeler kalbi büyütür';
  const linked = tier.line === 'one' || tier.line === 'both';
  return (
    <View style={[styles.heart, tier.rim && { borderColor: `${tier.rim}99` }]} accessible accessibilityLabel={`${heartTitle(level)}. ${hint}`}>
      {linked ? (
        <View style={styles.link}>
          <HeartLink level={level} me={{ uri: me.avatar, name: me.name }} them={{ uri: them.avatar, name: them.name }} size="sm" />
        </View>
      ) : (
        <HeartGlyph level={level} size={22} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.heartRow}>
          <Text style={styles.heartLevel} numberOfLines={1}>
            {heartTitle(level)}
          </Text>
          <Text style={styles.heartPoints}>{next === null ? fmt(points) : `${fmt(points)} / ${fmt(next)}`}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(heartShare(heart) * 100)}%`, backgroundColor: tier.id === 'none' ? colors.pink : tier.tint }]} />
        </View>
        <Text style={styles.heartHint} numberOfLines={1}>
          {hint} · {grows}
        </Text>
      </View>
    </View>
  );
}

/** Whether I'd pay this call (an older server says it for the pair only). */
const iPayFor = (pair: Pair, gate: CallGate) => (gate.iPay ?? pair.iPay) && gate.price > 0;
/** When a used free call comes back: "bugün 14:20" or "yarın 09:05". */
function backAt(iso: string) {
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'bugün' : 'yarın';
  return `${day} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Calls them: a locked call says why, a paid one shows its price first (and, past my free calls, when they're back). */
export function callPair(userId: string, pair: Pair, mode: CallMode) {
  const gate = pair.calls[mode];
  if (!gate.open) return showAlert(`${MODE_NAME[mode]} arama kapalı`, gate.why ?? 'Bu kişiyi şu an arayamazsın.');
  const go = () => router.push({ pathname: '/arama/[id]', params: { id: userId, mode: mode === 'voice' ? 'sesli' : 'goruntulu' } });
  if (!iPayFor(pair, gate)) return go();
  const used = gate.free ? `Bugünkü ${gate.free.total} ücretsiz araman bitti${gate.free.nextAt ? `; ilki ${backAt(gate.free.nextAt)} yenilenir` : ''}. ` : '';
  showAlert(`${MODE_NAME[mode]} arama`, `${used}Dakikası ${fmt(gate.price)} jeton. Her dakikanın başında ödenir; jetonun bitince görüşme biter.`, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Ara', onPress: go },
  ]);
}

/** A call's line in a menu: its price or my free calls left, or that it is closed. */
export const callLabel = (pair: Pair, mode: CallMode) => {
  const gate = pair.calls[mode];
  if (!gate.open) return `${MODE_NAME[mode]} arama · kapalı`;
  if (gate.free && gate.price === 0) return `${MODE_NAME[mode]} arama · ücretsiz (${gate.free.left}/${gate.free.total} hak, ${gate.free.seconds} sn)`;
  return iPayFor(pair, gate) ? `${MODE_NAME[mode]} arama · ${fmt(gate.price)} jeton/dk` : `${MODE_NAME[mode]} arama · ücretsiz`;
};

/** The voice and video buttons in the chat's header. */
export function CallButtons({ userId, pair }: { userId: string; pair: Pair }) {
  const { colors } = useTheme();
  const call = (mode: CallMode) => callPair(userId, pair, mode);
  return (
    <>
      <Pressable onPress={() => call('voice')} hitSlop={8} style={{ opacity: pair.calls.voice.open ? 1 : 0.4 }} accessibilityRole="button" accessibilityLabel="Sesli ara">
        <Ionicons name="call-outline" size={22} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => call('video')} hitSlop={8} style={{ marginLeft: 14, opacity: pair.calls.video.open ? 1 : 0.4 }} accessibilityRole="button" accessibilityLabel="Görüntülü ara">
        <Ionicons name="videocam-outline" size={24} color={colors.text} />
      </Pressable>
    </>
  );
}

/**
 * A gift from the chat (no confirmation, as every gift). Live mode: the server takes the coins at its price, pays
 * them and puts a line in the chat for both (POST /api/gifts/send, place chat); the prototype spends on this phone.
 */
export function useChatGift(user: User, onSent: () => void) {
  const { coins, svipLevel, spendCoins, spendBlock, recordGift, bump, sendMessage } = useApp();
  const gifts = visibleGifts(GIFTS, useLiveCatalog());
  const [open, setOpen] = useState(false);
  const toWallet = { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') };
  const send = async (g: Gift): Promise<boolean> => {
    if ((g.minSvip ?? 0) > svipLevel) {
      showAlert('Üyelere özel hediye', `${g.name}, VIP ${g.minSvip} ve üstü için. Senin seviyen: VIP ${svipLevel}.`);
      return false;
    }
    if (liveMode()) {
      const limited = spendBlock(g.price);
      if (limited && limited !== 'Yetersiz bakiye.') {
        showAlert('Hediye gönderilemedi', limited);
        return false;
      }
      try {
        await liveGift(user.id, g.id, 1, undefined, 'chat');
      } catch (e) {
        showAlert('Hediye gönderilemedi', message(e), [{ text: 'Tamam', style: 'cancel' }, toWallet]);
        return false;
      }
    } else {
      if (!spendCoins(g.price, `Hediye: ${g.name} → ${user.name}`)) {
        showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [{ text: 'Vazgeç', style: 'cancel' }, toWallet]);
        return false;
      }
      sendMessage(user.id, `Hediye gönderdi: ${g.name}`, true);
    }
    recordGift(user.id, g.id, 1);
    bump('giftsSent', 1);
    onSent();
    return true;
  };
  const sheet = open ? <ProfileGiftSheet visible name={user.name} gifts={gifts} coins={coins} svipLevel={svipLevel} onClose={() => setOpen(false)} onSend={send} /> : null;
  return { open: () => setOpen(true), sheet };
}

const useStyles = makeStyles(({ colors, dark }) => ({
  heart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    backgroundColor: dark ? 'rgba(255,101,118,0.1)' : 'rgba(200,48,74,0.06)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,101,118,0.28)' : 'rgba(200,48,74,0.18)',
  },
  link: { width: 96 },
  heartRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  heartLevel: { color: colors.pink, fontWeight: '800', fontSize: 13, flexShrink: 1 },
  heartPoints: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  track: { height: 5, borderRadius: 3, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  heartHint: { color: colors.textDim, fontSize: 11 },
}));
