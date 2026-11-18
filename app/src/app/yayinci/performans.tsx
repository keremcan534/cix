// Yayıncı Merkezi › Mesaj Performansım (docs/OTOMATIK_MESAJ.md §10-11): how a streamer answered the paid messages that
// could earn her diamonds: the average answer time, the share answered in 5 minutes (over every eligible message, so
// leaving many unanswered never looks fast), late and unanswered ones, the diamonds earned and missed, and today's
// rights. Today, 7 days, 30 days or a range of Turkey's days (server/api/auto-chat.mjs). Figures only, never a message.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Button, Card, Header } from '@/components/ui';
import { liveMode, message } from '@/lib/live';
import { PERIODS, loadPerformance, secondsText, type Figures, type Performance, type Period } from '@/lib/live/auto-chat';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

export default function MessagePerformance() {
  const { colors } = useTheme();
  const s = useStyles();
  const [period, setPeriod] = useState<Period>('7d');
  const [range, setRange] = useState({ from: today(), to: today() });
  const [asked, setAsked] = useState({ from: today(), to: today() });
  // The answer for the period asked (a new choice shows the loader until its own answer comes).
  const key = period === 'custom' ? `custom:${asked.from}:${asked.to}` : period;
  const [got, setGot] = useState<{ key: string; data: Performance | null; failed: string | null } | null>(null);

  useEffect(() => {
    if (!liveMode()) return;
    let alive = true;
    loadPerformance(period, period === 'custom' ? asked : undefined)
      .then((d) => alive && setGot({ key, data: d, failed: null }))
      .catch((e) => alive && setGot({ key, data: null, failed: message(e) }));
    return () => {
      alive = false;
    };
  }, [period, asked, key]);
  const data = got?.key === key ? got.data : null;
  const failed = got?.key === key ? got.failed : null;

  return (
    <SafeAreaView style={s.safe}>
      <Header title="Mesaj Performansım" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={s.chips}>
          {PERIODS.map((p) => (
            <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[s.chip, period === p.key && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: period === p.key }}>
              <Text style={[s.chipText, period === p.key && { color: '#fff' }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        {period === 'custom' && (
          <Card style={{ gap: 8 }}>
            <Text style={s.dim}>Türkiye saatine göre günler, en çok 92 gün (YYYY-AA-GG).</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={range.from} onChangeText={(v) => setRange((r) => ({ ...r, from: v.trim() }))} style={s.input} accessibilityLabel="Başlangıç günü" maxLength={10} />
              <TextInput value={range.to} onChangeText={(v) => setRange((r) => ({ ...r, to: v.trim() }))} style={s.input} accessibilityLabel="Bitiş günü" maxLength={10} />
            </View>
            <Button title="Göster" small disabled={!DAY.test(range.from) || !DAY.test(range.to)} onPress={() => setAsked({ ...range })} />
          </Card>
        )}
        {!liveMode() ? (
          <Text style={s.dim}>Mesaj performansı sunucuya bağlı sürümde görünür.</Text>
        ) : failed ? (
          <Card>
            <Text style={s.title}>Açılamadı</Text>
            <Text style={s.dim}>{failed}</Text>
          </Card>
        ) : !data ? (
          <ActivityIndicator color={colors.textDim} style={{ marginTop: 40 }} />
        ) : (
          <Body d={data} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Body({ d }: { d: Performance }) {
  const s = useStyles();
  const f = d.stats;
  return (
    <>
      <View style={s.grid}>
        <Tile label="Ortalama cevap süresi" value={secondsText(f.avgSeconds)} />
        <Tile label={`${d.replyMinutes} dakikada cevap oranı`} value={f.inTimeRate === null ? '—' : `%${fmt(f.inTimeRate)}`} />
        <Tile label="Mesajlardan kazanılan" value={`💎 ${fmt(f.diamonds)}`} />
        <Tile label="Kaçırılan kazanç" value={`💎 ${fmt(f.missedDiamonds)}`} sub={`${fmt(f.missed)} mesaj`} />
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={s.title}>Mesajlar</Text>
        <Row label="Ödüle uygun gelen mesaj" value={f.total} />
        <Row label="Cevaplanan" value={f.answered} />
        <Row label={`${d.replyMinutes} dakika içinde cevaplanan`} value={f.inTime} />
        <Row label="Süresi aşıldıktan sonra cevaplanan" value={f.late} />
        <Row label="Hiç cevaplanmayan" value={f.unanswered} />
        {f.waiting > 0 && <Row label="Şu an cevap bekleyen" value={f.waiting} />}
        <Row label="Hazır cevapla" value={f.quick} />
        <Row label="Kendin yazarak" value={f.manual} />
      </Card>
      {d.days.length > 1 && <DayChart days={d.days} />}
      <Card style={{ gap: 6 }}>
        <Text style={s.title}>Bugünkü haklar</Text>
        <Row label="Hazır cevap" text={d.today.quick ? `${d.today.quick.used}/${d.today.quick.total} kullanıldı` : '—'} />
        <Row label="Otomatik mesaj" text={d.today.auto ? `${d.today.auto.used}/${d.today.auto.total} gönderildi` : '—'} />
      </Card>
      <Text style={s.dim}>
        Oran, bütün ödüle uygun mesajlara göre hesaplanır: cevapsız kalan mesaj da sayılır. Ortalama süre cevaplanan mesajların ilk cevabına göredir.
      </Text>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const s = useStyles();
  return (
    <Card style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {!!sub && <Text style={s.dim}>{sub}</Text>}
    </Card>
  );
}

function Row({ label, value, text }: { label: string; value?: number; text?: string }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{text ?? fmt(value ?? 0)}</Text>
    </View>
  );
}

/** One series: the share answered in time, day by day. A tap on a day shows its figures above the bars. */
function DayChart({ days }: { days: (Figures & { day: string })[] }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [pick, setPick] = useState<number | null>(null);
  const shown = days.slice(-31);
  const sel = pick === null ? null : shown[pick];
  const H = 96;
  return (
    <Card style={{ gap: 8 }}>
      <Text style={s.title}>Günlük 5 dakikada cevap oranı</Text>
      <Text style={s.dim}>
        {sel ? `${sel.day}: %${fmt(sel.inTimeRate ?? 0)} · ${sel.inTime}/${sel.total} mesaj · 💎 ${fmt(sel.diamonds)}` : 'Bir güne dokun, ayrıntısı burada görünür.'}
      </Text>
      <View style={[s.chart, { height: H + 18 }]} accessibilityRole="summary" accessibilityLabel={shown.map((x) => `${x.day} yüzde ${fmt(x.inTimeRate ?? 0)}`).join(', ')}>
        {shown.map((x, i) => (
          <Pressable key={x.day} onPress={() => setPick(i === pick ? null : i)} style={s.barHit} accessibilityRole="button" accessibilityLabel={`${x.day}: yüzde ${fmt(x.inTimeRate ?? 0)}`}>
            <View style={{ height: H, justifyContent: 'flex-end' }}>
              <View style={[s.bar, { height: Math.max(2, ((x.inTimeRate ?? 0) / 100) * H), backgroundColor: colors.primary, opacity: pick === null || pick === i ? 1 : 0.45 }]} />
            </View>
            <Text style={s.barLabel} numberOfLines={1}>
              {x.day.slice(8)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  input: { flex: 1, color: colors.text, backgroundColor: colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  tileValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  tileLabel: { color: colors.textDim, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  value: { color: colors.text, fontSize: 13, fontWeight: '800' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barHit: { flex: 1, alignItems: 'center', minWidth: 8 },
  bar: { width: '70%', maxWidth: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { color: colors.textDim, fontSize: 9, marginTop: 4 },
}));
