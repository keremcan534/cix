// Yayıncı Merkezi's way into Otomatik Mesajlarım and Mesaj Performansım (docs/OTOMATIK_MESAJ.md): shown only to a woman
// streamer the server says may use them (lib/live/auto-chat useAutoMe), with today's rights at a glance.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { useAutoMe } from '@/lib/live/auto-chat';
import { makeStyles, useTheme } from '@/theme';

export function MessageToolsCard() {
  const me = useAutoMe();
  const { colors } = useTheme();
  const s = useStyles();
  if (!me?.tools) return null;
  const rows: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; href: '/yayinci/mesajlar' | '/yayinci/performans' }[] = [
    { icon: 'chatbubbles-outline', title: 'Otomatik Mesajlarım', sub: me.auto ? `Bugün ${me.auto.left}/${me.auto.total} otomatik mesaj · ${me.quick?.left ?? 0}/${me.quick?.total ?? 0} hazır cevap` : '10 mesajını kendine göre yaz', href: '/yayinci/mesajlar' },
    { icon: 'stats-chart-outline', title: 'Mesaj Performansım', sub: `Mesajlara ${me.replyMinutes || 5} dakikada cevap ver, elmas kazan`, href: '/yayinci/performans' },
  ];
  return (
    <Card style={{ gap: 4 }}>
      {rows.map((r) => (
        <Pressable key={r.href} onPress={() => router.push(r.href)} style={s.row} accessibilityRole="button" accessibilityLabel={r.title}>
          <Ionicons name={r.icon} size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{r.title}</Text>
            <Text style={s.sub}>{r.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      ))}
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
}));
