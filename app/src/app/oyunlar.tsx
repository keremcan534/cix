// Oyun Merkezi (profile entry point). Casino games open here without joining any room; free room games
// can be tried with online players and are meant to be played inside rooms. Same platform, wallet and
// history as the in-room entry (lib/games).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameIcon } from '@/components/GameArt';
import { GamePanel, type OpenGame } from '@/components/games/game-panel';
import { Card, Header } from '@/components/ui';
import type { CasinoGame } from '@/data/games';
import { ME, USERS } from '@/data/mock';
import { casinoAccess, useGames } from '@/lib/games';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

type Tab = 'casino' | 'room' | 'history';
const PROFILE = { from: 'profile' } as const;

export default function GameCenter() {
  const { oyun } = useLocalSearchParams<{ oyun?: CasinoGame['id'] }>();
  const { wealthLevel, me } = useApp();
  const { casino, roomGames, history } = useGames();
  const [tab, setTab] = useState<Tab>('casino');
  const [open, setOpen] = useState<OpenGame | null>(oyun ? { kind: 'casino', id: oyun } : null);
  // Room games from the profile: the game's own matchmaking fills the table with online players.
  const [players] = useState(() => [{ id: 'me', name: ME.name, avatar: ME.avatar }, ...USERS.filter((u) => u.online).slice(0, 5)]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Oyun Merkezi" />
      <View style={s.tabs}>
        {(
          [
            ['casino', 'Casino · Servet Lv.2'],
            ['room', 'Oda oyunları'],
            ['history', 'Geçmiş'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabText, tab === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {tab === 'casino' && (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Senin Servet Seviyen: Lv.{wealthLevel}</Text>
              <Text style={s.dim}>Casino oyunları Servet Seviyesi 2 ve üzeri üyelere açıktır; erişim her turda sunucuda yeniden kontrol edilir. Bir odaya girmen gerekmez.</Text>
            </Card>
            {casino
              .filter((g) => g.active)
              .map((g) => {
                const access = casinoAccess(g, PROFILE, wealthLevel);
                return (
                  <Card key={g.id} style={s.row}>
                    <GameIcon id={g.id} emoji={g.emoji} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{g.name}</Text>
                      <Text style={s.dim}>
                        {g.bets[0]}–{g.bets[g.bets.length - 1]} jeton · {g.fromRoom ? 'odada da açılır' : 'yalnızca buradan'}
                        {g.providerStatus !== 'online' ? ' · sağlayıcı sorunlu' : ''}
                      </Text>
                    </View>
                    <Pressable style={[s.play, !access.ok && s.locked]} onPress={() => setOpen({ kind: 'casino', id: g.id })} accessibilityLabel={`${g.name} aç`}>
                      <Text style={[s.playText, !access.ok && { color: colors.text }]}>{access.ok ? 'Oyna' : `🔒 Servet Lv.${g.minWealth}`}</Text>
                    </Pressable>
                  </Card>
                );
              })}
            <Text style={s.dim}>Jetonlar gerçek paraya çevrilemez. Gerçek para, para çekme veya gerçek değerli ödül içeren bir sistem hukuki inceleme olmadan açılmaz.</Text>
          </>
        )}

        {tab === 'room' && (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Herkese ücretsiz, VIP gerekmez</Text>
              <Text style={s.dim}>Oda oyunları sesli sohbet odasının içinde, odadakilerle oynanır; oyun açıkken mikrofonun ve koltuğun aynen kalır. Buradan çevrimiçi oyuncularla deneyebilirsin.</Text>
            </Card>
            {[1, 2].map((phase) => (
              <View key={phase} style={{ gap: 8 }}>
                <Text style={s.section}>{phase === 1 ? 'İlk sürüm' : 'İkinci aşama'}</Text>
                {roomGames
                  .filter((g) => g.phase === phase)
                  .map((g) => (
                    <Card key={g.id} style={[s.row, !g.active && { opacity: 0.5 }]}>
                      <GameIcon id={g.id} emoji={g.emoji} size={30} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.title}>{g.name}</Text>
                        <Text style={s.dim}>
                          {g.minPlayers}–{g.maxPlayers} oyuncu · {g.active ? (g.playable ? 'oynanabilir' : 'sağlayıcı bekleniyor') : 'pasif'}
                        </Text>
                      </View>
                      {g.active && g.playable && (
                        <Pressable style={s.play} onPress={() => setOpen({ kind: 'room', id: g.id })} accessibilityLabel={`${g.name} dene`}>
                          <Text style={s.playText}>Dene</Text>
                        </Pressable>
                      )}
                    </Card>
                  ))}
              </View>
            ))}
            <Pressable onPress={() => router.push('/(tabs)')}>
              <Text style={[s.dim, { color: semantic.tonalText, fontWeight: '800' }]}>Arkadaşlarınla oynamak için bir oda bul ›</Text>
            </Pressable>
          </>
        )}

        {tab === 'history' &&
          (history.length === 0 ? (
            <Text style={s.dim}>Henüz oyun hareketi yok. Casino turları, iadeler ve reddedilen istekler burada işlem numarasıyla listelenir; jeton hareketleri Cüzdan geçmişinde de görünür.</Text>
          ) : (
            history.map((h) => (
              <Card key={h.requestId + h.txId} style={{ gap: 2 }}>
                <View style={s.row}>
                  <Text style={[s.title, { flex: 1 }]}>{h.gameName}</Text>
                  <Text style={[s.amount, { color: h.status === 'Reddedildi' ? colors.textDim : h.payout - h.bet >= 0 ? colors.green : colors.text }]}>
                    {h.status === 'Reddedildi' ? '—' : `${h.payout - h.bet >= 0 ? '+' : ''}${(h.payout - h.bet).toLocaleString('tr-TR')}`}
                  </Text>
                </View>
                <Text style={s.dim}>
                  {h.status} · bahis {h.bet} · ödeme {h.payout} · {h.detail}
                </Text>
                <Text style={s.dim}>
                  {h.entry} · {h.time} · {h.txId}
                </Text>
              </Card>
            ))
          ))}
      </ScrollView>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {open && <GamePanel open={open} entry={PROFILE} players={[{ id: 'me', name: me.name, avatar: me.avatar }, ...players.slice(1)]} onSwitch={setOpen} onClose={() => setOpen(null)} />}
        </View>
      </Modal>
      {!open && tab !== 'history' && (
        <Pressable style={s.fab} onPress={() => setTab('history')} accessibilityLabel="Oyun geçmişi">
          <Ionicons name="time" size={20} color={semantic.actionInk} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  tab: { flex: 1, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
  tabOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  tabText: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  title: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { color: colors.textDim, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { backgroundColor: semantic.money, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  locked: { backgroundColor: colors.cardAlt },
  playText: { color: semantic.moneyInk, fontWeight: '900' },
  amount: { fontWeight: '900', fontSize: 15 },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 48, height: 48, borderRadius: 24, backgroundColor: semantic.action, alignItems: 'center', justifyContent: 'center' },
});
