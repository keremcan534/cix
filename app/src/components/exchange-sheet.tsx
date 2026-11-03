// Gelir > Çevir: turn your own diamonds into coins at the in-app coin price (lib/coins-bank exchangeOwnDiamonds).
// A bottom sheet with the amount, quick shares of the balance, a live "x 💎 → y jeton" preview and one button.
// Only the withdrawable part can be exchanged; locked diamonds (lib/diamond-locks) wait for their lock.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { RULES } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { successHaptic } from '@/lib/haptics';
import { liveExchange, liveMode, message } from '@/lib/live';
import { exchangeOwnDiamonds, selfExchangeRate } from '@/lib/coins-bank';
import { blockedFeature } from '@/lib/remote-control';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const SHARES = [
  { label: '%25', f: 0.25 },
  { label: '%50', f: 0.5 },
  { label: '%75', f: 0.75 },
  { label: 'Tümü', f: 1 },
];
/** How many coins a round 10.000 💎 buys, for the rate line. */
const PER_10K = Math.floor(10_000 * selfExchangeRate());

export function ExchangeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { diamonds, withdrawableDiamonds: free, lockedDiamonds: locked, coins, exchangeDiamonds, notify } = useApp();
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const [raw, setRaw] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const amount = Number(raw || 0);
  const exchangeQuote = exchangeOwnDiamonds(amount, diamonds);
  // Same order as the store: the amount itself first, then whether the locked part is in it.
  const quote = exchangeQuote.ok && amount > free ? { ok: false as const, reason: `${fmt(locked)} elmasın kilidi henüz açılmadı; çekilebilir bakiyen ${fmt(free)} elmas.` } : exchangeQuote;
  const tooFew = free < RULES.exchangeMinDiamonds;

  const close = () => {
    setRaw('');
    onClose();
  };
  const submit = () => {
    // Live mode: the server exchanges (its own rate and locks); the new balance reaches the store from there.
    if (liveMode()) {
      if (busy || blockedFeature('exchange')) return;
      setBusy(true);
      liveExchange(amount)
        .then((got) => {
          successHaptic();
          notify({ kind: 'finance', icon: 'swap-horizontal', title: 'Elmasların jetona çevrildi', body: `${fmt(amount)} elmas → ${fmt(got)} jeton cüzdanına eklendi.`, href: '/cuzdan' });
          close();
        })
        .catch((e) => showAlert('Çevrilemedi', message(e)))
        .finally(() => setBusy(false));
      return;
    }
    const r = exchangeDiamonds(amount);
    if (!r.ok) return;
    successHaptic();
    notify({ kind: 'finance', icon: 'swap-horizontal', title: 'Elmasların jetona çevrildi', body: `${fmt(amount)} elmas → ${fmt(r.coins)} jeton cüzdanına eklendi.`, href: '/cuzdan' });
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Kapat" />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.head}>
            <Text style={s.title}>Jetona çevir</Text>
            <Pressable onPress={close} hitSlop={10} style={s.closeBtn} accessibilityLabel="Kapat">
              <Ionicons name="close" size={18} color={colors.textDim} />
            </Pressable>
          </View>
          <Text style={s.sub}>Elmasların, uygulamadaki jeton fiyatıyla anında jetona dönüşür. Ücret kesilmez.</Text>

          <View style={[s.field, focused && { borderColor: semantic.actionText }]}>
            <Icon3D name="diamond" size={26} />
            <TextInput
              value={raw ? fmt(amount) : ''}
              onChangeText={(t) => setRaw(t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textDim}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={s.input}
              accessibilityLabel="Çevrilecek elmas"
            />
            <Text style={s.unit}>elmas</Text>
          </View>
          <Text style={s.balance}>
            Çekilebilir: {fmt(free)} 💎{locked > 0 ? ` · Kilitli: ${fmt(locked)} 💎` : ''}
          </Text>

          <View style={s.chips}>
            {SHARES.map((c) => {
              const n = Math.floor(free * c.f);
              const on = raw !== '' && amount === n;
              return (
                <Pressable key={c.label} disabled={n < RULES.exchangeMinDiamonds} onPress={() => setRaw(String(n))} style={[s.chip, on && s.chipOn, n < RULES.exchangeMinDiamonds && { opacity: 0.4 }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && { color: semantic.actionInk }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.preview}>
            <View style={s.side}>
              <Text style={s.sideLabel}>VERİLEN</Text>
              <View style={s.sideRow}>
                <Icon3D name="diamond" size={20} />
                <Text style={[s.sideN, s.diamondN]} numberOfLines={1} adjustsFontSizeToFit>{fmt(amount)}</Text>
              </View>
            </View>
            <View style={s.arrow}>
              <Ionicons name="arrow-forward" size={18} color={semantic.actionInk} />
            </View>
            <View style={[s.side, { alignItems: 'flex-end' }]}>
              <Text style={s.sideLabel}>ALINAN</Text>
              <View style={s.sideRow}>
                <Icon3D name="coin" size={20} />
                <Text style={[s.sideN, { color: semantic.moneyText }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(quote.ok ? quote.coins : 0)}</Text>
              </View>
            </View>
          </View>
          <Text style={s.rate}>
            Kur: 10.000 💎 = {fmt(PER_10K)} jeton · En az {fmt(RULES.exchangeMinDiamonds)} elmas
          </Text>
          <Text style={[s.note, !quote.ok && raw !== '' && { color: semantic.danger }]}>
            {tooFew
              ? locked > 0
                ? `Çevirmek için en az ${fmt(RULES.exchangeMinDiamonds)} çekilebilir elmas gerekir; kilitli elmasların açılınca çevirebilirsin.`
                : `Çevirmek için en az ${fmt(RULES.exchangeMinDiamonds)} elmas gerekir.`
              : !quote.ok && raw !== ''
                ? quote.reason
                : `Çeviriden sonra: ${fmt(diamonds - (quote.ok ? amount : 0))} 💎 · ${fmt(coins + (quote.ok ? quote.coins : 0))} jeton`}
          </Text>

          <Button title={quote.ok ? `${fmt(quote.coins)} jetona çevir` : 'Çevir'} icon="swap-horizontal" variant="money" disabled={!quote.ok || busy} onPress={submit} />
          <Text style={s.fine}>Çevrilen elmas nakde dönmez; jetonları hediye, oyun ve mağazada kullanabilirsin.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.6)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: 1,
    borderColor: ink(0.12),
    boxShadow: dark ? '0 -10px 30px rgba(0,0,0,0.45)' : '0 -1px 2px rgba(16,36,64,0.05), 0 -10px 30px rgba(16,36,64,0.12)',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: -4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, height: 64 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 0, outlineStyle: 'none' } as object,
  unit: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  balance: { color: colors.textDim, fontSize: 12, marginTop: -6, marginLeft: 4 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 18, padding: 14 },
  side: { flex: 1, gap: 4 },
  sideLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideN: { color: colors.text, fontSize: 20, fontWeight: '800', flexShrink: 1 },
  // The diamonds given: white in the dark scheme (as before), the diamond's blue on the light one.
  diamondN: { color: dark ? colors.text : semantic.diamondText },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: semantic.action, alignItems: 'center', justifyContent: 'center' },
  rate: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  note: { color: colors.text, fontSize: 13, textAlign: 'center', marginTop: -6 },
  fine: { color: colors.textDim, fontSize: 11, textAlign: 'center', lineHeight: 16 },
}));
