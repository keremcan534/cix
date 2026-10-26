// Admin: Lucky gift packages, odds, reward reserve, limits, records (spec §8). Every change bumps the
// config version; each send keeps the odds it was drawn with, so past results stay auditable.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { resolve } from '@/data/rbac';
import {
  DOC_TEST_TIERS,
  LUCKY_MULTS,
  ODDS_TOTAL,
  STANDARD_TIERS,
  getLucky,
  maxMult,
  newGiftDraft,
  oddsLabel,
  oddsSum,
  saveGift,
  sendLucky,
  setForceNext,
  topUpPool,
  unavailable,
  updateConfig,
  useLucky,
  validate,
  type LuckyGift,
} from '@/lib/lucky';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

type Tab = 'packs' | 'budget' | 'history' | 'winners' | 'records';
const fmt = (n: number) => n.toLocaleString('tr-TR');

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

export default function LuckyAdmin() {
  const { rbac, spendCoins, addCoins } = useApp();
  const lucky = useLucky();
  const [tab, setTab] = useState<Tab>('packs');
  const [editing, setEditing] = useState<LuckyGift | null>(null);
  const can = resolve(rbac, 'me', 'lucky.manage', { type: 'platform' });
  if (!can.allowed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Lucky hediye yönetimi" />
        <Text style={[s.dim, { padding: 16 }]}>Bu ekran için Lucky yönetimi yetkisi gerekiyor. {can.reason}</Text>
      </SafeAreaView>
    );
  const { config } = lucky;
  const winners = lucky.records.filter((r) => r.mult >= 50);
  // Replays the latest send with the same transaction id: must return the first result, no new charge.
  const replayLast = () => {
    const last = lucky.records[0];
    if (!last) return showAlert('Kayıt yok', 'Önce odada bir Lucky hediye gönder.');
    const before = getLucky().spentTotal;
    const r = sendLucky({ txId: last.txId, userId: last.userId, userAge: 99, roomId: last.roomId, giftId: last.giftId, toId: last.toId, toName: userById(last.toId).name }, { spend: spendCoins, credit: addCoins });
    showAlert('Tekrar gönderim testi', r.ok && r.replay && getLucky().spentTotal === before ? `İlk sonuç döndü (×${r.record.mult}). İkinci kez jeton düşülmedi, ödül verilmedi.` : 'Beklenmeyen sonuç.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Lucky hediye yönetimi" />
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
              <Text style={s.chipText}>+ Yeni Lucky paketi</Text>
            </Pressable>
          </>
        )}

        {tab === 'packs' && editing && <Editor draft={editing} onChange={setEditing} onDone={() => setEditing(null)} />}

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
              <Text style={s.label}>Kullanıcı başına günlük gönderim</Text>
              <Chips value={config.perUserDaily} options={[50, 200, 500, 1000].map((n) => [n, String(n)] as [number, string])} onChange={(v) => updateConfig({ perUserDaily: v })} />
              <Text style={s.label}>Dakikada en fazla gönderim (aşan şüpheli kaydına düşer)</Text>
              <Chips value={config.perMinute} options={[5, 10, 20, 60].map((n) => [n, String(n)] as [number, string])} onChange={(v) => updateConfig({ perMinute: v })} />
              <Text style={s.label}>Odada duyurulan en düşük çarpan</Text>
              <Chips value={config.announceFrom} options={[20, 50, 100, 500].map((n) => [n, `×${n}`] as [number, string])} onChange={(v) => updateConfig({ announceFrom: v })} />
              <View style={s.row}>
                <Text style={s.label}>Kazanılan ödül PK puanına eklensin (varsayılan kapalı)</Text>
                <Switch value={config.pkCountsReward} onValueChange={(v) => updateConfig({ pkCountsReward: v })} />
              </View>
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
              <Text style={s.dim}>Şüpheli işlem kaydı: {lucky.suspicious.length}</Text>
              {lucky.suspicious.slice(0, 10).map((x) => (
                <Text key={x} style={s.dim}>
                  • {x}
                </Text>
              ))}
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

/** Package editor: odds are typed as percentages; save is refused unless they add up to exactly 100 %. */
function Editor({ draft, onChange, onDone }: { draft: LuckyGift; onChange: (g: LuckyGift) => void; onDone: () => void }) {
  const sum = oddsSum(draft.tiers);
  const bad = validate(draft);
  const pctText = (g: LuckyGift) => Object.fromEntries([0, ...LUCKY_MULTS].map((m) => [m, String((g.tiers.find((t) => t.mult === m)?.weight ?? 0) / 1000).replace('.', ',')]));
  // Inputs keep what was typed (e.g. "0," mid-entry); the draft always holds the parsed odds.
  const [texts, setTexts] = useState<Record<number, string>>(() => pctText(draft));
  const applyPreset = (tiers: LuckyGift['tiers']) => {
    const next = { ...draft, tiers: tiers.map((t) => ({ ...t })) };
    onChange(next);
    setTexts(pctText(next));
  };
  const setWeight = (mult: number, pct: string) => {
    const w = Math.max(0, Math.round((Number(pct.replace(',', '.')) || 0) * 1000));
    const has = draft.tiers.some((t) => t.mult === mult);
    const tiers = has ? draft.tiers.map((t) => (t.mult === mult ? { ...t, weight: w } : t)) : [...draft.tiers, { mult, weight: w }];
    onChange({ ...draft, tiers: tiers.sort((a, b) => a.mult - b.mult) });
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={s.title}>Paket düzenle</Text>
      <View style={s.row}>
        <TextInput value={draft.emoji} onChangeText={(t) => onChange({ ...draft, emoji: t })} style={[s.input, { width: 56 }]} accessibilityLabel="Emoji" />
        <TextInput value={draft.name} onChangeText={(t) => onChange({ ...draft, name: t })} style={[s.input, { flex: 1 }]} accessibilityLabel="Ad" />
      </View>
      <View style={s.row}>
        <Text style={s.label}>Fiyat (jeton)</Text>
        <TextInput value={String(draft.price)} keyboardType="number-pad" onChangeText={(t) => onChange({ ...draft, price: Math.max(0, Math.floor(Number(t) || 0)) })} style={[s.input, { width: 100 }]} accessibilityLabel="Fiyat" />
      </View>
      <Text style={s.label}>Olasılıklar (%). Bir çarpanı kapatmak için 0 yaz.</Text>
      {[0, ...LUCKY_MULTS].map((m) => (
        <View key={m} style={s.row}>
          <Text style={[s.label, { flex: 0, width: 80 }]} numberOfLines={1}>{m ? `×${fmt(m)}` : 'Ödül yok'}</Text>
          <TextInput
            value={texts[m]}
            keyboardType="decimal-pad"
            onChangeText={(t) => {
              setTexts((x) => ({ ...x, [m]: t }));
              setWeight(m, t);
            }}
            style={[s.input, { width: 90 }]} accessibilityLabel={`${m ? `×${m}` : 'Ödül yok'} olasılığı`} />
          <Text style={s.dim}>{m ? `${fmt(draft.price * m)} jeton` : ''}</Text>
        </View>
      ))}
      <Text style={[s.dim, { color: sum === ODDS_TOTAL ? semantic.success : colors.gold }]}>Toplam {oddsLabel(sum)}{sum === ODDS_TOTAL ? ' ✓' : ' · %100 olmalı'}</Text>
      <View style={s.row}>
        <Pressable style={s.small} onPress={() => applyPreset(STANDARD_TIERS)}>
          <Text style={s.chipText}>Standart oranlar</Text>
        </Pressable>
        <Pressable style={s.small} onPress={() => applyPreset(DOC_TEST_TIERS)}>
          <Text style={s.chipText}>Belgedeki test tablosu</Text>
        </Pressable>
      </View>
      <View style={s.row}>
        <Text style={s.label}>Paket açık</Text>
        <Switch value={draft.enabled} onValueChange={(v) => onChange({ ...draft, enabled: v })} />
      </View>
      {bad && <Text style={[s.dim, { color: colors.gold }]}>{bad}</Text>}
      <View style={s.row}>
        <Pressable
          style={[s.small, { backgroundColor: semantic.action }]}
          onPress={() => {
            const err = saveGift(draft);
            if (err) return showAlert('Kaydedilemedi', err);
            onDone();
          }}
        >
          <Text style={[s.chipText, { color: semantic.actionInk }]}>Kaydet</Text>
        </Pressable>
        <Pressable style={s.small} onPress={onDone}>
          <Text style={s.chipText}>Vazgeç</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
  big: { color: semantic.money, fontWeight: '900', fontSize: 24 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  small: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: colors.cardAlt, paddingHorizontal: 12, paddingVertical: 7 },
  input: { backgroundColor: colors.cardAlt, color: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
