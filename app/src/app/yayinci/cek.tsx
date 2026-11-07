import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button, Card, Header } from '@/components/ui';
import { RULES, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { diamondValueTl } from '@/lib/coins-bank';
import { liveMode, message } from '@/lib/live';
import { cancelWithdraw, liveWithdraw, loadBanks, sellToBank, useServerWithdrawals, type JetonBank, type ServerWithdrawal } from '@/lib/live/withdraw';
import { blockedFeature } from '@/lib/remote-control';
import { suggestedWithdraw, withdrawPresets } from '@/lib/withdraw-form';
import { checkWithdraw, formatIban, maskAccount, withdrawUsd, type WithdrawMethod } from '@/lib/withdraw-rules';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** How the diamonds leave: a payout request (IBAN, other) or straight to a Jeton Noktası, who pays in TL. */
type Way = WithdrawMethod | 'jeton';
const METHODS: [Way, string][] = [
  ['iban', 'IBAN'],
  ['jeton', 'Jeton Noktası'],
  ['other', 'Diğer'],
];
const tl = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
/** A USD amount as the server sends it ("$10.01"). */
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Withdraw() {
  // Only the withdrawable part can be paid out; locked diamonds (lib/diamond-locks) wait for their lock.
  const app = useApp();
  const { requestWithdraw, withdrawals } = app;
  const live = liveMode();
  const server = useServerWithdrawals();
  // Live mode: the server's numbers once its answer is in (the store's balance until then).
  const fromServer = live && server.loaded;
  const diamonds = fromServer ? server.withdrawable : app.withdrawableDiamonds;
  const locked = fromServer ? server.locked : app.lockedDiamonds;
  // Below the minimum nothing is offered: no pre-filled amount, no payout line, the button stays off. Above it the
  // field suggests the withdrawable balance (whole thousands, at most one request's limit) until the person types.
  const enough = diamonds >= RULES.minWithdrawDiamonds;
  const suggested = suggestedWithdraw(diamonds);
  const [typed, setTyped] = useState<string | null>(null);
  const amount = typed ?? (suggested ? String(suggested) : '');
  const setAmount = (t: string) => setTyped(t);
  // Gelir → Jeton Noktası opens this screen with the Jeton Noktası way chosen (?yol=jeton).
  const { yol } = useLocalSearchParams<{ yol?: string }>();
  const [way, setWay] = useState<Way>(live && yol === 'jeton' ? 'jeton' : 'iban');
  const jeton = way === 'jeton';
  const method: WithdrawMethod = jeton ? 'iban' : way;
  const [banks, setBanks] = useState<JetonBank[] | null>(null);
  const [bank, setBank] = useState<JetonBank | null>(null);
  // The list is read the first time the Jeton Noktası way is shown.
  useEffect(() => {
    if (!jeton || banks) return;
    let on = true;
    loadBanks()
      .then((b) => on && setBanks(b))
      .catch((e) => {
        if (!on) return;
        setBanks([]);
        showAlert('Jeton Noktaları yüklenemedi', message(e));
      });
    return () => {
      on = false;
    };
  }, [jeton, banks]);
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(amount) || 0;
  // Live mode: the limits the server sends with the list (Canlı ayarlar can change them); the compiled ones
  // until it answers or when an older server sends none. The server checks every request again.
  const limits = fromServer ? server.rules : null;
  const minD = limits?.minDiamonds ?? RULES.minWithdrawDiamonds;
  const maxD = limits?.maxDiamonds ?? RULES.maxWithdrawDiamonds;
  const weekLeft = limits ? Math.max(0, limits.weeklyDiamonds - limits.weekUsed) : Infinity;
  const cap = Math.min(diamonds, maxD, weekLeft);
  const presets = withdrawPresets(cap, { ...RULES, minWithdrawDiamonds: minD, maxWithdrawDiamonds: maxD });
  const payable = n >= minD && n <= cap;
  /** The amount against the server's limits (null when they're not in: checkWithdraw uses the compiled ones). */
  const amountError = (d: number) => {
    if (!limits) return null;
    if (!Number.isSafeInteger(d) || d < limits.minDiamonds) return `En az ${fmt(limits.minDiamonds)} elmas çekebilirsin.`;
    if (d > limits.maxDiamonds) return `Tek talepte en çok ${fmt(limits.maxDiamonds)} elmas çekebilirsin.`;
    if (d > weekLeft) return `7 günde en çok ${fmt(limits.weeklyDiamonds)} elmas çekilebilir; kalan ${fmt(weekLeft)} elmas.`;
    if (d > diamonds) return 'Çekilebilir elmasın yetmiyor. Kilitli elmaslar süresi dolunca eklenir.';
    return null;
  };
  const { colors } = useTheme();
  const styles = useStyles();
  // Live mode: one request at a time; a new one waits until the pending one is settled or cancelled.
  const pending = live ? server.list.find((w) => w.status === 'pending') : undefined;
  // Jeton Noktası: no payout limits (it is a sale), only the exchange minimum and the unlocked balance.
  const jetonMin = RULES.exchangeMinDiamonds;
  const jetonOk = n >= jetonMin && n <= diamonds;
  const jetonPresets = [1_000, 10_000, 100_000].filter((p) => p >= jetonMin && p <= diamonds);

  const sell = () => {
    if (busy || blockedFeature('withdraw')) return;
    if (!bank) return showAlert('Jeton Noktası seç', 'Elmaslarını aktaracağın Jeton Noktasını seç.');
    if (!Number.isSafeInteger(n) || n < jetonMin) return showAlert('Hata', `En az ${fmt(jetonMin)} elmas aktarabilirsin.`);
    if (n > diamonds) return showAlert('Hata', 'Çekilebilir elmasın yetmiyor. Kilitli elmaslar süresi dolunca eklenir.');
    showAlert(`${bank.name} Jeton Noktası`, `${fmt(n)} elmas hemen ${bank.name} hesabına geçer. Karşılığı yaklaşık ${tl(diamondValueTl(n))}; ödemeyi Jeton Noktası uygulama dışında yapar. Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Aktar',
        onPress: () => {
          setBusy(true);
          sellToBank(bank.id, n)
            .then((t) => showAlert('Aktarıldı', `${fmt(t.diamonds ?? n)} elmas ${bank.name} hesabına geçti. Sana ödeyeceği tutar: ${tl(t.valueTl ?? diamondValueTl(n))}. Ödeme için Jeton Noktası ile görüş.`))
            .catch((e) => showAlert('Aktarılamadı', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const submit = () => {
    if (jeton) return sell();
    if (live) {
      if (busy || blockedFeature('withdraw')) return;
      if (pending) return showAlert('Bekleyen talebin var', 'Bekleyen talebin sonuçlanınca ya da onu iptal edince yenisini açabilirsin.');
      // With the server's limits the amount is checked above; checkWithdraw then checks only the holder and the
      // account (it gets an amount its compiled limits accept).
      const err =
        amountError(n) ??
        checkWithdraw({
          diamonds: limits ? RULES.minWithdrawDiamonds : n,
          withdrawable: limits ? RULES.minWithdrawDiamonds : diamonds,
          method,
          holder: name,
          account: method === 'iban' ? formatIban(account) : account,
        });
      if (err) return showAlert('Hata', err);
      setBusy(true);
      liveWithdraw({ diamonds: n, method, holder: name, account: method === 'iban' ? formatIban(account) : account })
        .then((w) => showAlert('Talep alındı', `${fmt(w.diamonds)} elmas (${money(w.usd)}) için talebin alındı. Ödeme yapılınca haber vereceğiz.`))
        .catch((e) => showAlert('Talep gönderilemedi', message(e)))
        .finally(() => setBusy(false));
      return;
    }
    if (name.trim().length < 3) return showAlert('Hata', 'Hesap sahibinin adını gir.');
    const err = requestWithdraw(n, account);
    if (err) return showAlert('Hata', err);
    showAlert('Talep alındı', `${usd(n)} en geç 3 iş günü içinde hesabına yatırılacak. (Demo)`);
  };

  const cancel = (w: ServerWithdrawal) =>
    showAlert('Talebi iptal et', `${fmt(w.diamonds)} elmas bakiyene geri dönsün mü?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          cancelWithdraw(w.id)
            .catch((e) => showAlert('İptal edilemedi', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Para çek" />
      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 4 }}>
          <Text style={styles.dim}>Çekilebilir bakiye</Text>
          <Text style={styles.big}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
          <Text style={styles.dim}>≈ {usd(diamonds)} · Minimum {minD.toLocaleString('tr-TR')} elmas</Text>
          {limits && (
            <Text style={[styles.dim, { textAlign: 'center' }]}>
              Tek talepte en çok {fmt(limits.maxDiamonds)} elmas · 7 günde en çok {fmt(limits.weeklyDiamonds)} elmas (kalan {fmt(weekLeft)})
            </Text>
          )}
          {locked > 0 && (
            <View style={styles.locked}>
              <Ionicons name="lock-closed" size={12} color={colors.textDim} />
              <Text style={styles.dim}>Ayrıca {locked.toLocaleString('tr-TR')} elmas kilitli; süresi dolunca buraya eklenir.</Text>
            </View>
          )}
        </Card>

        <Text style={styles.label}>Çekilecek elmas</Text>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          style={styles.input}
          placeholder={`En az ${fmt(RULES.minWithdrawDiamonds)}`}
          placeholderTextColor={colors.textDim}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(jeton ? jetonPresets : presets).map((p) => (
            <Pressable key={p} style={styles.chip} onPress={() => setAmount(String(p))}>
              <Text style={styles.chipText}>{p.toLocaleString('tr-TR')}</Text>
            </Pressable>
          ))}
          {(jeton ? diamonds >= jetonMin : cap >= minD) && (
            <Pressable style={styles.chip} onPress={() => setAmount(String(jeton ? diamonds : cap))}>
              <Text style={styles.chipText}>Tümü</Text>
            </Pressable>
          )}
        </View>
        {jeton ? (
          jetonOk && <Text style={styles.receive}>Jeton Noktası sana ödeyecek: ≈ {tl(diamondValueTl(n))}</Text>
        ) : !enough ? (
          <Text style={styles.dim}>
            Para çekmek için en az {fmt(RULES.minWithdrawDiamonds)} çekilebilir elmas gerekli; {fmt(RULES.minWithdrawDiamonds - diamonds)} elmas daha biriktirmelisin.
          </Text>
        ) : (
          payable && <Text style={styles.receive}>Hesabına geçecek: {live ? money(withdrawUsd(n)) : usd(n)}</Text>
        )}

        {live && (
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
            {METHODS.map(([k, l]) => (
              <Pressable key={k} style={[styles.chip, way === k && styles.chipOn]} onPress={() => setWay(k)} accessibilityRole="radio" accessibilityState={{ selected: way === k }}>
                <Text style={[styles.chipText, way === k && styles.chipTextOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {jeton ? (
          <>
            <Text style={styles.label}>Jeton Noktası</Text>
            {banks === null ? (
              <Text style={styles.dim}>Jeton Noktaları yükleniyor…</Text>
            ) : banks.length === 0 ? (
              <Text style={styles.dim}>Şu an aktif Jeton Noktası yok.</Text>
            ) : (
              <Card style={{ gap: 2, paddingVertical: 6 }}>
                {banks.map((b) => (
                  <Pressable key={b.id} style={styles.bankRow} onPress={() => setBank(b)} accessibilityRole="radio" accessibilityState={{ selected: bank?.id === b.id }}>
                    <View style={styles.bankIcon}>
                      <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Ionicons name={bank?.id === b.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={bank?.id === b.id ? colors.primary : colors.textDim} />
                  </Pressable>
                ))}
              </Card>
            )}
            <Text style={styles.dim}>Elmaslar hemen seçtiğin Jeton Noktasına geçer. Karşılığını Jeton Noktası uygulama dışında sana öder; kayıt iki tarafta da görünür.</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Hesap sahibi</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Ad Soyad" placeholderTextColor={colors.textDim} style={styles.input} />
          </>
        )}
        {jeton ? null : method === 'iban' ? (
          <>
            <Text style={styles.label}>IBAN</Text>
            <TextInput value={formatIban(account)} onChangeText={setAccount} autoCapitalize="characters" autoCorrect={false} style={styles.input} placeholder="Ülke kodu ile, ör. GB82 WEST 1234 …" placeholderTextColor={colors.textDim} />
          </>
        ) : (
          <>
            <Text style={styles.label}>Hesap bilgisi</Text>
            <TextInput value={account} onChangeText={setAccount} autoCapitalize="none" autoCorrect={false} maxLength={120} style={styles.input} placeholder="Ödemenin gideceği hesap (ör. hesap no, e-posta)" placeholderTextColor={colors.textDim} />
          </>
        )}

        <Button
          title={busy ? 'Gönderiliyor…' : jeton ? "Jeton Noktası'na aktar" : 'Çekim talebi oluştur'}
          icon={jeton ? 'swap-horizontal' : 'cash'}
          onPress={submit}
          disabled={busy || (jeton ? !jetonOk || !bank : !enough)}
        />
        {live && !jeton && <Text style={styles.dim}>Talep açılınca elmaslar bakiyenden düşer. Ödeme yapılınca ya da talep reddedilirse haber verilir; reddedilen veya iptal edilen talebin elmasları geri gelir.</Text>}

        {live
          ? server.list.length > 0 && (
              <Card style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Geçmiş talepler</Text>
                {server.list.map((w) => (
                  <View key={w.id} style={styles.histRow}>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text }}>
                          {money(w.usd)} · {fmt(w.diamonds)} elmas
                        </Text>
                        <Text style={styles.dim}>
                          {dateOf(w.createdAt)} · {maskAccount(w.method, w.account)}
                        </Text>
                      </View>
                      <Text style={{ color: w.status === 'paid' ? colors.green : w.status === 'pending' ? colors.gold : colors.textDim, fontWeight: '700' }}>{w.statusLabel}</Text>
                    </View>
                    {w.status === 'rejected' && !!w.note && <Text style={styles.dim}>Neden: {w.note}</Text>}
                    {w.status === 'pending' && <Button title="Talebi iptal et" variant="ghost" small disabled={busy} onPress={() => cancel(w)} style={{ alignSelf: 'flex-start' }} />}
                  </View>
                ))}
              </Card>
            )
          : withdrawals.length > 0 && (
              <Card style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Geçmiş talepler</Text>
                {withdrawals.map((w) => (
                  <View key={w.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text }}>{usd(w.diamonds)}</Text>
                      <Text style={styles.dim}>
                        {w.time} · {w.iban.slice(0, 7)}…
                      </Text>
                    </View>
                    <Text style={{ color: w.status === 'Onaylandı' ? colors.green : colors.gold, fontWeight: '700' }}>{w.status}</Text>
                  </View>
                ))}
              </Card>
            )}
      </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

// Inputs and preset chips sit on the screen background: white with a soft lift in the light scheme.
const useStyles = makeStyles(({ colors, lift, dark }) => ({
  dim: { color: colors.textDim, fontSize: 13 },
  big: { color: colors.text, fontSize: 30, fontWeight: '900' },
  label: { color: colors.textDim, fontWeight: '600', marginBottom: -6 },
  input: { backgroundColor: colors.card, borderRadius: 14, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 13, ...lift },
  chip: { backgroundColor: dark ? colors.cardAlt : colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, ...lift },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF' },
  receive: { color: colors.green, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  histRow: { gap: 4, paddingVertical: 4 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  bankIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
}));
