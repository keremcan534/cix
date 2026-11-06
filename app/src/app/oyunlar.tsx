// Oyun Merkezi (profile entry point). Oyun Salonu games open here without joining any room; free room games
// can be tried with online players and are meant to be played inside rooms. Same platform, wallet and
// history as the in-room entry (lib/games).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { gameArtOf, gameHueOf } from '@/components/GameArt';
import { BreakoutCard, FloatIcon, GlossButton } from '@/components/fx/float';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, DepthCard, glassChipOf } from '@/components/fx/surface';
import { icon3dSourceFor } from '@/components/Icon3D';
import { GamePanel, type OpenGame } from '@/components/games/game-panel';
import { Card, Header } from '@/components/ui';
import type { CasinoGame } from '@/data/games';
import { ME, USERS } from '@/data/mock';
import { casinoAccess, casinoVisible, gamblingLevelOk, useGames } from '@/lib/games';
import { useApp } from '@/store';
// Static `colors` is the dark scheme: only for the game panel modal, which is dark in both schemes.
import { ThemeScope, colors, fonts, makeStyles, useTheme } from '@/theme';

type Tab = 'casino' | 'room' | 'history';
const PROFILE = { from: 'profile' } as const;

export default function GameCenter() {
  const { oyun } = useLocalSearchParams<{ oyun?: CasinoGame['id'] | 'ruzgar' }>();
  const { wealthLevel, me } = useApp();
  const { casino, roomGames, history } = useGames();
  const t = useTheme();
  const s = useStyles();
  // Below Cömertlik Lv.2 Oyun Salonu is not shown at all: no tab, and an old link to one of its games opens nothing.
  // Rüzgâr Gülü runs on the server and needs only that level; the other casino games are decided on this phone,
  // so a live build hides them at every level (casinoVisible).
  const showSalon = gamblingLevelOk(wealthLevel);
  const showCasino = casinoVisible(wealthLevel);
  const [tab, setTab] = useState<Tab>(showSalon ? 'casino' : 'room');
  const [open, setOpen] = useState<OpenGame | null>(oyun === 'ruzgar' ? (showSalon ? { kind: 'wheel' } : null) : oyun && showCasino ? { kind: 'casino', id: oyun } : null);
  // Room games from the profile: the game's own matchmaking fills the table with online players.
  const [players] = useState(() => [{ id: 'me', name: ME.name, avatar: ME.avatar }, ...USERS.filter((u) => u.online).slice(0, 5)]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Backdrop scene={SCENES.games} />
      <Header title="Oyun Merkezi" />
      <View style={s.tabs}>
        {(
          [
            ...(showSalon ? [['casino', 'Oyun Salonu']] : []),
            ['room', 'Oda oyunları'],
            ['history', 'Geçmiş'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabText, tab === k && { color: t.semantic.actionInk }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}>
        {tab === 'casino' && showSalon && (
          <>
            <DepthCard style={s.banner}>
              <FloatIcon source={icon3dSourceFor('👑')} size={36} hue={t.semantic.money} />
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>Cömertlik Lv.{wealthLevel}</Text>
                <Text style={s.dim}>Cömertlik Lv.2 ve üzerine açık, erişim her turda sunucuda kontrol edilir. Odaya girmen gerekmez.</Text>
              </View>
            </DepthCard>
            <Pressable onPress={() => setOpen({ kind: 'wheel' })} accessibilityRole="button" accessibilityLabel="Rüzgâr Gülü aç">
              <LinearGradient colors={['#3B2300', '#16253C', '#0A3A4A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.wheelCard}>
                <View style={s.wheelBadge}>
                  <Ionicons name="compass" size={54} color="#F6BD60" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.wheelTag}>YENİ · JACKPOT</Text>
                  <Text style={s.wheelName}>Rüzgâr Gülü</Text>
                  <Text style={s.wheelDim}>Kıyı, Açık Deniz, Derin Okyanus · ×1, ×10, ×50 çevir · her dilim kazandırır</Text>
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <GlossButton label="Çevir" tone="money" small />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
            {showCasino && (
              <View style={s.grid}>
                {casino
                  .filter((g) => g.active)
                  .map((g, i, all) => {
                    const access = casinoAccess(g, PROFILE, wealthLevel);
                    const featured = i === 0;
                    const wide = featured || (i === all.length - 1 && all.length % 2 === 0);
                    return (
                      <View key={g.id} style={wide ? s.full : s.half}>
                        <BreakoutCard
                          icon={{ source: gameArtOf(g.id), emoji: g.emoji }}
                          hue={gameHueOf(g.id)}
                          iconSize={featured ? 112 : 76}
                          featured={featured}
                          delay={i * 300}
                          label={`${g.name} aç`}
                          onPress={() => setOpen({ kind: 'casino', id: g.id })}
                        >
                          <Text style={featured ? s.heroName : s.name} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <Text style={s.dim} numberOfLines={2}>
                            {g.bets[0].toLocaleString('tr-TR')}–{g.bets[g.bets.length - 1].toLocaleString('tr-TR')} jeton · {g.fromRoom ? 'odada da açılır' : 'yalnızca buradan'}
                            {g.providerStatus !== 'online' ? ' · sağlayıcı sorunlu' : ''}
                          </Text>
                          <GlossButton label={access.ok ? 'Oyna' : `Cömertlik Lv.${g.minWealth}`} tone={access.ok ? 'money' : 'locked'} small={!featured} icon={!access.ok && <Ionicons name="lock-closed" size={12} color={t.dark ? '#C7D2E5' : t.colors.textDim} />} />
                        </BreakoutCard>
                      </View>
                    );
                  })}
              </View>
            )}
            <Text style={s.dim}>Jetonlar gerçek paraya çevrilemez. Gerçek para, para çekme veya gerçek değerli ödül içeren bir sistem hukuki inceleme olmadan açılmaz.</Text>
          </>
        )}

        {tab === 'room' && (
          <>
            <DepthCard style={s.banner}>
              <FloatIcon source={icon3dSourceFor('🎁')} size={36} hue={t.semantic.action} />
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>Herkese ücretsiz</Text>
                <Text style={s.dim}>Oda oyunları odanın içinde, odadakilerle oynanır; mikrofonun ve koltuğun aynen kalır. Buradan çevrimiçi oyuncularla deneyebilirsin.</Text>
              </View>
            </DepthCard>
            {[1, 2].map((phase) => (
              <View key={phase} style={{ gap: 2 }}>
                <Text style={s.section}>{phase === 1 ? 'İlk sürüm' : 'İkinci aşama'}</Text>
                <View style={s.grid}>
                  {roomGames
                    .filter((g) => g.phase === phase)
                    .map((g, i) => {
                      const ready = g.active && g.playable;
                      return (
                        <View key={g.id} style={s.half}>
                          <BreakoutCard
                            icon={{ source: gameArtOf(g.id), emoji: g.emoji }}
                            hue={gameHueOf(g.id)}
                            iconSize={68}
                            dim={!g.active}
                            delay={i * 260}
                            label={ready ? `${g.name} dene` : g.name}
                            onPress={() => ready && setOpen({ kind: 'room', id: g.id })}
                          >
                            <Text style={s.name} numberOfLines={1}>
                              {g.name}
                            </Text>
                            <Text style={s.dim}>
                              {g.active && !ready ? 'Bu oyun yakında geliyor.' : `${g.minPlayers}–${g.maxPlayers} oyuncu${ready ? '' : ' · pasif'}`}
                            </Text>
                            {ready && <GlossButton label="Dene" tone="action" small />}
                          </BreakoutCard>
                        </View>
                      );
                    })}
                </View>
              </View>
            ))}
            <Pressable onPress={() => router.push('/(tabs)')}>
              <Text style={[s.dim, { color: t.semantic.tonalText, fontWeight: '800' }]}>Arkadaşlarınla oynamak için bir oda bul ›</Text>
            </Pressable>
          </>
        )}

        {tab === 'history' &&
          (history.length === 0 ? (
            <Text style={s.dim}>{showCasino ? 'Henüz oyun hareketi yok. Oyun Salonu turları, iadeler ve reddedilen istekler burada işlem numarasıyla listelenir; jeton hareketleri Cüzdan geçmişinde de görünür.' : 'Henüz oyun hareketi yok.'}</Text>
          ) : (
            history.map((h) => (
              <Card key={h.requestId + h.txId} style={{ gap: 2 }}>
                <View style={s.row}>
                  <Text style={[s.title, { flex: 1 }]}>{h.gameName}</Text>
                  {/* A refund gave the bet back: no gain, so it isn't shown as a green +0. */}
                  <Text style={[s.amount, { color: h.status !== 'Tamamlandı' ? t.colors.textDim : h.payout - h.bet >= 0 ? t.colors.green : t.colors.text }]}>
                    {h.status === 'Reddedildi' ? '—' : h.status === 'İade edildi' ? 'İade' : `${h.payout - h.bet >= 0 ? '+' : ''}${(h.payout - h.bet).toLocaleString('tr-TR')}`}
                  </Text>
                </View>
                <Text style={s.dim}>
                  {h.status} · bahis {h.bet.toLocaleString('tr-TR')} · ödeme {h.payout.toLocaleString('tr-TR')} · {h.detail}
                </Text>
                <Text style={s.dim}>
                  {h.entry} · {h.time} · {h.txId}
                </Text>
              </Card>
            ))
          ))}
      </ScrollView>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {/* Games are dark in both schemes, as in the room. */}
        <ThemeScope scheme="dark">
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            {open && <GamePanel open={open} entry={PROFILE} players={[{ id: 'me', name: me.name, avatar: me.avatar }, ...players.slice(1)]} onSwitch={setOpen} onClose={() => setOpen(null)} onLeave={() => setOpen(null)} />}
          </View>
        </ThemeScope>
      </Modal>
      {!open && tab !== 'history' && (
        <Pressable style={s.fab} onPress={() => setTab('history')} accessibilityLabel="Oyun geçmişi">
          <Ionicons name="time" size={20} color={t.semantic.actionInk} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  tabs: { flexDirection: 'row', gap: 4, marginHorizontal: 16, marginTop: 4, padding: 4, borderRadius: 999, ...glassChipOf(t) },
  tab: { flex: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  tabOn: { backgroundColor: t.semantic.action, boxShadow: '0 3px 12px rgba(19,217,223,0.4)' },
  tabText: { color: t.colors.textDim, fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 18 },
  title: { color: t.colors.text, fontWeight: '800', fontSize: 15 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, paddingLeft: 18 },
  bannerTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  half: { width: '48.5%' },
  full: { width: '100%' },
  name: { color: t.colors.text, fontFamily: fonts.display, fontSize: 17, lineHeight: 22 },
  heroName: { color: t.colors.text, fontFamily: fonts.display, fontSize: 26, lineHeight: 32 },
  section: { color: t.colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, marginTop: 4 },
  dim: { color: t.colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { fontWeight: '900', fontSize: 15 },
  // Rüzgâr Gülü's card is dark in both schemes, like the game itself.
  wheelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: 'rgba(246,189,96,0.45)', boxShadow: '0 8px 24px rgba(246,189,96,0.18)' },
  wheelBadge: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: '#F6BD60', backgroundColor: '#080F1E', alignItems: 'center', justifyContent: 'center' },
  wheelTag: { color: '#FF8E9A', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  wheelName: { color: '#FFFFFF', fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  wheelDim: { color: '#C7D2E5', fontSize: 12, lineHeight: 17 },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 48, height: 48, borderRadius: 24, backgroundColor: t.semantic.action, alignItems: 'center', justifyContent: 'center' },
}));
