// Hemen Tanış in a live build (/eslesme): random voice or video matches on the server (lib/live/one-on-one).
// The server pairs, charges and ends; this screen picks the mode, waits in the queue (asking every few seconds,
// or the server drops me), and shows the match. Non-streamers get a few free matches a day (each a short one);
// after that every minute is charged. The first use asks for an 18+ confirmation (kept on this phone).
// Leaving the screen leaves the queue and ends the match.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallStage, Ctrl } from '@/components/call-stage';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { joinCallMedia, leaveCallMedia } from '@/lib/call-media';
import { callToken, currentCall, dismissCall, endText, hangUp, isOpen, joinMatch, leaveMatch, matchState, MODE_NAME, otherId, refusal, useCall, type CallMode, type CallView, type MatchRights } from '@/lib/live/one-on-one';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const ADULT_KEY = 'similarclub:match-18';
/** The queue forgets a phone that doesn't ask for 12 s (server/api/one-on-one.mjs QUEUE_S). */
const POLL_MS = 2_500;

type Phase = 'pick' | 'waiting' | 'matched';

export function LiveMatch() {
  const { me, settings } = useApp();
  const { colors, gradient } = useTheme();
  const s = useStyles();
  const current = useCall();
  const [adult, setAdult] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [mode, setMode] = useState<CallMode>('voice');
  const [rights, setRights] = useState<MatchRights | null>(null);
  const [error, setError] = useState<{ text: string; coins: boolean } | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // My match as last seen (the store moves on once another call rings).
  const [kept, setKept] = useState<CallView | null>(null);
  if (current && current.id === matchId && current !== kept) setKept(current);
  const match = matchId && kept?.id === matchId ? kept : null;
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const take = (r: Awaited<ReturnType<typeof matchState>>) => {
    setRights(r.rights);
    if (r.state === 'matched' && r.call) {
      setMatchId(r.call.id);
      setPhase('matched');
    } else if (r.state === 'waiting') setPhase('waiting');
    else if (phaseRef.current === 'waiting') setPhase('pick');
  };

  useEffect(() => {
    void AsyncStorage.getItem(ADULT_KEY)
      .then((v) => setAdult(v === '1'))
      .catch(() => setAdult(false));
    void matchState()
      .then(take)
      .catch(() => {});
  }, []);

  // Waiting: ask every few seconds (the server pairs me with whoever comes, or keeps me in the queue).
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => void matchState().then(take).catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Matched and live: join the voice and video. Over: leave them.
  const joined = useRef<number | null>(null);
  const status = match?.status;
  useEffect(() => {
    if (!match) return;
    if (status === 'live' && joined.current !== match.id) {
      const id = match.id;
      joined.current = id;
      void callToken(id)
        .then((token) => joinCallMedia(id, token, match.mode === 'video', otherId(match)))
        .catch(() => (joined.current = null));
    }
    if (status && !isOpen(match)) {
      leaveCallMedia();
      void matchState()
        .then((r) => setRights(r.rights))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, match?.id]);

  // Leaving the screen: out of the queue, the match ends.
  useEffect(
    () => () => {
      leaveCallMedia();
      const c = currentCall();
      if (c?.kind === 'match' && isOpen(c)) void hangUp(c.id).catch(() => {});
      else if (phaseRef.current === 'waiting') void leaveMatch().catch(() => {});
      if (c?.kind === 'match') dismissCall(c.id);
    },
    [],
  );

  const start = async (m: CallMode) => {
    if (starting) return;
    setMode(m);
    setError(null);
    setStarting(true);
    try {
      if (matchId) dismissCall(matchId);
      setMatchId(null);
      take(await joinMatch(m));
    } catch (e) {
      setError(refusal(e));
      setPhase('pick');
    } finally {
      setStarting(false);
    }
  };
  const cancel = () => {
    setPhase('pick');
    void leaveMatch()
      .then(take)
      .catch(() => {});
  };
  const end = () => match && isOpen(match) && void hangUp(match.id).catch(() => {});
  const next = async () => {
    if (match && isOpen(match)) await hangUp(match.id).catch(() => {});
    void start(match?.mode ?? mode);
  };

  if (match?.status === 'live') {
    return <CallStage call={match} onEnd={end} extra={<Ctrl icon="play-skip-forward" label="Sıradaki" onPress={() => void next()} />} />;
  }

  const minor = me.age > 0 && me.age < 18;
  const still = settings.reduceMotion || settings.effectsOff;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Hemen Tanış" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {minor ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Hemen Tanış 18 yaş ve üzeri içindir</Text>
            <Text style={s.line}>Sesli odalarda konuşabilir, takip ettiğin kişilerle mesajlaşabilirsin.</Text>
          </View>
        ) : adult === false ? (
          <AdultGate onAccept={() => (setAdult(true), void AsyncStorage.setItem(ADULT_KEY, '1').catch(() => {}))} />
        ) : adult === null ? null : (
          <>
            <View style={s.stage}>
              <Radar on={phase === 'waiting'} still={still} />
              <LinearGradient colors={gradient} style={s.meRing}>
                <Photo uri={me.avatar || undefined} kind="face" seed="me" style={s.meAvatar} />
              </LinearGradient>
              <Text style={s.status} accessibilityLiveRegion="polite">
                {phase === 'waiting' ? `${MODE_NAME[mode]} · sana uygun biri aranıyor…` : match ? endText(match) : 'Rastgele biriyle sesli ya da görüntülü tanış'}
              </Text>
            </View>

            {error && (
              <View style={[s.card, { borderColor: colors.red, borderWidth: 1 }]}>
                <Text style={s.line}>{error.text}</Text>
                {error.coins && <Button title="Jeton yükle" small onPress={() => router.push('/cuzdan')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
              </View>
            )}

            {phase === 'waiting' ? (
              <Pressable style={s.cancel} onPress={cancel} accessibilityLabel="Aramayı iptal et">
                <Text style={s.cancelText}>Aramayı iptal et</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StartButton mode="voice" rights={rights} busy={starting} onPress={() => void start('voice')} />
                <StartButton mode="video" rights={rights} busy={starting} onPress={() => void start('video')} />
              </View>
            )}

            {rights && <Rights rights={rights} />}

            <View style={s.card}>
              <Text style={s.cardTitle}>Güvenliğin için</Text>
              <Text style={s.line}>• Görüşmede sağ üstteki kalkan simgesiyle karşındakini her an şikâyet edebilir veya engelleyebilirsin.</Text>
              <Text style={s.line}>• Engellediğin kişiyle bir daha eşleşmezsin.</Text>
              <Text style={s.line}>• Uygunsuz görüntü, taciz veya iletişim bilgisi isteme hesabının kapanmasına yol açar.</Text>
              <Text style={s.line}>• Bir odadaysan görüşme başlayınca odadan çıkarsın.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Rights({ rights }: { rights: MatchRights }) {
  const s = useStyles();
  const { colors } = useTheme();
  if (rights.streamer) {
    return (
      <View style={s.card}>
        <Text style={s.cardTitle}>Yayıncı olarak eşleşmelerin ücretsiz</Text>
        <Text style={s.line}>Karşındaki kişi dakika ücretini öderse her dakika için elmas kazanırsın.</Text>
      </View>
    );
  }
  const at = rights.nextFreeAt ? new Date(rights.nextFreeAt) : null;
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="gift-outline" size={18} color={colors.gold} />
        <Text style={s.cardTitle}>
          Ücretsiz hakkın: {rights.freeLeft}/{rights.free}
        </Text>
      </View>
      <Text style={s.line}>
        Her gün {rights.free} ücretsiz eşleşme hakkın var, her biri en çok {rights.seconds} saniye. Sesli ya da görüntülü kullanabilirsin.
      </Text>
      <Text style={s.line}>
        Haklar bitince dakikası sesli {rights.price.voice.toLocaleString('tr-TR')}, görüntülü {rights.price.video.toLocaleString('tr-TR')} jeton. Ücret eşleşme bağlandığında başlar.
      </Text>
      {rights.freeLeft === 0 && at && (
        <Text style={[s.line, { color: colors.gold }]}>
          Yeni ücretsiz hak: {at.toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
}

function AdultGate({ onAccept }: { onAccept: () => void }) {
  const s = useStyles();
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Başlamadan önce</Text>
      <Text style={s.line}>Hemen Tanış seni tanımadığın biriyle sesli ya da görüntülü görüşmeye bağlar. Yalnızca 18 yaş ve üzeri içindir.</Text>
      <Text style={s.line}>• Çıplaklık, cinsel içerik, taciz ve nefret söylemi yasaktır.</Text>
      <Text style={s.line}>• Görüşmeler kaydedilmez; şikâyet edilen görüşmeleri ekibimiz inceler.</Text>
      <Text style={s.line}>• Rahatsız olursan görüşmeyi bitir, şikâyet et veya engelle.</Text>
      <Button title="18 yaşından büyüğüm, kabul ediyorum" onPress={onAccept} style={{ marginTop: 8 }} />
    </View>
  );
}

function Radar({ on, still }: { on: boolean; still: boolean }) {
  const s = useStyles();
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    spin.setValue(0);
    if (!on || still) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [on, still, spin]);
  if (!on) return null;
  return (
    <>
      {[0, 1, 2].map((i) =>
        still ? (
          <View key={i} style={[s.radar, { opacity: 0.5 - i * 0.15, transform: [{ scale: 0.6 + i * 0.2 }] }]} />
        ) : (
          <Animated.View
            key={i}
            style={[s.radar, { opacity: spin.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.5 + i * 0.25, 1.3 + i * 0.25] }) }] }]}
          />
        ),
      )}
    </>
  );
}

function StartButton({ mode, rights, busy, onPress }: { mode: CallMode; rights: MatchRights | null; busy: boolean; onPress: () => void }) {
  const { semantic, gradient } = useTheme();
  const s = useStyles();
  const video = mode === 'video';
  const sub = !rights ? '' : rights.streamer ? 'Ücretsiz' : rights.freeLeft > 0 ? `Ücretsiz · ${rights.seconds} sn` : `${rights.price[mode].toLocaleString('tr-TR')} jeton/dk`;
  return (
    <Pressable onPress={onPress} disabled={busy} style={{ flex: 1, opacity: busy ? 0.6 : 1 }} accessibilityLabel={`${MODE_NAME[mode]} eşleşme başlat`}>
      <LinearGradient colors={video ? ['#FF6576', '#C93C4F'] : gradient} style={s.start}>
        <Ionicons name={video ? 'videocam' : 'mic'} size={28} color={video ? '#fff' : semantic.actionInk} />
        <Text style={[s.startTitle, !video && { color: semantic.actionInk }]}>{MODE_NAME[mode]}</Text>
        {!!sub && <Text style={[s.startSub, !video && { color: semantic.actionInk }]}>{sub}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  stage: { alignItems: 'center', gap: 14, minHeight: 280, justifyContent: 'center' },
  radar: { position: 'absolute', top: 20, width: 240, height: 240, borderRadius: 120, borderWidth: 2, borderColor: semantic.action },
  meRing: { width: 120, height: 120, borderRadius: 60, padding: 4, marginTop: 80 },
  meAvatar: { flex: 1, borderRadius: 60, borderWidth: 3, borderColor: colors.bg },
  status: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12, marginTop: 50 },
  start: { borderRadius: 20, paddingVertical: 18, alignItems: 'center', gap: 4 },
  startTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  startSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  cancel: { backgroundColor: colors.card, borderRadius: 999, paddingVertical: 14, alignItems: 'center', ...lift },
  cancelText: { color: colors.text, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, ...(dark ? { borderWidth: 1, borderColor: colors.border } : lift) },
  cardTitle: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 2 },
  line: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
}));
