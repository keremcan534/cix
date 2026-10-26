// Admin: team PK settings, live PKs, history and integrity records (spec §10). A running PK keeps the
// settings and scoring it started with; changes here apply to new PKs only.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/components/ui';
import { GIFTS } from '@/data/mock';
import { resolve } from '@/data/rbac';
import { PK_DURATIONS, cancelPk, finishNow, pointsFor, roomTitle, updateConfig, usePk, type PkSession } from '@/lib/pk';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

type Tab = 'settings' | 'points' | 'live' | 'history' | 'integrity';

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
const describe = (p: PkSession) =>
  `${p.kind === 'cross' ? `${roomTitle(p.roomId)} vs ${roomTitle(p.opponentRoomId!)}` : `${roomTitle(p.roomId)} · oda içi`} · ${p.durationMin} dk · ${p.teams[0].score}–${p.teams[1].score} · ayar v${p.configVersion}`;

export default function PkAdmin() {
  const { rbac } = useApp();
  const { config, sessions, audit, duplicates, mismatches } = usePk();
  const [tab, setTab] = useState<Tab>('settings');
  const [restrict, setRestrict] = useState('');
  const can = resolve(rbac, 'me', 'pk.manage', { type: 'platform' });
  if (!can.allowed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Takım PK yönetimi" />
        <Text style={[s.dim, { padding: 16 }]}>Bu ekran için PK yönetimi yetkisi gerekiyor. {can.reason}</Text>
      </SafeAreaView>
    );
  const live = sessions.filter((x) => ['invite', 'prep', 'active'].includes(x.status));
  const past = sessions.filter((x) => x.status === 'done' || x.status === 'cancelled');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Takım PK yönetimi" />
      <View style={{ paddingHorizontal: 16 }}>
        <Chips
          value={tab}
          options={[
            ['settings', 'Ayarlar'],
            ['points', 'Hediye puanları'],
            ['live', `Aktif · ${live.length}`],
            ['history', 'Geçmiş'],
            ['integrity', 'Kayıtlar'],
          ]}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {tab === 'settings' && (
          <>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>Modlar · ayar sürümü v{config.version}</Text>
              <Row label="Oda içi takım PK" value={config.roomPkEnabled} onChange={(v) => updateConfig({ roomPkEnabled: v })} />
              <Row label="Odalar arası takım PK" value={config.crossPkEnabled} onChange={(v) => updateConfig({ crossPkEnabled: v })} />
              <Text style={s.dim}>1v1 / bireysel PK bu modülde yoktur.</Text>
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>İzinli süreler</Text>
              {PK_DURATIONS.map((d) => (
                <Row key={d} label={`${d} dakika`} value={config.durations[d]} onChange={(v) => updateConfig({ durations: { ...config.durations, [d]: v } })} />
              ))}
              <Text style={s.dim}>Başka süre eklenemez. Devam eden PK’lar başladıkları süreyle biter.</Text>
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>Takımlar</Text>
              <Text style={s.label}>Takım başına en az</Text>
              <Chips value={config.teamMin} options={[1, 2, 3].map((n) => [n, String(n)] as [number, string])} onChange={(v) => updateConfig({ teamMin: v })} />
              <Text style={s.label}>Takım başına en fazla</Text>
              <Chips value={config.teamMax} options={[3, 4, 6, 8, 10].map((n) => [n, String(n)] as [number, string])} onChange={(v) => updateConfig({ teamMax: v })} />
              <Text style={s.label}>Takım adları</Text>
              <TextInput defaultValue={config.teamNames.red} onEndEditing={(e) => updateConfig({ teamNames: { ...config.teamNames, red: e.nativeEvent.text || 'Kırmızı Takım' } })} style={s.input} />
              <TextInput defaultValue={config.teamNames.blue} onEndEditing={(e) => updateConfig({ teamNames: { ...config.teamNames, blue: e.nativeEvent.text || 'Mavi Takım' } })} style={s.input} />
              <Text style={s.label}>Davet yanıt süresi</Text>
              <Chips value={config.inviteTimeoutSec} options={[30, 60, 120].map((n) => [n, `${n} sn`] as [number, string])} onChange={(v) => updateConfig({ inviteTimeoutSec: v })} />
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>Kısıtlamalar (kullanıcı veya oda ID)</Text>
              <View style={s.row}>
                <TextInput value={restrict} onChangeText={setRestrict} placeholder="ör. u6 veya r2" placeholderTextColor={colors.textDim} style={[s.input, { flex: 1 }]} autoCapitalize="none" />
                <Pressable
                  style={s.small}
                  onPress={() => {
                    if (restrict.trim()) updateConfig({ restricted: [...new Set([...config.restricted, restrict.trim()])] });
                    setRestrict('');
                  }}
                >
                  <Text style={s.chipText}>Ekle</Text>
                </Pressable>
              </View>
              {config.restricted.map((x) => (
                <View key={x} style={s.row}>
                  <Text style={s.label}>{x}</Text>
                  <Pressable style={s.small} onPress={() => updateConfig({ restricted: config.restricted.filter((y) => y !== x) })}>
                    <Text style={s.chipText}>Kaldır</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Sonuç kuralları</Text>
              <Text style={s.dim}>• Beraberlik: puanlar eşitse “Berabere” ilan edilir.</Text>
              <Text style={s.dim}>• Tek katılımcının bağlantısı koparsa PK sürer; takım kaybetmiş sayılmaz.</Text>
              <Text style={s.dim}>• Oda kapanırsa veya moderatör iptal ederse PK iptal edilir: kazanan yok, PK puanları geçersiz; gönderilen hediyeler alıcılarına ulaştığı için iade edilmez.</Text>
              <Text style={s.dim}>• Rakip oda daveti reddeder ya da süresinde yanıt vermezse PK başlamaz.</Text>
              <Text style={s.dim}>• Kaybeden takımdan ek jeton kesilmez.</Text>
            </Card>
          </>
        )}

        {tab === 'points' && (
          <Card style={{ gap: 8 }}>
            <Text style={s.dim}>Varsayılan: 1 jeton = 1 PK puanı. 0 yazılan hediye puan kazandırmaz. Değişiklik yalnızca yeni PK’lara uygulanır.</Text>
            {GIFTS.slice(0, 14).map((g) => (
              <View key={g.id} style={s.row}>
                <Text style={s.label}>
                  {g.emoji} {g.name} · {g.price} jeton
                </Text>
                <TextInput
                  defaultValue={String(pointsFor(config.giftPoints, g.id, g.price))}
                  keyboardType="number-pad"
                  onEndEditing={(e) => updateConfig({ giftPoints: { ...config.giftPoints, [g.id]: Math.max(0, Math.floor(Number(e.nativeEvent.text) || 0)) } })}
                  style={[s.input, { width: 90 }]}
                  accessibilityLabel={`${g.name} PK puanı`}
                />
              </View>
            ))}
          </Card>
        )}

        {tab === 'live' &&
          (live.length === 0 ? (
            <Text style={s.dim}>Şu an aktif PK yok.</Text>
          ) : (
            live.map((p) => (
              <Card key={p.id} style={{ gap: 6 }}>
                <Text style={s.title}>
                  {p.id} · {p.status}
                </Text>
                <Text style={s.dim}>{describe(p)}</Text>
                <View style={s.row}>
                  {p.status === 'active' && (
                    <Pressable style={s.small} onPress={() => finishNow(p.id)}>
                      <Text style={s.chipText}>Süreyi bitir (test)</Text>
                    </Pressable>
                  )}
                  <Pressable style={[s.small, { backgroundColor: 'rgba(217,58,69,0.2)' }]} onPress={() => cancelPk(p.id, 'Yönetici iptal etti')}>
                    <Text style={[s.chipText, { color: '#FF7A82' }]}>İptal et</Text>
                  </Pressable>
                  {p.kind === 'cross' && (
                    <Pressable style={s.small} onPress={() => cancelPk(p.id, `${roomTitle(p.opponentRoomId!)} kapandı`, 'Sistem')}>
                      <Text style={s.chipText}>Rakip oda kapandı (test)</Text>
                    </Pressable>
                  )}
                </View>
              </Card>
            ))
          ))}

        {tab === 'history' &&
          (past.length === 0 ? (
            <Text style={s.dim}>Henüz tamamlanan veya iptal edilen PK yok.</Text>
          ) : (
            past.map((p) => (
              <Card key={p.id} style={{ gap: 4 }}>
                <Text style={s.title}>
                  {p.id} · {p.status === 'done' ? (p.result?.winner === 'tie' ? 'Berabere' : `Kazanan: ${p.teams.find((t) => t.id === p.result?.winner)?.name}`) : 'İptal'}
                </Text>
                <Text style={s.dim}>{describe(p)}</Text>
                {p.cancelReason && <Text style={s.dim}>{p.cancelReason}</Text>}
                <Text style={s.dim}>{p.records.length} hediye kaydı · {p.records.filter((r) => r.status === 'Doğrulandı').length} geçerli</Text>
              </Card>
            ))
          ))}

        {tab === 'integrity' && (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Tutarlılık</Text>
              <Text style={s.dim}>Tekrar gönderilip reddedilen hediye işlemi: {duplicates}</Text>
              <Text style={s.dim}>Jetonu düşüp PK puanı yazılamayan işlem (düzeltme bekliyor): {mismatches.length}</Text>
              {mismatches.slice(0, 10).map((m) => (
                <Text key={m} style={s.dim}>
                  • {m}
                </Text>
              ))}
            </Card>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Denetim kayıtları</Text>
              {audit.length === 0 ? (
                <Text style={s.dim}>Henüz kayıt yok.</Text>
              ) : (
                audit.slice(0, 40).map((a) => (
                  <Text key={a.id} style={s.dim}>
                    {a.at} · {a.actor} · {a.action} · {a.target}
                    {a.note ? ` · ${a.note}` : ''}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  small: { borderRadius: 999, backgroundColor: colors.cardAlt, paddingHorizontal: 12, paddingVertical: 7 },
  input: { backgroundColor: colors.cardAlt, color: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
