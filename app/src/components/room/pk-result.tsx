// PK end screens (PK Premium V3 concept, güncelleme 6). 1) PK Sonuçları: the two sides face to face (Normal PK: the
// first two; Takım PK: Red and Blue with their best scorer; odalar arası: the two rooms), who won, their scores and
// shares, the gift ranking and the two awards. 2) After it, "Taç Kazandıranlar": only En Çok Atış Yapan (who sent the
// most) and En Çok Atışı Alan (who received the most). Both only render the server's final result (lib/pk).
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Icon3D } from '@/components/Icon3D';
import { nameOf } from '@/components/room/pk';
import {
  CloseBtn,
  Crest,
  GiftScore,
  GlowButton,
  GoldRim,
  LaurelFace,
  NamePlate,
  PK,
  PkBackdrop,
  Podium,
  RankBadge,
  RingFace,
  Ribbon,
  SectionTitle,
  ShareBar,
  TargetIcon,
  TeamBanner,
  Trophy,
  VsBadge,
} from '@/components/room/pk-premium';
import { roomById, userById } from '@/data/mock';
import { compact } from '@/lib/compact';
import { computeAwards, modeLabel, roomTitle, type PkAward, type PkSession, type TeamId } from '@/lib/pk';

/** Short entrance (≤ 260 ms): fade and a slight scale-up. */
function useEntrance(still: boolean) {
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.spring(v, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [v, still]);
  return { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] };
}

const CONFETTI = ['#F6BD60', '#FF5BB0', '#43B5FF', '#FFFFFF', '#E89B2C'];
/** A few confetti pieces fall once (~1.6 s). Off with reduce motion / effects off. */
function Confetti({ width }: { width: number }) {
  const [pieces] = useState(() => Array.from({ length: 18 }, (_, i) => ({ x: Math.random() * width, delay: Math.random() * 350, rot: Math.random() * 360, color: CONFETTI[i % CONFETTI.length], v: new Animated.Value(0) })));
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

/** One side of the duel: a person (Normal PK), a team with its best scorer, or a room. */
type Side = { name: string; points: number; uid?: string; cover?: { uri?: string; seed: string }; team?: TeamId } | null;

/** Who stands left (pink) and right (blue), and which of them won ('left' | 'right' | 'tie' | 'none'). */
function duelOf(pk: PkSession) {
  const r = pk.result;
  if (!r) return { left: null as Side, right: null as Side, won: 'none' as const };
  if (pk.mode === 'solo') {
    const [a, b] = r.ranking;
    const left: Side = a ? { name: nameOf(a.userId), points: a.points, uid: a.userId } : null;
    const right: Side = b ? { name: nameOf(b.userId), points: b.points, uid: b.userId } : null;
    return { left, right, won: r.winners.length === 1 ? ('left' as const) : r.winners.length > 1 ? ('tie' as const) : ('none' as const) };
  }
  const side = (id: TeamId): Side => {
    const t = pk.teams.find((x) => x.id === id)!;
    const points = id === 'red' ? r.red : r.blue;
    if (pk.kind === 'cross') {
      const room = roomById(t.roomId);
      return { name: roomTitle(t.roomId), points, cover: { uri: room?.cover, seed: t.roomId }, team: id };
    }
    const mvp = r.ranking.find((x) => x.teamId === id && x.points > 0);
    return { name: t.name, points, uid: mvp?.userId, team: id };
  };
  return { left: side('red'), right: side('blue'), won: r.winner === 'red' ? ('left' as const) : r.winner === 'blue' ? ('right' as const) : r.winner === 'tie' ? ('tie' as const) : ('none' as const) };
}

function DuelFace({ side, tone, face, onProfile, glow }: { side: Side; tone: 'pink' | 'blue'; face: number; onProfile: (uid: string) => void; glow: boolean }) {
  const plateW = Math.round(face * 1.5);
  return (
    <View style={{ alignItems: 'center', gap: 4, minWidth: 0 }}>
      {side?.uid ? (
        <LaurelFace uri={userById(side.uid).avatar} face={face} tone={tone} glow={glow} onPress={() => onProfile(side.uid!)} label={`${nameOf(side.uid)} profilini aç`} />
      ) : side?.cover ? (
        <LaurelFace uri={side.cover.uri} cover seed={side.cover.seed} face={face} tone={tone} glow={glow} />
      ) : (
        <LaurelFace face={face} tone={tone} glow={glow}>
          {side?.team ? <TeamBanner team={side.team} height={face * 0.8} /> : <Text style={s.emptyFace}>—</Text>}
        </LaurelFace>
      )}
      <NamePlate text={side?.name ?? 'Rakip yok'} width={plateW} tone={tone} />
    </View>
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
  const insets = useSafeAreaInsets();
  const enter = useEntrance(still);
  const r = pk.result;
  const cancelled = pk.status === 'cancelled';
  const { left, right, won } = duelOf(pk);
  const ours = pk.kind === 'cross' ? pk.teams.find((t) => t.roomId === viewerRoomId)?.id : undefined;
  const winnerName = won === 'left' ? left?.name : won === 'right' ? right?.name : undefined;
  const banner = cancelled ? 'İPTAL EDİLDİ' : !r ? 'SONUÇ BEKLENİYOR' : won === 'tie' ? 'BERABERE' : won === 'none' ? 'KAZANAN YOK' : 'KAZANAN';
  const celebrate = !still && !cancelled && !!r && (won === 'left' || won === 'right');
  const cardW = Math.min(width - 24, 420);
  // Two laurel frames (≈1.8 × the photo wide) and the winner's crown and ribbon (≈96 px) between them.
  const face = Math.round(Math.max(48, Math.min(84, (cardW - 28 - 100) / 3.6)));
  const [all, setAll] = useState(false);
  const ranking = r?.ranking ?? [];
  const ranks = ranking.map((x) => ranking.findIndex((y) => y.points === x.points) + 1);
  const shown = all ? ranking : ranking.slice(0, 3);
  const awards = r ? (r.awards ?? computeAwards(pk)) : null;
  const teamColor = (id?: TeamId) => (id ? pk.teams.find((t) => t.id === id)?.color : undefined);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onContinue}>
      <View style={[s.backdrop, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <Animated.View style={[s.cardWrap, { width: cardW }, enter]}>
          <GoldRim radius={26} width={2} inner={{ flexShrink: 1 }} style={{ flexShrink: 1 }}>
            <PkBackdrop style={{ flexShrink: 1 }}>
              <View style={s.closeAt}>
                <CloseBtn onPress={onContinue} label="Sonucu kapat" />
              </View>
              <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
                <View style={s.head}>
                  <Crest width={Math.min(260, cardW * 0.62)} />
                  <View style={{ marginTop: -18 }}>
                    <Ribbon title="PK Sonuçları" sub={`${modeLabel(pk)} · ${pk.durationMin} dk`} />
                  </View>
                </View>

                {cancelled ? (
                  <View style={s.cancel}>
                    <Text style={s.banner}>{banner}</Text>
                    <Text style={s.body1}>{pk.cancelReason}</Text>
                    <Text style={s.dim}>Kazanan açıklanmaz; PK puanları geçersizdir. Gönderilen hediyeler alıcılarına ulaştığı için iade edilmez.</Text>
                  </View>
                ) : (
                  <>
                    <View style={s.duel}>
                      <DuelFace side={left} tone="pink" face={face} onProfile={onProfile} glow={won === 'left'} />
                      <View style={s.mid}>
                        <Icon3D name="crown" size={Math.round(face * 0.62)} />
                        <GoldRim radius={8} width={1.5}>
                          <View style={[s.winRibbon, { backgroundColor: won === 'tie' || won === 'none' || !r ? '#5B2A86' : PK.win[0] }]}>
                            <Text style={s.winText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                              {banner}
                            </Text>
                          </View>
                        </GoldRim>
                        {winnerName ? (
                          <Text style={s.winnerName} numberOfLines={2}>
                            {winnerName}
                            {ours && r?.winner === ours ? ' · Tebrikler!' : ''}
                          </Text>
                        ) : null}
                      </View>
                      <DuelFace side={right} tone="blue" face={face} onProfile={onProfile} glow={won === 'right'} />
                    </View>

                    {r && (
                      <>
                        <View style={s.scores}>
                          <View style={{ flex: 1, alignItems: 'flex-start' }}>
                            <GiftScore text={compact(left?.points ?? 0)} tone="pink" />
                          </View>
                          <VsBadge size={44} />
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <GiftScore text={compact(right?.points ?? 0)} tone="blue" />
                          </View>
                        </View>
                        <ShareBar left={left?.points ?? 0} right={right?.points ?? 0} />
                        <Text style={s.diff}>
                          {won === 'tie' ? 'Puanlar eşit' : won === 'none' ? 'Kimse puan almadı' : `Fark ${compact(r.diff)} puan`}
                        </Text>
                      </>
                    )}

                    {r && ranking.length > 0 && (
                      <GoldRim radius={18} width={1.5}>
                        <View style={s.panel}>
                          <SectionTitle text="Hediye Sıralaması" />
                          {shown.map((x, i) => (
                            <Pressable key={x.userId} onPress={() => onProfile(x.userId)} style={s.rankRow} accessibilityRole="button" accessibilityLabel={`${ranks[i]}. ${nameOf(x.userId)}, ${compact(x.points)} puan`}>
                              <RankBadge rank={ranks[i]} />
                              <RingFace uri={userById(x.userId).avatar} size={34} rank={ranks[i]} />
                              {teamColor(x.teamId) ? <View style={[s.dot, { backgroundColor: teamColor(x.teamId) }]} /> : null}
                              <Text style={s.rankName} numberOfLines={1}>
                                {nameOf(x.userId)}
                              </Text>
                              <View style={s.rankPts}>
                                <Icon3D name="gift" size={16} />
                                <Text style={s.rankPtsText}>{compact(x.points)}</Text>
                              </View>
                            </Pressable>
                          ))}
                          {ranking.length > 3 && (
                            <Pressable onPress={() => setAll((v) => !v)} style={s.more} accessibilityRole="button">
                              <Text style={s.moreText}>{all ? 'Daha az göster' : `Tümünü gör (${ranking.length})`}</Text>
                            </Pressable>
                          )}
                        </View>
                      </GoldRim>
                    )}

                    {awards && (awards.topSender || awards.topRecipient) && (
                      <View style={s.awards}>
                        <SectionTitle text="Taç Kazandıranlar" />
                        <View style={s.awardRow}>
                          <MiniAward award={awards.topSender} tone="pink" title="En Çok Atış Yapan" onProfile={onProfile} />
                          <MiniAward award={awards.topRecipient} tone="blue" title="En Çok Atışı Alan" onProfile={onProfile} />
                        </View>
                      </View>
                    )}
                    {r && <Text style={s.dim}>{r.validGifts} geçerli hediye · sonuç sunucuda kesinleşti · PK puanı jeton ve kazançtan ayrıdır.</Text>}
                  </>
                )}

                <View style={s.actions}>
                  <GlowButton title={cancelled || !r ? 'Odaya dön' : 'Taç Kazandıranlar'} crown={!cancelled && !!r} onPress={onContinue} label={cancelled || !r ? 'Odaya dön' : 'Taç kazandıranları gör'} />
                  {onNew && (
                    <Pressable style={s.secondary} onPress={onNew} accessibilityRole="button" accessibilityLabel="Yeni PK">
                      <Text style={s.secondaryText}>Yeni PK</Text>
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            </PkBackdrop>
          </GoldRim>
        </Animated.View>
        {celebrate && <Confetti width={width} />}
      </View>
    </Modal>
  );
}

/** One award in the result's footer: a small framed face, the title, the name and the amount. */
function MiniAward({ award, tone, title, onProfile }: { award: PkAward | null; tone: 'pink' | 'blue'; title: string; onProfile: (uid: string) => void }) {
  return (
    <View style={s.mini}>
      {award ? (
        <LaurelFace uri={userById(award.userId).avatar} face={46} tone={tone} onPress={() => onProfile(award.userId)} label={`${title}: ${nameOf(award.userId)}`} />
      ) : (
        <LaurelFace face={46} tone={tone}>
          <Text style={s.emptyFace}>—</Text>
        </LaurelFace>
      )}
      <View style={s.miniTag}>
        {tone === 'pink' ? <Icon3D name="gift" size={14} /> : <TargetIcon size={14} />}
        <Text style={s.miniTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={s.miniName} numberOfLines={1}>
        {award ? nameOf(award.userId) : 'Kimse yok'}
      </Text>
      {award && <Text style={[s.miniPts, { color: tone === 'pink' ? '#FF8FD0' : '#9CD3FF' }]}>{compact(award.points)}</Text>}
    </View>
  );
}

// --- Crowns ---------------------------------------------------------------------------------------
/**
 * Taç Kazandıranlar: only two people (the concept's rule). Left, pink: En Çok Atış Yapan, who sent the most PK points
 * in valid gifts; right, blue: En Çok Atışı Alan, who received the most. Each with photo, name and amount; the trophy
 * between them.
 */
export function CrownScreen({ pk, still, onClose, onProfile }: { pk: PkSession; still: boolean; onClose: () => void; onProfile: (uid: string) => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const enter = useEntrance(still);
  const r = pk.result;
  const awards = r ? (r.awards ?? computeAwards(pk)) : null;
  const cardW = Math.min(width - 24, 420);
  const face = Math.round(Math.min(96, cardW * 0.23));
  const none = !awards || (!awards.topSender && !awards.topRecipient);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.backdrop, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <Animated.View style={[s.cardWrap, { width: cardW }, enter]}>
          <GoldRim radius={26} width={2} inner={{ flexShrink: 1 }} style={{ flexShrink: 1 }}>
            <PkBackdrop style={{ flexShrink: 1 }}>
              <View style={s.closeAt}>
                <CloseBtn onPress={onClose} label="Kapat ve odaya dön" />
              </View>
              <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
                <View style={s.head}>
                  <Crest width={Math.min(280, cardW * 0.66)} />
                  <View style={{ marginTop: -18 }}>
                    <Ribbon title="Taç Kazandıranlar" size={24} />
                  </View>
                </View>
                {none ? (
                  <View style={s.cancel}>
                    <Trophy height={110} />
                    <Text style={s.body1}>Bu PK’da geçerli hediye olmadığı için taç kazandıran yok.</Text>
                    <Text style={s.dim}>Taç; PK süresince en çok hediye atan ve en çok hediye alan kişiye verilir.</Text>
                  </View>
                ) : (
                  <>
                    <View style={s.crownRow}>
                      <BigAward award={awards!.topSender} tone="pink" title="En Çok Atış Yapan" face={face} onProfile={onProfile} />
                      <BigAward award={awards!.topRecipient} tone="blue" title="En Çok Atışı Alan" face={face} onProfile={onProfile} />
                    </View>
                    <View style={s.trophyRow}>
                      <Trophy height={Math.round(face * 1.25)} />
                    </View>
                    <Text style={[s.dim, { textAlign: 'center' }]}>PK süresince gönderilen ve alınan geçerli hediyelerin PK puanı (iade edilenler sayılmaz).</Text>
                  </>
                )}
                <View style={s.actions}>
                  <GlowButton title="Odaya dön" crown={false} onPress={onClose} />
                </View>
              </ScrollView>
            </PkBackdrop>
          </GoldRim>
        </Animated.View>
      </View>
    </Modal>
  );
}

function BigAward({ award, tone, title, face, onProfile }: { award: PkAward | null; tone: 'pink' | 'blue'; title: string; face: number; onProfile: (uid: string) => void }) {
  const plateW = Math.round(face * 1.75);
  return (
    <View style={s.big} accessibilityLabel={award ? `${title}: ${nameOf(award.userId)}, ${compact(award.points)} puan, ${award.gifts} hediye` : `${title}: kimse yok`}>
      {award ? (
        <LaurelFace uri={userById(award.userId).avatar} face={face} tone={tone} glow onPress={() => onProfile(award.userId)} label={`${nameOf(award.userId)} profilini aç`} />
      ) : (
        <LaurelFace face={face} tone={tone}>
          <Text style={s.emptyFace}>—</Text>
        </LaurelFace>
      )}
      <GoldRim radius={12} width={1.5} style={{ width: plateW, marginTop: -6 }}>
        <View style={[s.bigPlate, { backgroundColor: tone === 'pink' ? '#6B0E4E' : '#14306E' }]}>
          {tone === 'pink' ? <Icon3D name="gift" size={22} /> : <TargetIcon size={22} />}
          <Text style={s.bigTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </GoldRim>
      <Text style={s.bigName} numberOfLines={1}>
        {award ? nameOf(award.userId) : 'Kimse yok'}
      </Text>
      {award && <GiftScore text={compact(award.points)} tone={tone} size={18} />}
      {award && <Text style={s.dimC}>{award.gifts} hediye</Text>}
      <Podium width={Math.round(face * 1.3)} tone={tone} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,4,20,0.86)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  // Between the system bars (the backdrop's padding).
  cardWrap: { maxHeight: '100%' },
  closeAt: { position: 'absolute', right: 10, top: 10, zIndex: 3 },
  body: { padding: 14, paddingTop: 8, gap: 12 },
  head: { alignItems: 'center' },
  cancel: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  banner: { color: PK.goldText, fontSize: 20, fontWeight: '800' },
  body1: { color: '#fff', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  dim: { color: PK.dim, fontSize: 12, lineHeight: 17 },
  dimC: { color: PK.dim, fontSize: 12, textAlign: 'center' },
  duel: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  mid: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingTop: 18 },
  winRibbon: { paddingHorizontal: 6, paddingVertical: 4, minWidth: 86, alignItems: 'center' },
  winText: { color: '#FFE9A8', fontWeight: '800', fontSize: 14, letterSpacing: 0.5, textAlign: 'center' },
  winnerName: { color: PK.goldText, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  emptyFace: { color: PK.dim, fontSize: 22, fontWeight: '800' },
  scores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diff: { color: PK.dim, fontSize: 12, textAlign: 'center', marginTop: -4 },
  panel: { backgroundColor: PK.panel, padding: 10, gap: 6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12, backgroundColor: PK.glass },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rankName: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  rankPts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankPtsText: { color: '#fff', fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  more: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  moreText: { color: PK.goldText, fontWeight: '800', fontSize: 13 },
  awards: { gap: 8 },
  awardRow: { flexDirection: 'row', justifyContent: 'space-around' },
  mini: { alignItems: 'center', gap: 2, width: '46%' },
  miniTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniTitle: { color: PK.goldText, fontWeight: '800', fontSize: 12 },
  miniName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  miniPts: { fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  actions: { gap: 8, paddingTop: 2 },
  secondary: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: PK.goldEdge },
  secondaryText: { color: PK.goldText, fontWeight: '800' },
  crownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  big: { width: '49%', alignItems: 'center', gap: 4 },
  bigPlate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  bigTitle: { color: PK.goldText, fontWeight: '800', fontSize: 13, flexShrink: 1, textAlign: 'center' },
  bigName: { color: '#fff', fontWeight: '800', fontSize: 15, maxWidth: '100%' },
  trophyRow: { alignItems: 'center', marginTop: -36 },
});
