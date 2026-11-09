// Gelir → Gelir kaynakları (live mode): the diamonds earned in a period by where they came from, as the server
// counts them (server/api wallet.mjs GET /api/wallet/income). Room gifts, Uğurlu hediyeler, gifts from a chat, a
// moment, a profile or the family chat each on their own line; paid messages and calls are listed as "Yakında" until the server
// has them, so the screen already shows every source.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/list';
import { LoadError } from '@/components/load-error';
import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { incomeSources, type IncomePeriod, type IncomeSource } from '@/lib/api';
import { makeStyles, useTheme } from '@/theme';

const PERIODS: [IncomePeriod, string][] = [
  ['day', 'Bugün'],
  ['week', 'Bu hafta'],
  ['month', 'Bu ay'],
  ['all', 'Tümü'],
];
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  room: 'mic-outline',
  lucky: 'sparkles-outline',
  chat: 'chatbubble-outline',
  moment: 'images-outline',
  profile: 'person-outline',
  family: 'people-outline',
  other: 'gift-outline',
  message_fee: 'mail-outline',
  voice_call: 'call-outline',
  video_call: 'videocam-outline',
};
const fmt = (n: number) => n.toLocaleString('tr-TR');

export function IncomeSources() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<IncomePeriod>('month');
  const [data, setData] = useState<{ period: IncomePeriod; total: number; sources: IncomeSource[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let on = true;
    incomeSources(period)
      .then((r) => {
        if (!on) return;
        setFailed(false);
        setData(r);
      })
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [period, tries]);
  // The rows of the period on screen; the previous period's stay until the new answer is in.
  const rows = data?.sources ?? [];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Text style={styles.title}>Gelir kaynakları</Text>
        {data && <Text style={styles.total}>{fmt(data.total)} 💎</Text>}
      </View>
      <ChoiceChips value={period} options={PERIODS} onChange={setPeriod} />
      {failed && !data ? (
        <LoadError text="Gelir kaynakları sunucudan okunamadı." onRetry={() => setTries((t) => t + 1)} />
      ) : !data ? (
        <Card>
          <Text style={styles.dim}>Yükleniyor…</Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {rows.map((s, i) => (
            <View key={s.key} style={[styles.row, i > 0 && styles.sep, !s.live && { opacity: 0.6 }]} accessible accessibilityLabel={`${s.label}: ${s.live ? `${fmt(s.diamonds)} elmas` : 'yakında'}`}>
              <View style={styles.icon}>
                <Ionicons name={ICON[s.key] ?? 'diamond-outline'} size={16} color={colors.primaryText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {s.label}
                </Text>
                {s.live && s.count > 0 && <Text style={styles.dim}>{fmt(s.count)} kez</Text>}
              </View>
              {s.live ? (
                <Text style={styles.amount} numberOfLines={1}>
                  {fmt(s.diamonds)} 💎
                </Text>
              ) : (
                <Text style={styles.soon}>Yakında</Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  total: { color: dark ? colors.text : semantic.diamondText, fontWeight: '800', fontSize: 15 },
  list: { paddingVertical: 4, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  sep: { borderTopWidth: 1, borderTopColor: ink(0.08) },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  amount: { color: dark ? colors.text : semantic.diamondText, fontWeight: '800', fontSize: 15 },
  soon: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 12 },
}));
