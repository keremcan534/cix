// Anlık Kulüp reveal (lib/club). A short radar scan, then the five people most like you land around your
// avatar one by one with their match score, the club gets its name and question, and one tap seats you
// with them in a room that is already saying hello. "Başka kişiler" builds the next round.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SCENES } from '@/components/fx/scenes';
import { Backdrop, Glass, glow } from '@/components/fx/surface';
import { Avatar, GradientButton } from '@/components/ui';
import { buildClub, setClubHidden, type Club } from '@/lib/club';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import { goBack } from '@/lib/nav';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const ORBIT = 300;
const RADIUS = 112;
const SCAN_MS = 1700;

export default function ClubScreen() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const { me, blocked, settings } = useApp();
  const [round, setRound] = useState(0);
  const club = useMemo(() => buildClub(me, { round, exclude: blocked }), [me, round, blocked]);
  const still = settings.reduceMotion || settings.effectsOff;
  // The last round whose scan has finished; a new round scans again. Reduced motion shows the club at once.
  const [shownRound, setShownRound] = useState(-1);
  const revealed = still || shownRound === round;

  useEffect(() => setClubHidden(blocked), [blocked]);

  useEffect(() => {
    if (still) return;
    const t = setTimeout(() => {
      setShownRound(round);
      successHaptic();
    }, SCAN_MS);
    return () => clearTimeout(t);
  }, [round, still]);

  const join = () => {
    tapHaptic();
    router.replace(`/oda/${club.roomId}`);
  };
  const reshuffle = () => {
    tapHaptic();
    setRound((r) => r + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.discover} strength={0.5} />
      <LinearGradient colors={['rgba(8,15,30,0.2)', 'rgba(8,15,30,0.85)', colors.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.top}>
          <Pressable onPress={() => goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={s.kicker}>ANLIK KULÜP · BUGÜN</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {welcome === '1' && (
            <View style={s.welcome}>
              <Text style={s.welcomeText}>🎉 Hoş geldin {me.name}! 100 jeton hesabına eklendi. Şimdi seni senin gibi insanlarla tanıştıralım.</Text>
            </View>
          )}

          <Orbit key={round} club={club} avatar={me.avatar} revealed={revealed} still={still} />

          {revealed ? (
            <FadeIn still={still} style={{ alignItems: 'center', gap: 6, alignSelf: 'stretch' }}>
              <Text style={s.name} accessibilityRole="header">
                {club.name}
              </Text>
              <View style={s.metaRow}>
                <View style={s.liveDot} />
                <Text style={s.meta}>
                  %{club.average} ortalama uyum · {club.members.length} kişi şu an çevrimiçi
                </Text>
              </View>

              <Glass style={s.question}>
                <Text style={s.questionLabel}>💬 Kulübün sorusu</Text>
                <Text style={s.questionText}>{club.icebreaker}</Text>
              </Glass>

              <View style={s.list}>
                {club.members.map((m) => (
                  <Pressable key={m.user.id} style={s.row} onPress={() => router.push(`/kullanici/${m.user.id}`)} accessibilityLabel={`${m.user.name}, yüzde ${m.score} benzer. ${m.reason}`}>
                    <Avatar uri={m.user.avatar} size={34} online />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowName}>
                        {m.user.name}, {m.user.age} <Text style={s.rowCity}>· {m.user.city}</Text>
                      </Text>
                      <Text style={s.rowReason} numberOfLines={1}>
                        {m.reason}
                      </Text>
                    </View>
                    <Text style={s.rowScore}>%{m.score}</Text>
                  </Pressable>
                ))}
              </View>
            </FadeIn>
          ) : (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Text style={s.scanTitle}>Seninle aynı frekanstaki insanlar aranıyor…</Text>
              <View style={s.chips}>
                {(me.interests ?? []).map((i) => (
                  <View key={i} style={s.chip}>
                    <Text style={s.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {revealed && (
          <View style={s.actions}>
            <GradientButton title="Kulübe katıl" icon="mic" onPress={join} />
            <Pressable onPress={reshuffle} style={s.secondary} accessibilityRole="button">
              <Ionicons name="shuffle" size={16} color={colors.primaryText} />
              <Text style={s.secondaryText}>Başka kişiler</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Your avatar with radar rings; the members fly out from the center to their place on the circle. */
function Orbit({ club, avatar, revealed, still }: { club: Club; avatar: string; revealed: boolean; still: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [fly] = useState(() => club.members.map(() => new Animated.Value(still ? 1 : 0)));

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  useEffect(() => {
    if (!revealed || still) return;
    Animated.stagger(
      130,
      fly.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 70, useNativeDriver: false })),
    ).start();
  }, [revealed, still, fly]);

  return (
    <View style={s.orbit} accessibilityElementsHidden={!revealed}>
      {[0, 1, 2].map((i) => {
        // Three rings a third of a cycle apart give a steady radar sweep.
        const p = Animated.modulo(Animated.add(pulse, i / 3), 1);
        return (
          <Animated.View
            key={i}
            style={[
              s.ring,
              still
                ? { opacity: 0.25, transform: [{ scale: 0.55 + i * 0.22 }] }
                : { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }] },
            ]}
          />
        );
      })}
      <View style={[s.me, glow('rgba(19,217,223,0.55)', 26, 0)]}>
        <Avatar uri={avatar} size={92} />
      </View>
      {club.members.map((m, i) => {
        const angle = (-90 + (360 / club.members.length) * i) * (Math.PI / 180);
        const x = Math.cos(angle) * RADIUS;
        const y = Math.sin(angle) * RADIUS;
        const v = fly[i];
        return (
          <Animated.View
            key={m.user.id}
            style={[
              s.member,
              {
                opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
                  { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
                  { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                ],
              },
            ]}
          >
            <View style={[s.memberRing, glow('rgba(19,217,223,0.4)', 14, 0)]}>
              <Avatar uri={m.user.avatar} size={54} />
            </View>
            <View style={s.badge}>
              <Text style={s.badgeText}>%{m.score}</Text>
            </View>
          </Animated.View>
        );
      })}
      {revealed && club.topics.length > 0 && (
        <View style={s.topicTag}>
          <Text style={s.topicText}>{club.topics.join(' · ')}</Text>
        </View>
      )}
    </View>
  );
}

function FadeIn({ children, style, still }: { children: ReactNode; style?: object; still: boolean }) {
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.timing(v, { toValue: 1, duration: 420, delay: 650, useNativeDriver: false }).start();
  }, [v, still]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6 },
  kicker: { color: colors.primaryText, fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  body: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  welcome: { alignSelf: 'stretch', backgroundColor: 'rgba(246,189,96,0.14)', borderColor: 'rgba(246,189,96,0.45)', borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 6 },
  welcomeText: { color: colors.gold, fontWeight: '700', fontSize: 13, lineHeight: 18 },
  orbit: { width: ORBIT, height: ORBIT, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: ORBIT, height: ORBIT, borderRadius: ORBIT / 2, borderWidth: 2, borderColor: colors.primaryText },
  me: { borderRadius: 50, borderWidth: 3, borderColor: colors.primaryText, padding: 2 },
  member: { position: 'absolute', alignItems: 'center' },
  memberRing: { borderRadius: 32, borderWidth: 2, borderColor: colors.primaryText, padding: 2, backgroundColor: colors.bg },
  badge: { marginTop: -10, backgroundColor: colors.primaryText, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { color: colors.bg, fontWeight: '900', fontSize: 11 },
  topicTag: { position: 'absolute', bottom: 2, backgroundColor: 'rgba(8,15,30,0.7)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(19,217,223,0.4)' },
  topicText: { color: colors.primaryText, fontSize: 11, fontWeight: '800' },
  scanTitle: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  name: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  meta: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  question: { alignSelf: 'stretch', borderRadius: 16, padding: 14, marginTop: 8, gap: 4, borderWidth: 1, borderColor: 'rgba(19,217,223,0.3)' },
  questionLabel: { color: colors.primaryText, fontSize: 12, fontWeight: '800' },
  questionText: { color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 23 },
  list: { alignSelf: 'stretch', marginTop: 6, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  rowName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rowCity: { color: colors.textDim, fontWeight: '600' },
  rowReason: { color: colors.textDim, fontSize: 12 },
  rowScore: { color: semantic.action, fontWeight: '900', fontSize: 15 },
  actions: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 6, gap: 4 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  secondaryText: { color: colors.primaryText, fontWeight: '800', fontSize: 14 },
});
