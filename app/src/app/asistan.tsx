// Asistan merkezi (owners, 26 Nov 2026): an agency assistant's own place, opened from Ben under Yayıncı Merkezi. Her
// card (share, code, what she earned) and the streamers she brought: their 12-digit ID, when they joined, what they
// earned this week and since joining (server/api/agency-assistants.mjs myAssistant `streamers`, GET /api/agency/me).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MyAssistantCard } from '@/components/agency-assistants';
import { Empty, NetState, Section } from '@/components/agency-net';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { ListGroup, ListRow } from '@/components/list';
import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { demoMe } from '@/data/agency-net-demo';
import { agencyNet, fmtD, fmtDate, useNet, type Me } from '@/lib/agency-net';
import { useApp } from '@/store';
import { colors, space } from '@/theme';

export default function AssistantCenter() {
  const { me } = useApp();
  const q = useNet<Me>(me.name, agencyNet.me, demoMe);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.family} />
      <Header
        title="Asistan merkezi"
        right={
          <Pressable onPress={q.reload} hitSlop={10} accessibilityLabel="Yenile">
            <Ionicons name="refresh" size={22} color="#fff" />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={st.body}>
        <NetState q={q}>
          {(d) =>
            !d.assistant ? (
              <Empty icon="ribbon-outline" text="Şu an bir ajansın asistanı değilsin." />
            ) : (
              <View style={{ gap: space.lg }}>
                <MyAssistantCard a={d.assistant} onChange={q.reload} />
                <Section title={`Getirdiğim yayıncılar · ${fmtD(d.assistant.streamers?.length ?? d.assistant.invited.total)}`}>
                  {!d.assistant.streamers ? (
                    <Text style={st.dim}>Bu liste sunucu güncellenince görünür.</Text>
                  ) : d.assistant.streamers.length === 0 ? (
                    <Empty icon="people-outline" text="Henüz getirdiğin yayıncı yok. Davet kodunu paylaşarak başlayabilirsin." />
                  ) : (
                    <ListGroup footer="Kazanç, yayıncının aldığı elmastır; senin payın ajans komisyonundan gelir.">
                      {d.assistant.streamers.map((x, i) => (
                        <ListRow
                          key={`${x.no ?? x.name}-${i}`}
                          icon="person-outline"
                          tone={x.endedAt ? 'neutral' : 'action'}
                          title={x.name}
                          subtitle={[x.no ? `ID ${x.no}` : null, `Katılım ${fmtDate(x.joinedAt)}`, x.endedAt ? `Ayrıldı ${fmtDate(x.endedAt)}` : null].filter(Boolean).join(' · ')}
                          right={
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={st.amount}>{fmtD(x.week)}</Text>
                              <Text style={st.dim}>toplam {fmtD(x.total)}</Text>
                            </View>
                          }
                        />
                      ))}
                    </ListGroup>
                  )}
                </Section>
              </View>
            )
          }
        </NetState>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: 48 },
  dim: { color: colors.textDim, fontSize: 12 },
  amount: { color: '#fff', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
