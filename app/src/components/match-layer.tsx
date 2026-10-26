// Hemen Tanış on every screen: keeps the engine wired to the store, shows the "searching" pill, the
// incoming match card (accept / decline, also inside a room) and short result notices, and opens the
// call screen once the call is connected.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { VerifiedBadge } from '@/components/ui';
import { MATCH_ACCEPT_SECONDS, MATCH_GRACE_SECONDS } from '@/data/economy';
import { userById } from '@/data/mock';
import { useMedia } from '@/lib/media';
import { PHASE_LABEL, acceptMatch, cancelMatch, declineMatch, modeLabel, priceOf, resetMatch, setMatchDeps, startMatch, useMatch } from '@/lib/match';
import { similarity } from '@/lib/similarity';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const OWN_SCREENS = ['/eslesme', '/tanis'];

export function MatchLayer() {
  const { coins, spendCoins, addCoins, blocked, following, me } = useApp();
  // Engine reads the store through these; refreshed on every store change.
  useEffect(() => {
    setMatchDeps({ coins: () => coins, spend: spendCoins, refund: addCoins, blocked, following, myAge: me.age });
  });
  const m = useMatch();
  const path = usePathname();
  const onOwnScreen = OWN_SCREENS.includes(path);

  // Connected → open the call screen on top of whatever is open (a room stays underneath).
  const active = m.phase === 'active';
  useEffect(() => {
    if (active && path !== '/tanis') router.push('/tanis');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const incoming = ['found', 'awaiting_peer', 'connecting'].includes(m.phase) && path !== '/eslesme';
  return (
    <>
      {m.phase === 'searching' && !onOwnScreen && (
        <View style={s.pill} accessibilityLiveRegion="polite">
          <Ionicons name="search" size={16} color={semantic.action} />
          <Text style={s.pillText} numberOfLines={1}>
            {modeLabel(m.mode)} · eşleşme aranıyor…
          </Text>
          <Pressable onPress={cancelMatch} hitSlop={8} accessibilityLabel="Aramayı iptal et">
            <Text style={s.pillAction}>İptal</Text>
          </Pressable>
        </View>
      )}
      {['declined', 'error', 'busy', 'cancelled'].includes(m.phase) && !onOwnScreen && (
        <View style={s.pill} accessibilityLiveRegion="polite">
          <Ionicons name="information-circle" size={18} color={colors.gold} />
          <Text style={s.pillText} numberOfLines={2}>
            {m.message ?? PHASE_LABEL[m.phase]}
          </Text>
          {m.phase !== 'cancelled' && (
            <Pressable onPress={() => (resetMatch(), startMatch(m.mode, m.filter))} hitSlop={8}>
              <Text style={s.pillAction}>Tekrar</Text>
            </Pressable>
          )}
          <Pressable onPress={resetMatch} hitSlop={8} accessibilityLabel="Kapat">
            <Ionicons name="close" size={18} color={colors.textDim} />
          </Pressable>
        </View>
      )}
      <Modal visible={incoming} transparent animationType="fade" onRequestClose={declineMatch}>
        {incoming && <IncomingCard />}
      </Modal>
    </>
  );
}

/** The match card: who, what it costs, what happens to the room, accept / decline with a countdown. */
export function IncomingCard({ inline }: { inline?: boolean }) {
  const m = useMatch();
  const media = useMedia();
  const { me } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!m.peerId) return null;
  const peer = userById(m.peerId);
  const left = Math.max(0, Math.ceil(((m.acceptDeadline ?? now) - now) / 1000));
  const room = media.room;
  const roomNote = room
    ? [
        room.seated ? `"${room.title}" odasında mikrofon koltuğundan inersin` : `"${room.title}" odasında dinleyici olarak kalırsın`,
        room.camOn ? 'oda kameran kapanır' : null,
        'odadan çıkarılmazsın',
      ]
        .filter(Boolean)
        .join(', ')
    : null;
  const waiting = m.phase !== 'found';

  return (
    <View style={[s.backdrop, inline && s.inline]}>
      <View style={s.card}>
        <Text style={s.kicker}>{modeLabel(m.mode)} · {waiting ? PHASE_LABEL[m.phase] : 'Eşleşme bulundu!'}</Text>
        <Image source={{ uri: peer.avatar }} style={s.photo} />
        <View style={s.nameRow}>
          <Text style={s.name}>
            {peer.name}, {peer.age}
          </Text>
          {peer.verified && <VerifiedBadge size={18} />}
        </View>
        <Text style={s.dim}>
          {peer.city} · %{similarity(me, peer).score} benzer
        </Text>
        <Text style={s.price}>
          🪙 {priceOf(m.mode)}/dk · ücret yalnızca görüşme bağlandığında başlar, ilk {MATCH_GRACE_SECONDS} sn içinde kopan görüşme ücretsiz
        </Text>
        {roomNote && (
          <View style={s.roomNote}>
            <Ionicons name="radio" size={16} color={colors.gold} />
            <Text style={s.roomNoteText}>Kabul edersen: {roomNote}.</Text>
          </View>
        )}
        {waiting ? (
          <View style={s.actions}>
            <Text style={[s.dim, { flex: 1 }]}>{PHASE_LABEL[m.phase]}…</Text>
            <Pressable style={s.decline} onPress={cancelMatch}>
              <Text style={s.declineText}>İptal</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.actions}>
            <Pressable style={s.decline} onPress={declineMatch} accessibilityLabel="Eşleşmeyi reddet">
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={s.declineText}>Reddet</Text>
            </Pressable>
            <Pressable style={s.accept} onPress={acceptMatch} accessibilityLabel="Eşleşmeyi kabul et">
              <Ionicons name={m.mode === 'video' ? 'videocam' : 'call'} size={20} color={semantic.successInk} />
              <Text style={s.acceptText}>Kabul et · {left}</Text>
            </Pressable>
          </View>
        )}
        {!waiting && <Text style={[s.dim, { fontSize: 11, textAlign: 'center' }]}>{MATCH_ACCEPT_SECONDS} sn içinde yanıt vermezsen eşleşme kapanır.</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { position: 'absolute', left: 16, right: 16, bottom: 96, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, zIndex: 60 },
  pillText: { color: colors.text, fontWeight: '700', flex: 1, fontSize: 13 },
  pillAction: { color: semantic.action, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  inline: { flex: 0, backgroundColor: 'transparent', padding: 0 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  kicker: { color: semantic.action, fontWeight: '900', fontSize: 13 },
  photo: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: semantic.action },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900' },
  dim: { color: colors.textDim, fontSize: 13 },
  price: { color: colors.gold, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  roomNote: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(246,189,96,0.12)', borderRadius: 12, padding: 10, alignSelf: 'stretch' },
  roomNoteText: { color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 4 },
  decline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 13 },
  declineText: { color: colors.text, fontWeight: '800' },
  accept: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: semantic.success, borderRadius: 999, paddingVertical: 13 },
  acceptText: { color: semantic.successInk, fontWeight: '900' },
});
