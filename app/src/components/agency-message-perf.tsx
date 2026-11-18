// Ajans ofisi › Mesaj performansı (docs/OTOMATIK_MESAJ.md §11.2-11.4): how the agency's own streamers answer the paid
// messages that can earn them diamonds, one row each, the agency's totals and the change from the period before, the
// fastest and the lowest. Figures only: the server never sends a message's words here (server/api/agency.mjs
// GET /api/agency/message-performance, the streamers.view right). A demo build has no such figures.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { liveMode, message } from '@/lib/live';
import { PERIODS, loadAgencyPerformance, secondsText, type AgencyPerformance, type Period } from '@/lib/live/auto-chat';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const rate = (r: number | null) => (r === null ? '—' : `%${fmt(r)}`);

export function AgencyMessagePerf({ agencyId }: { agencyId: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [period, setPeriod] = useState<Exclude<Period, 'custom'>>('7d');
  // The answer for the period asked (a change of period shows the loader until its own answer comes).
  const key = `${agencyId}:${period}`;
  const [got, setGot] = useState<{ key: string; d: AgencyPerformance | null; failed: string | null } | null>(null);
  useEffect(() => {
    if (!liveMode() || !agencyId) return;
    let alive = true;
    loadAgencyPerformance(agencyId, period)
      .then((x) => alive && setGot({ key, d: x, failed: null }))
      .catch((e) => alive && setGot({ key, d: null, failed: message(e) }));
    return () => {
      alive = false;
    };
  }, [agencyId, period, key]);
  const d = got?.key === key ? got.d : null;
  const failed = got?.key === key ? got.failed : null;
  if (!liveMode()) return <Text style={s.dim}>Mesaj performansı sunucuya bağlı sürümde görünür.</Text>;
  const t = d?.totals;
  const prevRate = d?.previous.inTimeRate ?? null;
  const change = t && t.inTimeRate !== null && prevRate !== null ? Math.round((t.inTimeRate - prevRate) * 10) / 10 : null;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.chips}>
        {PERIODS.filter((p) => p.key !== 'custom').map((p) => (
          <Pressable key={p.key} onPress={() => setPeriod(p.key as Exclude<Period, 'custom'>)} style={[s.chip, period === p.key && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: period === p.key }}>
            <Text style={[s.chipText, period === p.key && { color: '#fff' }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {failed ? (
        <Text style={s.dim}>{failed}</Text>
      ) : !d || !t ? (
        <ActivityIndicator color={colors.textDim} />
      ) : (
        <>
          <Card style={{ gap: 6 }}>
            <Text style={s.title}>Ajans geneli</Text>
            <Row label="Ortalama cevap süresi" value={secondsText(t.avgSeconds)} />
            <Row label="5 dakikada cevap oranı" value={`${rate(t.inTimeRate)}${change === null ? '' : ` (${change >= 0 ? '+' : ''}${fmt(change)} puan)`}`} />
            <Row label="Ödüle uygun mesaj" value={fmt(t.total)} />
            <Row label="Mesajlardan kazanç" value={`💎 ${fmt(t.diamonds)}`} />
            {!!d.fastest.length && <Text style={s.dim}>En hızlı: {d.fastest.map((x) => `${x.name} (${secondsText(x.avgSeconds)})`).join(', ')}</Text>}
            {!!d.lowest.length && <Text style={s.dim}>Oranı en düşük: {d.lowest.map((x) => `${x.name} (${rate(x.inTimeRate)})`).join(', ')}</Text>}
          </Card>
          {d.streamers.map((x) => (
            <Card key={x.id} style={{ gap: 4 }}>
              <View style={s.rowBetween}>
                <Text style={s.title} numberOfLines={1}>
                  {x.name}
                </Text>
                <Text style={[s.dim, x.online && { color: colors.green }]}>{x.online ? 'Çevrimiçi' : 'Çevrimdışı'}</Text>
              </View>
              {!!x.publicNo && <Text style={s.dim}>ID {x.publicNo}</Text>}
              <Row label="Ortalama cevap" value={secondsText(x.avgSeconds)} />
              <Row label="5 dakikada cevap" value={`${rate(x.inTimeRate)} · ${fmt(x.inTime)}/${fmt(x.total)}`} />
              <Row label="Cevaplanan / yanıtsız / süre aşımı" value={`${fmt(x.answered)} / ${fmt(x.unanswered)} / ${fmt(x.late + x.unanswered)}`} />
              <Row label="Mesaj kazancı" value={`💎 ${fmt(x.diamonds)}`} />
              <Row label="Bugün hazır cevap" value={`${fmt(x.quickToday.used)}/${fmt(x.quickToday.total)}`} />
            </Card>
          ))}
          {!d.streamers.length && <Text style={s.dim}>Ajansında henüz yayıncı yok.</Text>}
          <Text style={s.dim}>Bu bölümde yalnız sayılar görünür; mesajların içeriği hiçbir zaman gösterilmez.</Text>
        </>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.rowBetween}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  title: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  value: { color: colors.text, fontSize: 13, fontWeight: '800' },
}));
