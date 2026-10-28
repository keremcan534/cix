// PK end screens. 1) Result: who won, final scores and the gap, the ranking or both teams with each
// member's contribution. 2) After the result is closed, "Taç Kazandıranlar": who crowned whom, from the
// server's crown relations (lib/pk computeCrowns). Both only render the server's final result.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Art } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { fmt, nameOf } from '@/components/room/pk';
import { userById } from '@/data/mock';
import { modeLabel, roomTitle, topSupporters, type PkCrown, type PkSession, type TeamId } from '@/lib/pk';
import { colors, semantic } from '@/theme';

/** Short entrance (≤ 260 ms): fade and a slight scale-up. */
function useEntrance(still: boolean) {
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.spring(v, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [v, still]);
  return { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] };
}

const CONFETTI = ['#F6BD60', '#13D9DF', '#FF6576', '#FFFFFF', '#E89B2C'];
/** A few confetti pieces fall once (~1.6 s). Off with reduce motion / effects off. */
function Confetti({ width }: { width: number }) {
  const [pieces] = useState(() => Array.from({ length: 16 }, (_, i) => ({ x: Math.random() * width, delay: Math.random() * 350, rot: Math.random() * 360, color: CONFETTI[i % CONFETTI.length], v: new Animated.Value(0) })));
  useEffect(() => {
    Animated.parallel(pieces.map((p) => Animated.timing(p.v, { toValue: 1, duration: 1300, delay: p.delay, useNativeDriver: true }))).start();
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -12,
            width: 7,
            height: 12,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [{ translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }, { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 300}deg`] }) }],
          }}
        />
      ))}
    </View>
  );
}

function Face({ uid, size, onProfile, ring, crown }: { uid: string; size: number; onProfile: (uid: string) => void; ring?: string; crown?: boolean }) {
  return (
    <Pressable onPress={() => onProfile(uid)} accessibilityRole="button" accessibilityLabel={`${nameOf(uid)} profilini aç`} hitSlop={4} style={{ alignItems: 'center' }}>
      {crown && <Icon3D name="crown" size={Math.round(size * 0.42)} style={{ marginBottom: -size * 0.12, zIndex: 1 }} />}
      <Image source={{ uri: userById(uid).avatar }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 3 : 0, borderColor: ring }} />
    </Pressable>
  );
}

// --- Result ---------------------------------------------------------------------------------------
export function PkResultScreen({
  pk,
  viewerRoomId,
  still,
  onContinue,
  onNew,
  onProfile,
}: {
  pk: PkSession;
  viewerRoomId: string;
  still: boolean;
  /** Closing the result (X or button) moves on to the crown screen. */
  onContinue: () => void;
  onNew?: () => void;
  onProfile: (uid: string) => void;
}) {
  const { width } = useWindowDimensions();
  const enter = useEntrance(still);
  const r = pk.result;
  const cancelled = pk.status === 'cancelled';
  const teamName = (id: TeamId) => {
    const t = pk.teams.find((x) => x.id === id)!;
    return pk.kind === 'cross' ? roomTitle(t.roomId) : t.name;
  };
  const ours = pk.kind === 'cross' ? pk.teams.find((t) => t.roomId === viewerRoomId)?.id : undefined;
  let title = 'Sonuç sunucudan bekleniyor…';
  if (cancelled) title = 'PK iptal edildi';
  else if (r && pk.mode === 'solo') title = r.winners.length === 1 ? `${nameOf(r.winners[0])} kazandı!` : r.winners.length > 1 ? 'Beraberlik' : 'Kazanan yok';
  else if (r) title = r.winner === 'tie' ? 'Beraberlik' : `${teamName(r.winner as TeamId)} kazandı!${ours && r.winner === ours ? ' Tebrikler!' : ''}`;
  const celebrate = !still && !cancelled && !!r && (pk.mode === 'solo' ? r.winners.length === 1 : r.winner !== 'tie');
  const heroColors: [string, string] = cancelled ? ['#2B3F63', '#16253C'] : r && pk.mode !== 'solo' && r.winner !== 'tie' && r.winner ? [pk.teams.find((t) => t.id === r.winner)!.color, '#16253C'] : ['#B7832E', '#16253C'];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onContinue}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, enter]}>
          <LinearGradient colors={heroColors} style={s.hero}>
            <Pressable onPress={onContinue} style={s.close} hitSlop={8} accessibilityLabel="Sonucu kapat">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={s.kicker}>
              {modeLabel(pk)} · {pk.durationMin} dk
            </Text>
            {!cancelled &&
              (r && (pk.mode === 'solo' ? r.winners.length === 1 : r.winner !== 'tie') ? (
                <Icon3D name="crown" size={58} />
              ) : (
                <Art name={r && (pk.mode === 'solo' ? r.winners.length > 1 : r.winner === 'tie') ? 'pk-beraberlik' : 'pk-pk-bitti'} size={58} />
              ))}
            <Text style={s.title} accessibilityRole="header">
              {title}
            </Text>
            {r && !cancelled && pk.mode === 'solo' && r.winners.length > 0 && (
              <View style={s.winnersRow}>
                {r.winners.slice(0, 4).map((w) => (
                  <View key={w} style={{ alignItems: 'center', gap: 4 }}>
                    <Face uid={w} size={r.winners.length === 1 ? 78 : 56} onProfile={onProfile} ring={colors.gold} crown={r.winners.length === 1} />
                    <Text style={s.winnerPts}>{fmt(pk.points[w] ?? 0)} puan</Text>
                  </View>
                ))}
              </View>
            )}
            {r && !cancelled && pk.mode === 'solo' && r.winners.length === 1 && r.diff > 0 && <Text style={s.heroSub}>İkinciyle fark {fmt(r.diff)} puan</Text>}
            {r && !cancelled && pk.mode !== 'solo' && (
              <View style={s.scoreRow}>
                {pk.teams.map((t) => (
                  <View key={t.id} style={[s.scoreBox, { borderColor: t.color, backgroundColor: `${t.color}33` }, r.winner === t.id && s.scoreWin]}>
                    {r.winner === t.id && <Text style={s.winTag}>👑 Kazanan</Text>}
                    <Text style={s.scoreName} numberOfLines={1}>
                      {teamName(t.id)}
                    </Text>
                    <Text style={s.scoreNum}>{fmt(t.id === 'red' ? r.red : r.blue)}</Text>
                  </View>
                ))}
              </View>
            )}
            {r && !cancelled && pk.mode !== 'solo' && <Text style={s.heroSub}>{r.winner === 'tie' ? 'Puanlar eşit · iki takım da berabere' : `Fark ${fmt(r.diff)} puan`}</Text>}
          </LinearGradient>

          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
            {cancelled && (
              <>
                <Text style={s.body}>{pk.cancelReason}</Text>
                <Text style={s.dim}>Kazanan açıklanmaz; PK puanları geçersizdir. Gönderilen hediyeler alıcılarına ulaştığı için iade edilmez.</Text>
              </>
            )}
            {r && !cancelled && pk.mode === 'solo' && (r.ranking.length === 0 ? <Text style={s.dim}>Katılımcı yok.</Text> : <Ranking pk={pk} onProfile={onProfile} />)}
            {r && !cancelled && pk.kind === 'room' && pk.mode === 'team' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pk.teams.map((t) => {
                  const members = r.ranking.filter((x) => x.teamId === t.id);
                  return (
                    <View key={t.id} style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Text style={[s.colHead, { color: t.color }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      {members.map((m, i) => (
                        <View key={m.userId} style={s.memberRow}>
                          <Face uid={m.userId} size={28} onProfile={onProfile} />
                          {i === 0 && m.points > 0 && <Art name="pk-pk-mvp-one-cikan" size={17} />}
                          <Text style={s.memberName} numberOfLines={1}>
                            {nameOf(m.userId)}
                          </Text>
                          <Text style={s.memberPts}>{fmt(m.points)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
            {r && !cancelled && pk.kind === 'cross' &&
              pk.teams.map((t) => (
                <Text key={t.id} style={s.dim}>
                  {teamName(t.id)} destekçileri: {topSupporters(pk, { teamId: t.id }, 3).map(([u, p]) => `${nameOf(u)} (${fmt(p)})`).join(', ') || '—'}
                </Text>
              ))}
            {r && !cancelled && <Text style={s.dim}>{r.validGifts} geçerli hediye · sonuç sunucuda kesinleşti · PK puanı jeton ve kazançtan ayrıdır; kaybeden taraftan jeton kesilmez.</Text>}
          </ScrollView>

          <View style={s.actions}>
            <Pressable style={s.primary} onPress={onContinue} accessibilityLabel={cancelled ? 'Odaya dön' : 'Taç kazandıranları gör'}>
              <Text style={s.primaryText}>{cancelled || !r ? 'Odaya dön' : 'Taç Kazandıranlar ›'}</Text>
            </Pressable>
            {onNew && (
              <Pressable style={s.secondary} onPress={onNew} accessibilityLabel="Yeni PK">
                <Text style={s.secondaryText}>Yeni PK</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
        {celebrate && <Confetti width={width} />}
      </View>
    </Modal>
  );
}

function Ranking({ pk, onProfile }: { pk: PkSession; onProfile: (uid: string) => void }) {
  const r = pk.result!;
  const top = Math.max(1, r.ranking[0]?.points ?? 1);
  // Equal points share a place (1, 2, 2, 4).
  const ranks = r.ranking.map((x) => r.ranking.findIndex((y) => y.points === x.points) + 1);
  return (
    <>
      {r.ranking.map((x, i) => {
        const rank = ranks[i];
        const win = r.winners.includes(x.userId);
        return (
          <View key={x.userId} style={[s.rankRow, win && s.rankWin]} accessibilityLabel={`${rank}. ${nameOf(x.userId)}, ${fmt(x.points)} puan`}>
            <Text style={[s.rankNo, win && { color: colors.gold }]}>{rank}</Text>
            <Face uid={x.userId} size={32} onProfile={onProfile} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.memberName} numberOfLines={1}>
                {nameOf(x.userId)}
              </Text>
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${Math.round((x.points / top) * 100)}%`, backgroundColor: win ? colors.gold : semantic.action }]} />
              </View>
            </View>
            <Text style={s.memberPts}>{fmt(x.points)}</Text>
          </View>
        );
      })}
    </>
  );
}

// --- Crowns ---------------------------------------------------------------------------------------
export function CrownScreen({ pk, still, onClose, onProfile }: { pk: PkSession; still: boolean; onClose: () => void; onProfile: (uid: string) => void }) {
  const enter = useEntrance(still);
  const r = pk.result;
  const groups = (r?.crowned ?? []).map((uid) => ({ uid, total: r!.crowns.filter((c) => c.recipientId === uid).reduce((n, c) => n + c.points, 0), crowns: r!.crowns.filter((c) => c.recipientId === uid) }));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, enter, { maxHeight: '88%' }]}>
          <LinearGradient colors={['#B7832E', '#16253C']} style={[s.hero, { paddingBottom: 14 }]}>
            <Pressable onPress={onClose} style={s.close} hitSlop={8} accessibilityLabel="Kapat ve odaya dön">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Icon3D name="crown" size={46} />
            <Text style={s.title} accessibilityRole="header">
              Taç Kazandıranlar
            </Text>
            <Text style={s.heroSub}>Kazanana PK puanı kazandıran hediyeler · kim kime taç kazandırdı</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
            {!r || groups.length === 0 ? (
              <View style={s.empty}>
                <Art name="pk-beraberlik" size={43} />
                <Text style={s.body}>{r?.noCrown ?? 'Bu PK için taç bilgisi yok.'}</Text>
                <Text style={s.dim}>Taç yalnızca açık bir kazanan olduğunda verilir ve kazanana PK süresince geçerli hediye gönderenlerden oluşur.</Text>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.uid} style={{ gap: 8 }}>
                  <View style={s.groupHead}>
                    <Face uid={g.uid} size={40} onProfile={onProfile} crown ring={colors.gold} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.groupName} numberOfLines={1}>
                        {nameOf(g.uid)} taç giydi
                      </Text>
                      <Text style={s.dim}>
                        {fmt(g.total)} PK puanı · {g.crowns.length} kişi katkıda bulundu
                      </Text>
                    </View>
                  </View>
                  {g.crowns.map((c) => (
                    <CrownCard key={`${c.senderId}-${c.recipientId}`} c={c} onProfile={onProfile} />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
          <View style={s.actions}>
            <Pressable style={s.primary} onPress={onClose} accessibilityLabel="Odaya dön">
              <Text style={s.primaryText}>Odaya dön</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Share of the crowned person's points; a real but tiny share never reads as 0 or a partial one as 100. */
const sharePct = (share: number) => (share >= 1 ? '%100' : share < 0.01 ? '<%1' : `%${Math.min(99, Math.round(share * 100))}`);

/** [sender] —🎁 points→ [crowned]: both people and the direction of the contribution. */
function CrownCard({ c, onProfile }: { c: PkCrown; onProfile: (uid: string) => void }) {
  return (
    <View style={[s.crownCard, c.top && s.crownTop]} accessibilityLabel={`${nameOf(c.senderId)}, ${nameOf(c.recipientId)} kişisine ${fmt(c.points)} PK puanı kazandırdı${c.top ? ', en büyük katkı' : ''}`}>
      {c.top && <Text style={s.topTag}>👑 Taç kazandıran</Text>}
      <View style={s.crownRow}>
        <View style={s.crownSide}>
          <Face uid={c.senderId} size={44} onProfile={onProfile} />
          <Text style={s.crownName} numberOfLines={1}>
            {nameOf(c.senderId)}
          </Text>
        </View>
        <View style={s.link}>
          <Text style={s.linkPts}>+{fmt(c.points)}</Text>
          <View style={s.arrowRow}>
            <View style={s.arrowLine} />
            <Icon3D name="gift" size={20} />
            <View style={s.arrowLine} />
            <Ionicons name="caret-forward" size={14} color={colors.gold} />
          </View>
          <Text style={s.linkMeta}>
            {c.gifts} hediye · {sharePct(c.share)}
          </Text>
        </View>
        <View style={s.crownSide}>
          <Face uid={c.recipientId} size={44} onProfile={onProfile} ring={colors.gold} />
          <Text style={s.crownName} numberOfLines={1}>
            {nameOf(c.recipientId)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.86)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, maxHeight: '92%', backgroundColor: colors.card, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  hero: { alignItems: 'center', gap: 6, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16 },
  close: { position: 'absolute', right: 10, top: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,15,30,0.35)', zIndex: 2 },
  kicker: { color: '#FDE7C2', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  heroSub: { color: '#E2E8F5', fontSize: 13, textAlign: 'center' },
  winnersRow: { flexDirection: 'row', gap: 14, justifyContent: 'center', flexWrap: 'wrap' },
  winnerPts: { color: colors.gold, fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
  scoreRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  scoreBox: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  scoreWin: { borderWidth: 3 },
  winTag: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  scoreName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  scoreNum: { color: '#fff', fontWeight: '900', fontSize: 26, fontVariant: ['tabular-nums'] },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  colHead: { fontWeight: '900', fontSize: 13 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 },
  memberPts: { color: colors.gold, fontWeight: '900', fontSize: 13, fontVariant: ['tabular-nums'] },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, backgroundColor: colors.cardAlt },
  rankWin: { backgroundColor: 'rgba(246,189,96,0.16)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.6)' },
  rankNo: { color: colors.textDim, fontWeight: '900', width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 8, padding: 14, paddingTop: 4 },
  primary: { flex: 1, backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontWeight: '900' },
  secondary: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  crownCard: { backgroundColor: colors.cardAlt, borderRadius: 16, padding: 10, gap: 6, borderWidth: 1, borderColor: colors.border },
  crownTop: { borderColor: colors.gold, backgroundColor: 'rgba(246,189,96,0.12)' },
  topTag: { alignSelf: 'flex-start', color: semantic.moneyInk, backgroundColor: colors.gold, fontSize: 12, fontWeight: '900', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  crownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crownSide: { width: 76, alignItems: 'center', gap: 4 },
  crownName: { color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 76 },
  link: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  linkPts: { color: colors.gold, fontWeight: '900', fontSize: 15, fontVariant: ['tabular-nums'] },
  arrowRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 2 },
  arrowLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(246,189,96,0.6)' },
  linkMeta: { color: colors.textDim, fontSize: 12 },
});
