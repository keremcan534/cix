// Hemen Tanış: start a random voice or video match. The search keeps running if the user leaves this
// screen (e.g. goes into a room); the match card then appears wherever they are (components/match-layer).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IncomingCard } from '@/components/match-layer';
import { Header } from '@/components/ui';
import { MATCH_GRACE_SECONDS } from '@/data/economy';
import { USERS } from '@/data/mock';
import { useMedia } from '@/lib/media';
import { PHASE_LABEL, cancelMatch, modeLabel, priceOf, resetMatch, setScenario, startMatch, useMatch, type MatchFilter, type MatchMode, type Scenario } from '@/lib/match';
import { useApp } from '@/store';
import { colors, gradient, semantic } from '@/theme';

const FILTERS: MatchFilter[] = ['Herkes', 'Kadın', 'Erkek'];
const SCENARIOS: [Scenario, string][] = [
  ['normal', 'Normal'],
  ['peer_declines', 'Karşı taraf reddetsin'],
  ['connect_error', 'Bağlantı kurulamasın'],
  ['drop', 'Görüşme 5 sn sonra kopsun'],
];

export default function HemenTanis() {
  const { me } = useApp();
  const m = useMatch();
  const media = useMedia();
  const [filter, setFilter] = useState<MatchFilter>(m.filter);
  const [showTest, setShowTest] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  const searching = m.phase === 'searching';

  useEffect(() => {
    if (!searching) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [searching, spin]);

  const start = (mode: MatchMode) => {
    resetMatch();
    startMatch(mode, filter);
  };
  const terminal = ['declined', 'error', 'busy', 'cancelled', 'completed'].includes(m.phase);
  const pending = ['found', 'awaiting_peer', 'connecting'].includes(m.phase);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Hemen Tanış" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={s.chips}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipOn]} disabled={searching || pending}>
              <Text style={[s.chipText, filter === f && { color: '#fff' }]}>{f}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.stage}>
          {pending ? (
            <IncomingCard inline />
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', width: 240, height: 240 }}>
              {searching &&
                [0, 1, 2].map((i) => (
                  <Animated.View
                    key={i}
                    style={[
                      s.radar,
                      {
                        opacity: spin.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                        transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.5 + i * 0.25, 1.3 + i * 0.25] }) }],
                      },
                    ]}
                  />
                ))}
              <LinearGradient colors={gradient} style={s.meRing}>
                <Image source={{ uri: me.avatar }} style={s.meAvatar} />
              </LinearGradient>
            </View>
          )}
          <Text style={s.status} accessibilityLiveRegion="polite">
            {searching ? `${modeLabel(m.mode)} · ${PHASE_LABEL.searching}…` : terminal ? (m.message ?? PHASE_LABEL[m.phase]) : pending ? '' : `${USERS.filter((u) => u.online).length * 1_287} kişi çevrimiçi`}
          </Text>
        </View>

        {searching ? (
          <>
            <Pressable style={s.cancel} onPress={cancelMatch} accessibilityLabel="Aramayı iptal et">
              <Text style={s.cancelText}>Aramayı iptal et</Text>
            </Pressable>
            <Text style={s.hint}>Ararken uygulamada gezinebilir, bir odaya girebilirsin; eşleşme bulununca nerede olursan ol haber veririz.</Text>
          </>
        ) : (
          !pending && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StartButton mode="voice" onPress={() => start('voice')} />
              <StartButton mode="video" onPress={() => start('video')} />
            </View>
          )
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>Nasıl çalışır?</Text>
          <Text style={s.line}>• Arama ve karşı tarafın kabulünü beklerken ücret yok; ücret görüşme bağlandığı an başlar.</Text>
          <Text style={s.line}>
            • Sesli 🪙 {priceOf('voice')}/dk, görüntülü 🪙 {priceOf('video')}/dk. İlk {MATCH_GRACE_SECONDS} saniyede kopan görüşmenin ücreti iade edilir.
          </Text>
          <Text style={s.line}>• Bir odadaysan kabul edince odadan çıkmazsın: mikrofon koltuğundan inersin, oda kameran kapanır, dinleyici olarak kalırsın.</Text>
          <Text style={s.line}>• Görüşme bitince mikrofon ve kamera kendiliğinden açılmaz.</Text>
          {media.call && <Text style={[s.line, { color: colors.gold }]}>• Şu an bire bir görüşmedesin; bitene kadar yeni eşleşme başlatılamaz.</Text>}
        </View>

        <Pressable onPress={() => setShowTest((v) => !v)} accessibilityLabel="Test senaryoları">
          <Text style={s.testToggle}>{showTest ? '▾' : '▸'} Test senaryosu (demo)</Text>
        </Pressable>
        {showTest && (
          <View style={s.card}>
            <View style={s.chips}>
              {SCENARIOS.map(([k, l]) => (
                <Pressable key={k} onPress={() => setScenario(k)} style={[s.chip, m.scenario === k && s.chipOn]}>
                  <Text style={[s.chipText, m.scenario === k && { color: '#fff' }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.cardTitle}>Durum geçmişi</Text>
            {m.log.length === 0 ? (
              <Text style={s.line}>Henüz bir eşleşme yok.</Text>
            ) : (
              m.log.slice(0, 10).map((l, i) => (
                <Text key={i} style={s.line}>
                  {l.at} · {PHASE_LABEL[l.phase]}
                  {l.note ? ` (${l.note})` : ''}
                </Text>
              ))
            )}
          </View>
        )}
        {m.phase === 'completed' && m.last && (
          <Pressable onPress={() => router.push('/tanis')}>
            <Text style={s.testToggle}>Son görüşmenin özeti ›</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StartButton({ mode, onPress }: { mode: MatchMode; onPress: () => void }) {
  const video = mode === 'video';
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityLabel={`${modeLabel(mode)} başlat`}>
      <LinearGradient colors={video ? ['#FF6576', '#C93C4F'] : gradient} style={s.start}>
        <Ionicons name={video ? 'videocam' : 'mic'} size={28} color={video ? '#fff' : semantic.actionInk} />
        <Text style={[s.startTitle, !video && { color: semantic.actionInk }]}>{modeLabel(mode)}</Text>
        <Text style={[s.startSub, !video && { color: semantic.actionInk }]}>🪙 {priceOf(mode)}/dk · bağlanınca</Text>
      </LinearGradient>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  stage: { alignItems: 'center', gap: 10, minHeight: 280, justifyContent: 'center' },
  radar: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 2, borderColor: semantic.action },
  meRing: { width: 120, height: 120, borderRadius: 60, padding: 4 },
  meAvatar: { flex: 1, borderRadius: 60, borderWidth: 3, borderColor: colors.bg },
  status: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  start: { borderRadius: 20, paddingVertical: 18, alignItems: 'center', gap: 4 },
  startTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  startSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  cancel: { backgroundColor: colors.card, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#fff', fontWeight: '800' },
  hint: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 2 },
  line: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  testToggle: { color: semantic.tonalText, fontWeight: '800', textAlign: 'center' },
});
