// One Uğurlu package's editor (Yönetim › Uğurlu hediyeler, and the offline demo's admin screen). Odds are typed as
// percentages; the total shows live, and a package whose odds don't add up to exactly 100 % can't be opened.
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Card } from '@/components/ui';
import { DOC_TEST_TIERS, LUCKY_MULTS, ODDS_TOTAL, STANDARD_TIERS, oddsLabel, oddsSum, validate, type LuckyGift } from '@/lib/lucky';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** `testPreset`: offers the spec's test table (every send wins); only the offline demo shows it. */
export function LuckyEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  busy = false,
  testPreset = false,
}: {
  draft: LuckyGift;
  onChange: (g: LuckyGift) => void;
  onSave: (g: LuckyGift) => void;
  onCancel: () => void;
  busy?: boolean;
  testPreset?: boolean;
}) {
  const sum = oddsSum(draft.tiers);
  const bad = validate(draft);
  const { colors, semantic } = useTheme();
  const s = useStyles();
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
        <TextInput value={draft.emoji} onChangeText={(t) => onChange({ ...draft, emoji: t })} style={[s.input, { width: 56 }]} accessibilityLabel="Simge" />
        <TextInput value={draft.name} onChangeText={(t) => onChange({ ...draft, name: t })} style={[s.input, { flex: 1 }]} accessibilityLabel="Ad" maxLength={30} />
      </View>
      <View style={s.row}>
        <Text style={s.label}>Fiyat (jeton)</Text>
        <TextInput value={String(draft.price)} keyboardType="number-pad" onChangeText={(t) => onChange({ ...draft, price: Math.max(0, Math.floor(Number(t) || 0)) })} style={[s.input, { width: 100 }]} accessibilityLabel="Fiyat" />
      </View>
      <Text style={s.label}>Olasılıklar (%). Bir çarpanı kapatmak için 0 yaz. Ödül jeton olarak ödenir.</Text>
      {[0, ...LUCKY_MULTS].map((m) => (
        <View key={m} style={s.row}>
          <Text style={[s.label, { flex: 0, width: 80 }]} numberOfLines={1}>
            {m ? `×${fmt(m)}` : 'Ödül yok'}
          </Text>
          <TextInput
            value={texts[m]}
            keyboardType="decimal-pad"
            onChangeText={(t) => {
              setTexts((x) => ({ ...x, [m]: t }));
              setWeight(m, t);
            }}
            style={[s.input, { width: 90 }]}
            accessibilityLabel={`${m ? `×${m}` : 'Ödül yok'} olasılığı`}
          />
          <Text style={s.dim}>{m ? `${fmt(draft.price * m)} jeton` : ''}</Text>
        </View>
      ))}
      <Text style={[s.dim, { color: sum === ODDS_TOTAL ? semantic.successText : colors.gold }]}>
        Toplam {oddsLabel(sum)}
        {sum === ODDS_TOTAL ? ' ✓' : ' · %100 olmalı'} · beklenen geri dönüş ×{(draft.tiers.reduce((n, t) => n + t.mult * t.weight, 0) / ODDS_TOTAL).toFixed(2)}
      </Text>
      <View style={s.row}>
        <Pressable style={s.small} onPress={() => applyPreset(STANDARD_TIERS)}>
          <Text style={s.chipText}>Standart oranlar</Text>
        </Pressable>
        {testPreset && (
          <Pressable style={s.small} onPress={() => applyPreset(DOC_TEST_TIERS)}>
            <Text style={s.chipText}>Belgedeki test tablosu</Text>
          </Pressable>
        )}
      </View>
      <View style={s.row}>
        <Text style={s.label}>Paket açık</Text>
        <Switch value={draft.enabled} onValueChange={(v) => onChange({ ...draft, enabled: v })} />
      </View>
      {bad && <Text style={[s.dim, { color: colors.gold }]}>{bad}</Text>}
      <View style={s.row}>
        <Pressable style={[s.small, { backgroundColor: semantic.action }, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => onSave(draft)} accessibilityRole="button">
          <Text style={[s.chipText, { color: semantic.actionInk }]}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</Text>
        </Pressable>
        <Pressable style={s.small} onPress={onCancel} accessibilityRole="button">
          <Text style={s.chipText}>Vazgeç</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, dark, ink }) => ({
  title: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  small: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: dark ? colors.cardAlt : colors.card, paddingHorizontal: 12, paddingVertical: 7, ...(dark ? {} : { borderWidth: 1, borderColor: ink(0.12) }) },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
}));
