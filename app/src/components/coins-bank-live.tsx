// Jeton Noktası in a live build (app/src/app/coins-bank.tsx), on the server's routes (server/api/jeton.mjs, through
// lib/live/jeton). Everyone sees the Jeton Noktaları and reaches them by message, the way to buy coins outside the
// store; a host sells unlocked diamonds to one of them, who pays their value outside the app; a Jeton Noktası
// account sees its stock and sells coins to someone who paid it, with the payment's receipt number. The server
// decides and checks every amount, the stock, the lock and blocks either way; the checks here only say early what it
// will refuse. The demo's tabs (bonus credits, agency and BD books) are sample data and stay in the demo.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon3D } from '@/components/Icon3D';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { LoadError } from '@/components/load-error';
import { Text, TextInput } from '@/components/text';
import { Avatar, Button, Card, Header } from '@/components/ui';
import { RULES, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import type { JetonTransfer, UserCard } from '@/lib/api';
import { bankSaleError, diamondSaleError, diamondValueTl, transferLine } from '@/lib/coins-bank';
import { message, myServerId, rememberUser } from '@/lib/live';
import { useLiveEarnings } from '@/lib/live/earnings';
import { jetonNow, refreshJeton, sellCoins, sellDiamonds, useJeton, type JetonStock } from '@/lib/live/jeton';
import { blockedFeature } from '@/lib/remote-control';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const tl = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const digits = (t: string) => t.replace(/\D/g, '').slice(0, 10);
const COIN_PRESETS = [1_000, 5_000, 10_000, 50_000, 100_000];
const DIAMOND_PRESETS = [1_000, 10_000, 100_000];

export function LiveCoinsBank() {
  const { coins, blocked } = useApp();
  const data = useJeton();
  // The store keeps the last good answer; nothing at all after a read means it failed.
  const [failed, setFailed] = useState(false);
  const styles = useStyles();
  const retry = () => {
    setFailed(false);
    void refreshJeton().then(() => setFailed(jetonNow() === null));
  };
  useEffect(() => {
    void refreshJeton().then(() => setFailed(jetonNow() === null));
  }, []);
  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Jeton Noktası" />
      {/* The sale fields sit low in the scroll: the keyboard must not cover them (Android). */}
      <KeyboardAvoid style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Balance coins={coins} stock={data?.mine ? data.stock : null} />
          {data === null ? (
            failed ? <LoadError text="Jeton Noktası bilgileri okunamadı." onRetry={retry} /> : <Text style={styles.dim}>Yükleniyor…</Text>
          ) : (
            <>
              {data.mine && <BankSale stock={data.stock?.coins ?? coins} buyers={data.buyers.filter((b) => !blocked.has(b.id))} />}
              {!data.mine && <DiamondSale banks={data.banks} />}
              <Banks banks={data.banks} />
              <History rows={data.transfers} />
            </>
          )}
          <Rules />
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

function Balance({ coins, stock }: { coins: number; stock: JetonStock | null }) {
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  return (
    <LinearGradient colors={[colors.cardAlt, colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <Text style={styles.heroLabel}>{stock ? 'Jeton stoğun' : 'Jeton bakiyesi'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon3D name="coin" size={40} />
        <Text style={styles.heroN}>{fmt(stock?.coins ?? coins)}</Text>
      </View>
      {stock ? (
        stock.channels.map((c) => (
          <Text key={c.channel} style={styles.heroSub}>
            {c.label}: {fmt(c.remaining)} jeton
          </Text>
        ))
      ) : (
        <>
          <Text style={styles.heroSub}>Jetonu mağazadan ya da bir Jeton Noktası&apos;ndan alabilirsin. Nakde çevrilmez.</Text>
          <Pressable style={styles.heroBtn} onPress={() => router.push('/cuzdan')} accessibilityRole="button" accessibilityLabel="Jeton yükle">
            <Ionicons name="add-circle" size={18} color={dark ? colors.text : semantic.tonalText} />
            <Text style={styles.heroBtnText}>Jeton yükle</Text>
          </Pressable>
        </>
      )}
    </LinearGradient>
  );
}

/** A Jeton Noktası's sale: who (the people who wrote to it), how many coins, the receipt of their payment. */
function BankSale({ stock, buyers }: { stock: number; buyers: UserCard[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [to, setTo] = useState<UserCard | null>(null);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(amount) || 0;
  const error = bankSaleError({ to: to?.id ?? null, coins: n, stock, paymentRef: receipt });
  const send = () => {
    if (busy || blockedFeature('jeton')) return;
    if (error) return showAlert('Gönderilemez', error);
    if (!to) return;
    showAlert('Jeton gönderilsin mi?', `${fmt(n)} jeton stoğundan ${to.name} hesabına geçer. Dekont: ${receipt.trim()}. Bu işlem geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Gönder',
        onPress: () => {
          setBusy(true);
          sellCoins(to.id, n, receipt, note)
            .then((t) => {
              showAlert('Gönderildi', `${fmt(t?.coins ?? n)} jeton ${to.name} hesabına geçti. Kayıt iki tarafta da görünür.`);
              setAmount('');
              setReceipt('');
              setNote('');
            })
            .catch((e) => showAlert('Gönderilemedi', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };
  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle icon="swap-horizontal" title="Jeton sat" />
      <Text style={styles.dim}>Ödemeyi uygulama dışında aldıktan sonra jetonu buradan gönder. Alıcı sana mesaj atmış olmalı; son yazışanlar aşağıda.</Text>
      {buyers.length === 0 ? (
        <Text style={[styles.dim, { color: colors.gold }]}>Henüz sana yazan kimse yok.</Text>
      ) : (
        <View style={styles.chips}>
          {buyers.map((b) => (
            <Chip key={b.id} label={b.name} on={to?.id === b.id} onPress={() => setTo(to?.id === b.id ? null : b)} />
          ))}
        </View>
      )}
      <View style={styles.chips}>
        {COIN_PRESETS.filter((p) => p <= stock).map((p) => (
          <Chip key={p} label={fmt(p)} on={n === p} onPress={() => setAmount(String(p))} />
        ))}
      </View>
      <TextInput value={amount} onChangeText={(t) => setAmount(digits(t))} keyboardType="number-pad" placeholder="Jeton miktarı" placeholderTextColor={colors.textDim} style={styles.input} />
      <TextInput value={receipt} onChangeText={setReceipt} maxLength={100} autoCapitalize="characters" autoCorrect={false} placeholder="Dekont veya havale numarası" placeholderTextColor={colors.textDim} style={styles.input} />
      <TextInput value={note} onChangeText={setNote} maxLength={200} placeholder="Alıcıya not (isteğe bağlı)" placeholderTextColor={colors.textDim} style={styles.input} />
      {n > 0 && !!error && <Text style={[styles.dim, { color: colors.red }]}>{error}</Text>}
      <Button title={busy ? 'Gönderiliyor…' : 'Jeton gönder'} icon="send" onPress={send} disabled={busy || !!error} />
    </Card>
  );
}

/** A host sells unlocked diamonds to a Jeton Noktası, which pays their value outside the app at once. */
function DiamondSale({ banks }: { banks: UserCard[] }) {
  const app = useApp();
  const server = useLiveEarnings(app.diamonds);
  const { colors } = useTheme();
  const styles = useStyles();
  const [bank, setBank] = useState<UserCard | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = server.status === 'ready';
  const free = ready ? server.withdrawable : app.withdrawableDiamonds;
  const locked = ready ? server.locked : app.lockedDiamonds;
  // Someone without diamonds has nothing to sell: the card stays out of the way.
  if (free <= 0 && locked <= 0 && !app.isHost) return null;
  const n = Number(amount) || 0;
  const error = diamondSaleError(n, free);
  const sell = () => {
    if (busy || blockedFeature('jeton')) return;
    if (!bank) return showAlert('Jeton Noktası seç', 'Elmaslarını bozduracağın Jeton Noktası’nı seç.');
    if (error) return showAlert('Bozdurulamaz', error);
    showAlert(`${bank.name} Jeton Noktası`, `${fmt(n)} elmas hemen ${bank.name} hesabına geçer. Karşılığı yaklaşık ${tl(diamondValueTl(n))}; ödemeyi Jeton Noktası uygulama dışında yapar. Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Bozdur',
        onPress: () => {
          setBusy(true);
          sellDiamonds(bank.id, n)
            .then((t) => {
              showAlert('Bozduruldu', `${fmt(t.diamonds ?? n)} elmas ${bank.name} hesabına geçti. Sana ödeyeceği tutar: ${tl(t.valueTl ?? diamondValueTl(n))}. Ödeme için Jeton Noktası ile mesajlaş.`);
              setAmount('');
              server.reload();
            })
            .catch((e) => showAlert('Bozdurulamadı', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };
  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle icon="flash" title="Anında bozdur" />
      <Text style={styles.dim}>
        Çekilebilir: {fmt(free)} 💎 (≈ {usd(free)}){locked > 0 ? ` · ${fmt(locked)} elmasın kilidi henüz açılmadı` : ''}. Jeton Noktası elmasının resmi değerini hemen öder; senden ücret kesilmez.
      </Text>
      {banks.length === 0 ? (
        <Text style={[styles.dim, { color: colors.gold }]}>Şu an aktif Jeton Noktası yok.</Text>
      ) : (
        <View style={styles.chips}>
          {banks.map((b) => (
            <Chip key={b.id} label={b.name} on={bank?.id === b.id} onPress={() => setBank(bank?.id === b.id ? null : b)} />
          ))}
        </View>
      )}
      <View style={styles.chips}>
        {DIAMOND_PRESETS.filter((p) => p >= RULES.exchangeMinDiamonds && p <= free).map((p) => (
          <Chip key={p} label={fmt(p)} on={n === p} onPress={() => setAmount(String(p))} />
        ))}
        {free >= RULES.exchangeMinDiamonds && <Chip label="Tümü" on={n === free} onPress={() => setAmount(String(free))} />}
      </View>
      <TextInput value={amount} onChangeText={(t) => setAmount(digits(t))} keyboardType="number-pad" placeholder={`En az ${fmt(RULES.exchangeMinDiamonds)} elmas`} placeholderTextColor={colors.textDim} style={styles.input} />
      {n > 0 && <Text style={[styles.dim, { color: error ? colors.red : colors.green }]}>{error ?? `Jeton Noktası sana ödeyecek: ≈ ${tl(diamondValueTl(n))}`}</Text>}
      <Button title={busy ? 'Gönderiliyor…' : "Jeton Noktası'na bozdur"} icon="flash-outline" onPress={sell} disabled={busy || !bank || !!error || banks.length === 0} />
    </Card>
  );
}

/** The Jeton Noktaları and how to reach them: their profile and a message. */
function Banks({ banks }: { banks: UserCard[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const open = (b: UserCard, to: 'profile' | 'chat') => {
    rememberUser(b);
    router.push(to === 'chat' ? `/sohbet/${b.id}` : `/kullanici/${b.id}`);
  };
  return (
    <Card style={{ gap: 4 }}>
      <SectionTitle icon="storefront" title="Jeton Noktaları" />
      <Text style={styles.dim}>Jeton almak ya da elmasını bozdurmak için bir Jeton Noktası ile mesajlaş. Ödeme uygulama dışında yapılır; jeton veya elmas aktarımının kaydı iki tarafta da görünür.</Text>
      {banks.length === 0 ? (
        <Text style={[styles.dim, { paddingVertical: 8 }]}>Şu an aktif Jeton Noktası yok.</Text>
      ) : (
        banks.map((b) => (
          <View key={b.id} style={styles.row}>
            <Pressable onPress={() => open(b, 'profile')} accessibilityRole="button" accessibilityLabel={`${b.name} profili`}>
              <Avatar uri={b.avatarUrl ?? undefined} size={40} name={b.name} />
            </Pressable>
            <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>
              {b.name}
            </Text>
            <Pressable onPress={() => open(b, 'chat')} style={styles.msgBtn} accessibilityRole="button" accessibilityLabel={`${b.name} kişisine mesaj gönder`}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primaryText} />
              <Text style={styles.link}>Mesaj</Text>
            </Pressable>
          </View>
        ))
      )}
    </Card>
  );
}

function History({ rows }: { rows: JetonTransfer[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const me = myServerId();
  return (
    <Card style={{ gap: 4 }}>
      <SectionTitle icon="receipt" title="İşlemlerim" />
      {rows.length === 0 ? (
        <Text style={[styles.dim, { paddingVertical: 8 }]}>Henüz Jeton Noktası işlemin yok.</Text>
      ) : (
        rows.slice(0, 50).map((t) => {
          const x = transferLine(t, me);
          return (
            <View key={t.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{x.title}</Text>
                <Text style={styles.dim} numberOfLines={2}>
                  {x.detail} · {dateOf(t.createdAt)}
                </Text>
              </View>
              <Text style={[styles.amount, { color: x.incoming ? colors.green : colors.text }]}>{x.amount}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

function Rules() {
  const { semantic } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.note}>
      <Ionicons name="information-circle" size={16} color={semantic.diamondText} />
      <Text style={[styles.dim, { flex: 1 }]}>
        {`Jeton Noktası jetonuyla gönderilen hediyelerin elması ${RULES.jetonPendingDays} gün, mağaza jetonundan gelenlerinki ${RULES.pendingDays} gün kilitli kalır. Yalnız kilidi açılmış elmas bozdurulabilir. Jeton Noktası'na bozdurulan elmas karşılığını o hesap öder; uygulama aracılık etmez.`}
      </Text>
    </View>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={16} color={colors.primaryText} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Light scheme only: the soft card shadow (dark cards stand out by color), as the demo screen draws it.
const LIGHT_SHADOW = '0 1px 2px rgba(64,20,40,0.05), 0 6px 16px rgba(64,20,40,0.06)';

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  hero: { borderRadius: 24, padding: 20, gap: 4, borderWidth: 1, borderColor: colors.border, ...(dark ? {} : { boxShadow: LIGHT_SHADOW }) },
  heroLabel: { color: ink(0.9), fontSize: 14 },
  heroN: { color: colors.text, fontSize: 36, fontWeight: '900' },
  heroSub: { color: ink(0.8), fontSize: 12 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, borderWidth: 1.5, borderColor: dark ? ink(0.85) : 'rgba(184,31,102,0.45)', borderRadius: 999, paddingVertical: 10, backgroundColor: dark ? ink(0.12) : semantic.tonal },
  heroBtnText: { color: dark ? colors.text : semantic.tonalText, fontWeight: '800', fontSize: 15 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sectionText: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  amount: { color: colors.text, fontWeight: '800', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, maxWidth: 180 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  link: { color: colors.primaryText, fontWeight: '700' },
  msgBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.cardAlt },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: 12, padding: 10 },
}));
