// Server account (docs/SUNUCU.md): the account, balances and ledger kept in our database, with test top-ups and
// gifts that go through the real API. The rest of the app still runs on local prototype state; this screen is
// where the server wallet can be seen and tried until the wallet screens move over.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Card, Header } from '@/components/ui';
import { apiEnabled, ensureSignedIn, gift, ledger, newRef, testTopup, type ServerLedgerRow, type ServerUser } from '@/lib/api';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const CURRENCY = { coin: '🪙 jeton', diamond: '💎 elmas', game: '🎮 oyun' } as const;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function ServerAccount() {
  const { me } = useApp();
  const [user, setUser] = useState<ServerUser | null>(null);
  const [rows, setRows] = useState<ServerLedgerRow[]>([]);
  const [busy, setBusy] = useState(apiEnabled);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('100');
  // One request id per gift attempt: a retry after a lost answer reuses it, so the gift is never sent twice.
  const [giftRef, setGiftRef] = useState(newRef);

  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      setUser(await ensureSignedIn(me.name));
      setRows(await ledger());
      if (text) setMsg({ text });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  }, [me.name]);

  // First load: sign in (creating the server account the first time) and read the ledger.
  useEffect(() => {
    if (!apiEnabled()) return;
    let live = true;
    (async () => {
      try {
        const u = await ensureSignedIn(me.name);
        const r = await ledger();
        if (live) {
          setUser(u);
          setRows(r);
        }
      } catch (e) {
        if (live) setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [me.name]);

  if (!apiEnabled()) {
    return (
      <SafeAreaView style={s.page}>
        <Header title="Sunucu hesabı" />
        <Text style={[s.dim, { padding: 16 }]}>Sunucu adresi ayarlı değil (EXPO_PUBLIC_API_URL). Uygulama yerel prototip verisiyle çalışıyor.</Text>
      </SafeAreaView>
    );
  }

  const sendGift = () =>
    run(async () => {
      const n = Number(amount);
      const r = await gift(to.trim(), n, giftRef);
      setGiftRef(newRef());
      return r.replay ? 'Bu hediye zaten gönderilmişti, ikinci kez düşülmedi.' : `${fmt(n)} jeton hediye gönderildi; alıcıya ${fmt(n)} elmas yazıldı.`;
    });

  return (
    <SafeAreaView style={s.page}>
      <Header title="Sunucu hesabı" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 6 }}>
          <Text style={s.title}>{user ? user.name : busy ? 'Giriş yapılıyor…' : 'Giriş yapılmadı'}</Text>
          {user && (
            <>
              <Text style={s.dim} selectable>
                Hesap kimliği: {user.id}
              </Text>
              <View style={s.balances}>
                <Text style={s.balance}>🪙 {fmt(user.coins)}</Text>
                <Text style={s.balance}>💎 {fmt(user.diamonds)}</Text>
                <Text style={s.balance}>🎮 {fmt(user.gameCoins)}</Text>
              </View>
            </>
          )}
          <Text style={s.dim}>Bu bakiye sunucudaki veritabanında. Uygulamanın diğer ekranları henüz yerel prototip bakiyesini gösteriyor.</Text>
        </Card>

        {msg && <Text style={[s.msg, msg.bad && { color: colors.gold }]}>{msg.text}</Text>}

        <Card style={{ gap: 10 }}>
          <Text style={s.title}>Test yüklemesi</Text>
          <Text style={s.dim}>Gerçek ödeme yok; günde en fazla 50.000 jeton. Yalnızca test için.</Text>
          <View style={s.row}>
            {[1000, 5000, 10000].map((n) => (
              <Pressable key={n} style={[s.chip, busy && s.off]} disabled={busy || !user} onPress={() =>
                  run(async () => {
                    await testTopup(n);
                    return `${fmt(n)} jeton yüklendi.`;
                  })
                }>
                <Text style={s.chipText}>+{fmt(n)}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={s.title}>Hediye gönder</Text>
          <Text style={s.dim}>Jetonun alıcıya bire bir elmas olarak yazılır. Alıcının hesap kimliğini onun bu ekranından kopyala.</Text>
          <TextInput style={s.input} value={to} onChangeText={setTo} placeholder="Alıcının hesap kimliği" placeholderTextColor={colors.textDim} autoCapitalize="none" accessibilityLabel="Alıcının hesap kimliği" />
          <TextInput style={s.input} value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Jeton" placeholderTextColor={colors.textDim} accessibilityLabel="Hediye miktarı" />
          <Pressable style={[s.btn, (busy || !user || !to.trim() || !Number(amount)) && s.off]} disabled={busy || !user || !to.trim() || !Number(amount)} onPress={sendGift}>
            <Text style={s.btnText}>Gönder · {fmt(Number(amount) || 0)} jeton</Text>
          </Pressable>
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.title}>İşlem kaydı</Text>
            <Pressable disabled={busy} onPress={() => run(async () => {})}>
              <Text style={s.link}>Yenile</Text>
            </Pressable>
          </View>
          {rows.length === 0 && <Text style={s.dim}>Henüz işlem yok.</Text>}
          {rows.map((r) => (
            <View key={r.id} style={s.ledgerRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>{r.reason}</Text>
                <Text style={s.dim}>
                  {new Date(r.created_at).toLocaleString('tr-TR')} · bakiye {fmt(r.balance)}
                </Text>
              </View>
              <Text style={[s.amount, { color: r.amount > 0 ? semantic.money : colors.textDim }]}>
                {r.amount > 0 ? '+' : ''}
                {fmt(r.amount)} {CURRENCY[r.currency]}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  msg: { color: semantic.money, fontWeight: '700', textAlign: 'center' },
  balances: { flexDirection: 'row', gap: 18, marginVertical: 4 },
  balance: { color: '#fff', fontWeight: '900', fontSize: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  chipText: { color: '#fff', fontWeight: '800' },
  input: { backgroundColor: colors.cardAlt, color: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btn: { backgroundColor: semantic.money, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: semantic.moneyInk, fontWeight: '900' },
  off: { opacity: 0.5 },
  link: { color: '#fff', fontWeight: '600' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  amount: { fontWeight: '800', fontSize: 13 },
});
