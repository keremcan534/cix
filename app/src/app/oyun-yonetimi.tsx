// Admin: the two independent game catalogs (spec §6). Changes apply to both entry points at once,
// because profile and rooms read the same platform state (lib/games).
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gameArtOf } from '@/components/GameArt';
import { Card, Header } from '@/components/ui';
import type { CasinoGame } from '@/data/games';
import { resolve } from '@/data/rbac';
import { updateCasino, updateRoomGame, useGames } from '@/lib/games';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[s.chip, value === v && s.chipOn]}>
          <Text style={s.chipText}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

/** Game name line: the game's 3D cover when it has one, otherwise its emoji. */
function GameTitle({ id, emoji, children }: { id: string; emoji: string; children: React.ReactNode }) {
  const art = gameArtOf(id);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {art && <Image source={art} style={{ width: 22, height: 22 }} />}
      <Text style={[s.title, { flexShrink: 1 }]}>
        {art ? '' : `${emoji} `}
        {children}
      </Text>
    </View>
  );
}

export default function GameAdmin() {
  const { rbac } = useApp();
  const { roomGames, casino, history, bank } = useGames();
  const [tab, setTab] = useState<'room' | 'casino'>('room');
  const can = resolve(rbac, 'me', 'games.manage', { type: 'platform' });

  if (!can.allowed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Oyun kataloğu" />
        <Text style={[s.dim, { padding: 16 }]}>Bu ekran için “Oyun kataloğu” yetkisi gerekiyor. {can.reason}</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Oyun kataloğu" />
      <View style={[s.chips, { paddingHorizontal: 16 }]}>
        <Chips
          value={tab}
          options={[
            ['room', 'Ücretsiz oda oyunları'],
            ['casino', 'Casino (Servet Lv.2)'],
          ]}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {tab === 'room' &&
          roomGames.map((g) => (
            <Card key={g.id} style={{ gap: 8 }}>
              <GameTitle id={g.id} emoji={g.emoji}>
                {g.name} <Text style={s.dim}>· {g.provider} · v{g.version} · {g.phase}. aşama</Text>
              </GameTitle>
              <Row label="Aktif" value={g.active} onChange={(v) => updateRoomGame(g.id, { active: v })} />
              <Text style={s.label}>Maksimum oyuncu</Text>
              <Chips value={g.maxPlayers} options={[2, 4, 6, 10, 20].filter((n) => n >= g.minPlayers).map((n) => [n, String(n)] as [number, string])} onChange={(v) => updateRoomGame(g.id, { maxPlayers: v })} />
              <Text style={s.label}>Odada kim başlatır?</Text>
              <Chips
                value={g.startBy}
                options={[
                  ['anyone', 'Herkes'],
                  ['owner_mod', 'Oda sahibi / yönetici'],
                ]}
                onChange={(v) => updateRoomGame(g.id, { startBy: v })}
              />
              <Row label="Başladıktan sonra katılım" value={g.joinAfterStart} onChange={(v) => updateRoomGame(g.id, { joinAfterStart: v })} />
              <Text style={s.label}>Tur süresi</Text>
              <Chips value={g.roundSeconds} options={[120, 300, 600, 900].map((n) => [n, `${n / 60} dk`] as [number, string])} onChange={(v) => updateRoomGame(g.id, { roundSeconds: v })} />
              <Row label="Skor tablosu" value={g.leaderboard} onChange={(v) => updateRoomGame(g.id, { leaderboard: v })} />
              <Text style={s.dim}>VIP zorunluluğu: kapalı (oda oyunlarında değiştirilemez).</Text>
            </Card>
          ))}
        {tab === 'casino' && (
          <>
            {casino.map((g) => (
              <Card key={g.id} style={{ gap: 8 }}>
                <GameTitle id={g.id} emoji={g.emoji}>
                  {g.name} <Text style={s.dim}>· {g.provider}</Text>
                </GameTitle>
                <Row label="Aktif" value={g.active} onChange={(v) => updateCasino(g.id, { active: v })} />
                <Text style={s.label}>Minimum VIP seviyesi</Text>
                <Chips value={g.minWealth} options={[1, 2, 3, 5, 10].map((n) => [n, `Servet Lv.${n}`] as [number, string])} onChange={(v) => updateCasino(g.id, { minWealth: v })} />
                <Row label="Profildeki Oyun Merkezi'nden" value={g.fromProfile} onChange={(v) => updateCasino(g.id, { fromProfile: v })} />
                <Row label="Oda içinden" value={g.fromRoom} onChange={(v) => updateCasino(g.id, { fromRoom: v })} />
                <Text style={s.label}>Günlük limit (kullanıcı başına)</Text>
                <Chips value={g.dailyLimit} options={[1000, 3000, 5000, 20000].map((n) => [n, `${n.toLocaleString('tr-TR')} jeton`] as [number, string])} onChange={(v) => updateCasino(g.id, { dailyLimit: v })} />
                <Text style={s.label}>Sağlayıcı bağlantısı</Text>
                <Chips<CasinoGame['providerStatus']>
                  value={g.providerStatus}
                  options={[
                    ['online', '🟢 Çevrimiçi'],
                    ['down', '🔴 Bakımda'],
                    ['error', '🟠 Hata (test: tur iade edilir)'],
                  ]}
                  onChange={(v) => updateCasino(g.id, { providerStatus: v })}
                />
                <Text style={s.dim}>
                  Bahisler: {g.bets.join(' / ')} jeton · {g.rules}
                </Text>
                <Text style={s.dim}>Lisans: {g.license}</Text>
              </Card>
            ))}
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Kasa defteri</Text>
              <Text style={s.dim}>Kural: oynanan jetonun %60’ı kasaya kalır, %40’ı ödül havuzuna girer ve kazananlara rastgele dağılır. Ödüller yalnızca havuzdan ödenir.</Text>
              <Text style={s.dim}>
                Oynanan {bank.wagered.toLocaleString('tr-TR')} · Kasa {bank.house.toLocaleString('tr-TR')} · Dağıtılan {bank.paid.toLocaleString('tr-TR')} · Havuz {bank.pool.toLocaleString('tr-TR')} (başlangıç avansı {bank.seed.toLocaleString('tr-TR')})
              </Text>
            </Card>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Son oyun işlemleri</Text>
              {history.length === 0 ? (
                <Text style={s.dim}>Henüz işlem yok.</Text>
              ) : (
                history.slice(0, 15).map((h) => (
                  <Text key={h.requestId + h.txId} style={s.dim}>
                    {h.time} · {h.gameName} · {h.status} · {h.bet}→{h.payout} · {h.entry} · {h.txId}
                  </Text>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  title: { color: '#fff', fontWeight: '800', fontSize: 15 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
});
