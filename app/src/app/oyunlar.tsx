// Oyun Merkezi (profile entry point). Oyun Salonu games open here without joining any room; free room games
// can be tried here (the demo with sample online players, a live build against bots) and are meant to be played
// inside rooms. Same platform, wallet and history as the in-room entry (lib/games); in a live build the server plays
// every Oyun Salonu round and the catalog and history are the server's (lib/live/casino).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { gameArtOf, gameHueOf } from '@/components/GameArt';
import { BreakoutCard, FloatIcon, GlossButton } from '@/components/fx/float';
import { RollingNumber } from '@/components/fx/rolling-number';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, DepthCard, glassChipOf } from '@/components/fx/surface';
import { icon3dSourceFor } from '@/components/Icon3D';
import { GamePanel, type OpenGame } from '@/components/games/game-panel';
import { Card, Header } from '@/components/ui';
import type { CasinoGame } from '@/data/games';
import { ME, USERS } from '@/data/mock';
import { casinoAccess, casinoVisible, practiceBots, useGames } from '@/lib/games';
import { liveMode } from '@/lib/live';
import { useLiveCasino } from '@/lib/live/casino';
import { useApp } from '@/store';
// Static `colors` is the dark scheme: only for the game panel modal, which is dark in both schemes.
import { ThemeScope, colors, fonts, makeStyles, useTheme } from '@/theme';

type Tab = 'casino' | 'room' | 'history';
const PROFILE = { from: 'profile' } as const;

/** Oyun Salonu's shelves, in the order shown; a game not named here goes on the last one. */
const SHELVES: { title: string; ids: CasinoGame['id'][] }[] = [
  { title: 'Slot makineleri', ids: ['jackpot', 'super777', 'jungle', 'pinata', 'spellbook', 'neon', 'goldtree'] },
  { title: 'Çark ve masa', ids: ['slot', 'foodwheel', 'magiccard'] },
  { title: 'Aksiyon', ids: ['rocket', 'fish', 'olympus', 'bilye'] },
];
/** One line under a game's name: what it is, said shortly (the rules are in the game's "?" sheet). */
const HOOK: Partial<Record<CasinoGame['id'], string>> = {
  jackpot: '5 makara · 10 çizgi',
  super777: '3 makara · klasik',
  jungle: '15 çizgi · Aslan Wild',
  pinata: '20 çizgi · bol renk',
  spellbook: '20 çizgi · dört ödül',
  neon: '10 çizgi · en büyük fon',
  goldtree: '3 makara · 188 kat',
  slot: 'Çarkı çevir · 8 kat',
  foodwheel: '8 seçenek · 45 kat',
  magiccard: '8 kart · 100 kat',
  rocket: 'Çarpanı seç, fırlat',
  fish: 'Dokun, ateş et, yakala',
  olympus: 'Fenerin ışığı kimi bulacak?',
  bilye: 'Fırlat, çivilerden sek, kupaya düş',
};

export default function GameCenter() {
  const { oyun } = useLocalSearchParams<{ oyun?: CasinoGame['id'] | 'ruzgar' }>();
  const { wealthLevel, paidGames, me } = useApp();
  const { casino, roomGames, history, bank } = useGames();
  const t = useTheme();
  const narrow = useWindowDimensions().width < 380;
  const s = useStyles();
  // Below Cömertlik Lv.2 Oyun Salonu is not shown at all: no tab, and an old link to one of its games opens nothing.
  // A live build reads the server's catalog (switches, stakes, history) each time the screen comes to the front.
  useLiveCasino();
  const showSalon = casinoVisible(wealthLevel, paidGames);
  const showCasino = showSalon;
  // Until a tab is picked the screen opens on Oyun Salonu for whoever may see it. A live build learns the level
  // from the server a moment after the screen opens, so the choice can't be made once at the start.
  const [picked, setTab] = useState<Tab | null>(null);
  const tab: Tab = picked && (picked !== 'casino' || showSalon) ? picked : showSalon ? 'casino' : 'room';
  const [open, setOpen] = useState<OpenGame | null>(oyun === 'ruzgar' ? (showSalon ? { kind: 'wheel' } : null) : oyun && showCasino ? { kind: 'casino', id: oyun } : null);
  // Room games from the profile: the demo fills the table with sample online players. A live build has no
  // matchmaking here, so they are tried against bots, named as bots.
  const live = liveMode();
  const [players] = useState(() => [{ id: 'me', name: ME.name, avatar: ME.avatar }, ...(live ? practiceBots(5) : USERS.filter((u) => u.online).slice(0, 5))]);

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
            {showCasino &&
              (() => {
                const active = casino.filter((g) => g.active);
                const shelved = new Set(SHELVES.flatMap((x) => x.ids));
                const rest = active.filter((g) => !shelved.has(g.id));
                return SHELVES.map((shelf, k) => {
                  const games = [...active.filter((g) => shelf.ids.includes(g.id)).sort((a, b) => shelf.ids.indexOf(a.id) - shelf.ids.indexOf(b.id)), ...(k === SHELVES.length - 1 ? rest : [])];
                  if (!games.length) return null;
                  return (
                    <View key={shelf.title} style={{ gap: 2 }}>
                      <Text style={s.section}>{shelf.title}</Text>
                      <View style={s.grid}>
                        {games.map((g, i) => {
                          const access = casinoAccess(g, PROFILE, wealthLevel);
                          // The first slot leads the hall; an odd one out at the end of a shelf takes the whole row.
                          const featured = k === 0 && i === 0;
                          const wide = featured || (i === games.length - 1 && (games.length - (k === 0 ? 1 : 0)) % 2 === 1);
                          const fund = bank.jackpots[g.id];
                          // The card beside this one shows a JACKPOT fund and this one has none: the same space is
                          // kept empty, so the two cards of a row end level with their buttons in line.
                          const firstPaired = k === 0 ? 1 : 0;
                          const mate = wide ? undefined : games[(i - firstPaired) % 2 === 0 ? i + 1 : i - 1];
                          const level = fund === undefined && !!mate && bank.jackpots[mate.id] !== undefined;
                          return (
                            <View key={g.id} style={wide ? s.full : s.half}>
                              <BreakoutCard
                                icon={{ source: gameArtOf(g.id), emoji: g.emoji }}
                                hue={gameHueOf(g.id)}
                                iconSize={featured ? 100 : 76}
                                featured={featured}
                                delay={i * 300}
                                label={`${g.name} aç`}
                                onPress={() => setOpen({ kind: 'casino', id: g.id })}
                              >
                                <Text style={[featured ? s.heroName : s.name, narrow && !featured && s.nameNarrow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                                  {g.name}
                                </Text>
                                <Text style={s.dim} numberOfLines={1}>
                                  {HOOK[g.id] ?? `${g.bets[0].toLocaleString('tr-TR')}–${g.bets[g.bets.length - 1].toLocaleString('tr-TR')} jeton`}
                                  {g.providerStatus !== 'online' ? ' · sağlayıcı sorunlu' : ''}
                                </Text>
                                {fund !== undefined && (
                                  <View style={s.fund} accessibilityLabel={`JACKPOT ${Math.floor(fund)} jeton`}>
                                    <Text style={s.fundTag}>JACKPOT</Text>
                                    <RollingNumber value={Math.floor(fund)} style={s.fundValue} duration={900} />
                                  </View>
                                )}
                                {level && (
                                  <View style={[s.fund, { opacity: 0 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
                                    <Text style={s.fundValue}>0</Text>
                                  </View>
                                )}
                                <GlossButton label={access.ok ? 'Oyna' : `Cömertlik Lv.${g.minWealth}`} tone={access.ok ? 'money' : 'locked'} small={!featured} icon={!access.ok && <Ionicons name="lock-closed" size={12} color={t.dark ? '#C7D2E5' : t.colors.textDim} />} />
                              </BreakoutCard>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            <Text style={s.dim}>Oyun kazançları oyun bakiyesine yazılır; yalnızca oyunlarda kullanılır, hediye edilemez ve gerçek paraya çevrilemez.</Text>
          </>
        )}

        {tab === 'room' && (
          <>
            <DepthCard style={s.banner}>
              <FloatIcon source={icon3dSourceFor('🎁')} size={36} hue={t.semantic.action} />
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>Herkese ücretsiz</Text>
                <Text style={s.dim}>Oda oyunları odanın içinde, odadakilerle oynanır; mikrofonun ve koltuğun aynen kalır.{live ? ' Buradan botlara karşı deneyebilirsin.' : ' Buradan çevrimiçi oyuncularla deneyebilirsin.'}</Text>
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
                              {g.active && !ready ? 'Bu oyun yakında geliyor.' : `${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} oyuncu${ready ? (live ? ' · botlarla dene' : '') : ' · pasif'}`}
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
            <Text style={s.dim}>
              {!showCasino
                ? 'Henüz oyun hareketi yok.'
                : live
                  ? 'Henüz oyun hareketi yok. Oyun Salonu turların burada işlem numarasıyla listelenir; jeton hareketleri Cüzdan geçmişinde de görünür.'
                  : 'Henüz oyun hareketi yok. Oyun Salonu turları, iadeler ve reddedilen istekler burada işlem numarasıyla listelenir; jeton hareketleri Cüzdan geçmişinde de görünür.'}
            </Text>
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
  // Two cards share a 360 px row: the longest names ("Gece Yarısı Çarkı") need the smaller size to stay whole.
  nameNarrow: { fontSize: 15.5 },
  heroName: { color: t.colors.text, fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  section: { color: t.colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, marginTop: 4 },
  // A slot's JACKPOT fund on its card: dark and gold in both schemes, like the plaque in the game.
  fund: { flexDirection: 'row', alignItems: 'baseline', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(8,15,30,0.82)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(246,189,96,0.6)', paddingHorizontal: 9, paddingVertical: 2 },
  fundTag: { color: '#F6BD60', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  fundValue: { color: '#FDE68A', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
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
