// Admin: Lucky gift packages, odds, reward reserve, records (spec §8). Every change bumps the
// config version; each send keeps the odds it was drawn with, so past results stay auditable.
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { resolve } from '@/data/rbac';
import { pct } from '@/data/rules';
import {
  LUCKY_RECIPIENT_SHARE,
  ODDS_TOTAL,
  getLucky,
  maxMult,
  newGiftDraft,
  oddsLabel,
  saveGift,
  sendLucky,
  setForceNext,
  topUpPool,
  unavailable,
  updateConfig,
  useLucky,
  type LuckyGift,
} from '@/lib/lucky';
import { showAlert } from '@/lib/alert';
import { LuckyEditor } from '@/components/admin/lucky-editor';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

type Tab = 'packs' | 'budget' | 'history' | 'winners' | 'records';
const fmt = (n: number) => n.toLocaleString('tr-TR');

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const s = useStyles();
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

export default function LuckyAdmin() {
  const { rbac, spendCoins, addCoins } = useApp();
  const lucky = useLucky();
  const [tab, setTab] = useState<Tab>('packs');
  const [editing, setEditing] = useState<LuckyGift | null>(null);
  const can = resolve(rbac, 'me', 'lucky.manage', { type: 'platform' });
  const { colors } = useTheme();
  const s = useStyles();
  if (!can.allowed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Uğurlu hediye yönetimi" />
        <Text style={[s.dim, { padding: 16 }]}>Bu ekran için Uğurlu hediye yönetimi yetkisi gerekiyor. {can.reason}</Text>
      </SafeAreaView>
    );
  const { config } = lucky;
  const winners = lucky.records.filter((r) => r.mult >= 50);
  // Replays the latest send with the same transaction id: must return the first result, no new charge.
  const replayLast = () => {
    const last = lucky.records[0];
    if (!last) return showAlert('Kayıt yok', 'Önce odada bir Uğurlu hediye gönder.');
    const before = getLucky().spentTotal;
    const r = sendLucky({ txId: last.txId, userId: last.userId, userAge: 99, roomId: last.roomId, giftId: last.giftId, toId: last.toId, toName: userById(last.toId).name }, { spend: spendCoins, credit: addCoins });
    showAlert('Tekrar gönderim testi', r.ok && r.replay && getLucky().spentTotal === before ? `İlk sonuç döndü (×${r.record.mult}). İkinci kez jeton düşülmedi, ödül verilmedi.` : 'Beklenmeyen sonuç.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Uğurlu hediye yönetimi" />
      <View style={{ paddingHorizontal: 16 }}>
        <Chips
          value={tab}
          options={[
            ['packs', 'Paketler'],
            ['budget', 'Bütçe ve limitler'],
            ['history', `Geçmiş · ${lucky.records.length}`],
            ['winners', `Kazananlar · ${winners.length}`],
            ['records', 'Kayıtlar'],
          ]}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {tab === 'packs' && !editing && (
          <>
            <Text style={s.dim}>Ayar sürümü v{config.version}. Olasılıkların toplamı %100 olmayan paket açılamaz. Değişiklikler yalnızca yeni gönderimlere uygulanır.</Text>
            {config.gifts.map((g) => {
              const closed = unavailable(g);
              return (
                <Card key={g.id} style={{ gap: 6 }}>
                  <View style={s.row}>
                    <Text style={s.title}>
                      {g.emoji} {g.name} · {fmt(g.price)} jeton
                    </Text>
                    <Switch
                      value={g.enabled}
                      onValueChange={(v) => {
                        const err = saveGift({ ...g, enabled: v });
                        if (err) showAlert('Açılamadı', err);
                      }}
                    />
                  </View>
                  <Text style={s.dim}>
                    En yüksek ×{fmt(maxMult(g))} = {fmt(g.price * maxMult(g))} jeton · ödül yok {oddsLabel(g.tiers.find((t) => t.mult === 0)?.weight ?? 0)} · beklenen geri dönüş ×{(g.tiers.reduce((n, t) => n + t.mult * t.weight, 0) / ODDS_TOTAL).toFixed(2)}
                  </Text>
                  {closed && <Text style={[s.dim, { color: colors.gold }]}>{closed}</Text>}
                  <Pressable style={s.small} onPress={() => setEditing({ ...g, tiers: g.tiers.map((t) => ({ ...t })) })}>
                    <Text style={s.chipText}>Düzenle</Text>
                  </Pressable>
                </Card>
              );
            })}
            <Pressable style={s.small} onPress={() => setEditing(newGiftDraft())}>
              <Text style={s.chipText}>+ Yeni Uğurlu paketi</Text>
            </Pressable>
          </>
        )}

        {tab === 'packs' && editing && (
          <LuckyEditor
            draft={editing}
            onChange={setEditing}
            testPreset
            onSave={(g) => {
              const err = saveGift(g);
              if (err) return showAlert('Kaydedilemedi', err);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}

        {tab === 'budget' && (
          <>
            <Card style={{ gap: 6 }}>
              <Text style={s.title}>Ödül rezervi</Text>
              <Text style={s.big}>{fmt(lucky.pool)} jeton</Text>
              <Text style={s.dim}>
                Toplam harcanan {fmt(lucky.spentTotal)} · toplam ödenen {fmt(lucky.paidTotal)} · bugün ödenen {fmt(lucky.paidToday)} / {fmt(config.dailyPayoutLimit)}
              </Text>
              <Text style={s.dim}>Rezerv bir paketin en yüksek ödülünü karşılayamazsa o paket gönderim almadan önce kapanır; kullanıcıya karşılanamayacak ödül çıkmaz.</Text>
              <View style={s.row}>
                {[1_000_000, 10_000_000].map((n) => (
                  <Pressable key={n} style={s.small} onPress={() => topUpPool(n)}>
                    <Text style={s.chipText}>+{fmt(n)}</Text>
                  </Pressable>
                ))}
                <Pressable style={s.small} onPress={() => topUpPool(-lucky.pool + 1_000)}>
                  <Text style={s.chipText}>Rezervi 1.000’e düşür (test)</Text>
                </Pressable>
              </View>
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={s.label}>Her gönderimden rezerve aktarılan pay</Text>
              <Chips value={config.poolPct} options={[50, 60, 70, 80].map((n) => [n, `%${n}`] as [number, string])} onChange={(v) => updateConfig({ poolPct: v })} />
              <Text style={s.label}>Günlük toplam ödül limiti</Text>
              <Chips value={config.dailyPayoutLimit} options={[1_000_000, 5_000_000, 20_000_000, 100_000_000].map((n) => [n, fmt(n)] as [number, string])} onChange={(v) => updateConfig({ dailyPayoutLimit: v })} />
              <Text style={s.label}>Odada duyurulan en düşük çarpan</Text>
              <Chips value={config.announceFrom} options={[20, 50, 100, 500].map((n) => [n, `×${n}`] as [number, string])} onChange={(v) => updateConfig({ announceFrom: v })} />
              <Text style={s.dim}>Kullanıcı başına gönderim sınırı yok; jetonu yettiği kadar gönderebilir. Alıcıya hediye değerinin {pct(LUCKY_RECIPIENT_SHARE)}’si elmas olarak yazılır; PK’da da aynı {pct(LUCKY_RECIPIENT_SHARE)} puan sayılır (ödül sayılmaz).</Text>
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>Test araçları</Text>
              <Text style={s.dim}>Yalnızca bu demo panelinde. Kullanıcı ekranlarından sonuç seçilemez.</Text>
              <Text style={s.label}>Sonraki çekiliş sonucu{lucky.forceNext !== null ? ` · ×${lucky.forceNext} bekliyor` : ''}</Text>
              <View style={s.row}>
                {[0, 2, 10, 100, 1000].map((m) => (
                  <Pressable key={m} style={s.small} onPress={() => setForceNext(m)}>
                    <Text style={s.chipText}>{m ? `×${m}` : 'Ödül yok'}</Text>
                  </Pressable>
                ))}
                {lucky.forceNext !== null && (
                  <Pressable style={s.small} onPress={() => setForceNext(null)}>
                    <Text style={s.chipText}>Kaldır</Text>
                  </Pressable>
                )}
              </View>
              <Pressable style={s.small} onPress={replayLast}>
                <Text style={s.chipText}>Son isteği aynı kimlikle tekrar gönder</Text>
              </Pressable>
            </Card>
          </>
        )}

        {(tab === 'history' || tab === 'winners') &&
          ((tab === 'history' ? lucky.records : winners).length === 0 ? (
            <Text style={s.dim}>Henüz kayıt yok.</Text>
          ) : (
            (tab === 'history' ? lucky.records : winners).slice(0, 60).map((r) => (
              <Card key={r.txId} style={{ gap: 2 }}>
                <Text style={s.title}>
                  {r.emoji} {r.giftName} · {r.reward ? `×${fmt(r.mult)} · +${fmt(r.reward)}` : 'ödül yok'}
                </Text>
                <Text style={s.dim}>
                  {r.at} · {userById(r.userId).name} → {userById(r.toId).name} · harcanan {fmt(r.price)} · ayar v{r.configVersion} · {r.txId}
                </Text>
              </Card>
            ))
          ))}

        {tab === 'records' && (
          <>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Tutarlılık</Text>
              <Text style={s.dim}>Aynı işlem kimliğiyle tekrar gelen istek: {lucky.duplicates} (ücret ve ödül tekrar işlenmedi)</Text>
            </Card>
            <Card style={{ gap: 4 }}>
              <Text style={s.title}>Denetim ve yapılandırma kayıtları</Text>
              {lucky.audit.length === 0 ? (
                <Text style={s.dim}>Henüz kayıt yok.</Text>
              ) : (
                lucky.audit.slice(0, 50).map((a) => (
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

const useStyles = makeStyles(({ colors, semantic, dark, ink }) => ({
  title: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  big: { color: semantic.moneyText, fontWeight: '900', fontSize: 24 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.actionText, backgroundColor: dark ? 'rgba(19,217,223,0.15)' : 'rgba(0,140,148,0.09)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  small: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: dark ? colors.cardAlt : colors.card, paddingHorizontal: 12, paddingVertical: 7, ...(dark ? {} : { borderWidth: 1, borderColor: ink(0.12) }) },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
}));
