// A 1v1 voice or video call in a live build (/arama/[id]): the server rings, charges and ends it
// (lib/live/one-on-one); this screen shows it. Opened by the caller from a chat or a profile (it starts the call),
// or by the person called from the incoming call card (`call` is the call's id, `answer=1` answers it at once).
// Leaving the screen hangs up.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallStage, callStyles, mmss, priceLine, useSafetyMenu } from '@/components/call-stage';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { userById } from '@/data/mock';
import { joinCallMedia, leaveCallMedia } from '@/lib/call-media';
import { toServer } from '@/lib/live';
import { answerCall, callToken, currentCall, dismissCall, endText, hangUp, isOpen, MODE_NAME, refreshCall, refusal, startCall, useCall, type CallMode, type CallView } from '@/lib/live/one-on-one';
import { goBack } from '@/lib/nav';
import { colors } from '@/theme';

export function LiveCall() {
  const { id, mode, call: callParam, answer } = useLocalSearchParams<{ id: string; mode?: 'sesli' | 'goruntulu'; call?: string; answer?: string }>();
  const peer = userById(id);
  const callMode: CallMode = mode === 'sesli' ? 'voice' : 'video';
  const current = useCall();
  const [mine, setMine] = useState<number | null>(callParam ? Number(callParam) : null);
  const [refused, setRefused] = useState<{ text: string; coins: boolean } | null>(null);
  // The last state of my call, kept when the store moves on (another call rings after this one ended).
  const [kept, setKept] = useState<CallView | null>(null);
  if (current && current.id === mine && current !== kept) setKept(current);
  const call = mine && kept?.id === mine ? kept : null;

  // Start the call, or pick up the one this screen was opened for.
  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        if (callParam) {
          const want = Number(callParam);
          const c = currentCall()?.id === want ? currentCall() : await refreshCall();
          if (off || !c || c.id !== want) return;
          if (answer === '1' && c.incoming && c.status === 'ringing') await answerCall(c.id);
          return;
        }
        const to = toServer(id);
        if (!to) throw new Error('Bu kişi aranamaz');
        const c = await startCall(to, callMode);
        if (!off) setMine(c.id);
      } catch (e) {
        if (!off) setRefused(refusal(e));
      }
    })();
    return () => void (off = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: join the voice and video. Over: leave them.
  const joined = useRef<number | null>(null);
  const status = call?.status;
  const callId = call?.id;
  useEffect(() => {
    if (!callId) return;
    if (status === 'live' && joined.current !== callId) {
      joined.current = callId;
      void callToken(callId)
        .then((token) => joinCallMedia(callId, token, callMode === 'video' || call?.mode === 'video', id))
        .catch(() => (joined.current = null));
    }
    if (status && status !== 'live' && status !== 'ringing') leaveCallMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, callId]);

  // Leaving the screen hangs up and lets go of the voice and video.
  const mineRef = useRef(mine);
  useEffect(() => {
    mineRef.current = mine;
  }, [mine]);
  useEffect(
    () => () => {
      leaveCallMedia();
      const c = currentCall();
      if (mineRef.current && c?.id === mineRef.current && isOpen(c)) void hangUp(c.id).catch(() => {});
      if (mineRef.current) dismissCall(mineRef.current);
    },
    [],
  );

  const end = () => {
    if (call && isOpen(call)) void hangUp(call.id).catch(() => {});
    else close();
  };
  const close = () => {
    if (mine) dismissCall(mine);
    goBack();
  };

  if (refused) {
    return (
      <Shell avatar={peer.avatar} seed={peer.id}>
        <View style={styles.center}>
          <Photo uri={peer.avatar} kind="face" seed={peer.id} style={callStyles.bigAvatar} />
          <Text style={callStyles.name}>{peer.name}</Text>
          <Text style={callStyles.note}>{refused.text}</Text>
          <View style={styles.row}>
            {refused.coins && <Button title="Jeton yükle" onPress={() => router.replace('/cuzdan')} />}
            <Button title="Kapat" variant="tonal" onPress={() => goBack()} />
          </View>
        </View>
      </Shell>
    );
  }

  if (call?.status === 'live') return <CallStage call={call} onEnd={end} />;

  if (call && !isOpen(call)) {
    const seconds = call.startedAt && call.endedAt ? Math.max(0, Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000)) : 0;
    return (
      <Shell avatar={call.other.avatarUrl ?? peer.avatar} seed={peer.id}>
        <View style={styles.center}>
          <Photo uri={call.other.avatarUrl ?? peer.avatar} kind="face" seed={peer.id} style={callStyles.bigAvatar} />
          <Text style={callStyles.name}>{call.other.name}</Text>
          <Text style={callStyles.note}>{endText(call)}</Text>
          {call.startedAt && (
            <Text style={styles.summary}>
              Süre {mmss(seconds)}
              {call.iPay && call.coins > 0 ? ` · Harcanan ${call.coins.toLocaleString('tr-TR')} jeton` : ''}
            </Text>
          )}
          <Button title="Kapat" variant="tonal" onPress={close} style={{ marginTop: 8 }} />
        </View>
      </Shell>
    );
  }

  return <Ringing call={call} name={peer.name} avatar={peer.avatar} peer={peer.id} mode={call?.mode ?? callMode} onEnd={end} />;
}

/** Calling, or being called. */
function Ringing({ call, name, avatar, peer, mode, onEnd }: { call: CallView | null; name: string; avatar: string; peer: string; mode: CallMode; onEnd: () => void }) {
  const pulse = useState(() => new Animated.Value(0))[0];
  const [answering, setAnswering] = useState(false);
  const safety = useSafetyMenu(peer, call?.other.name ?? name, onEnd);
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const incoming = !!call?.incoming;
  const pickUp = () => {
    if (!call || answering) return;
    setAnswering(true);
    void answerCall(call.id)
      .catch(() => {})
      .finally(() => setAnswering(false));
  };

  return (
    <Shell avatar={call?.other.avatarUrl ?? avatar} seed={peer}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={callStyles.name}>{call?.other.name ?? name}</Text>
          <Text style={callStyles.sub}>
            {MODE_NAME[mode]} arama · {incoming ? 'Seni arıyor' : call ? 'Çalıyor…' : 'Aranıyor…'}
          </Text>
        </View>
        {safety.button}
      </View>
      <View style={styles.center}>
        <Animated.View style={[callStyles.ripple, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />
        <Photo uri={call?.other.avatarUrl ?? avatar} kind="face" seed={peer} style={callStyles.bigAvatar} />
        {call && <Text style={callStyles.note}>{priceLine(call)}</Text>}
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.actions}>
        <Round color={colors.red} icon="call" rotate label={incoming ? 'Reddet' : 'İptal'} onPress={onEnd} />
        {incoming && <Round color="#22C55E" icon={mode === 'video' ? 'videocam' : 'call'} label={answering ? 'Açılıyor…' : 'Cevapla'} onPress={pickUp} />}
      </View>
      {safety.sheet}
    </Shell>
  );
}

function Round({ color, icon, label, onPress, rotate }: { color: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; rotate?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onPress} style={[styles.round, { backgroundColor: color }]} accessibilityLabel={label}>
        <Ionicons name={icon} size={30} color="#fff" style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </Pressable>
      <Text style={styles.roundLabel}>{label}</Text>
    </View>
  );
}

function Shell({ avatar, seed, children }: { avatar: string; seed: string; children: React.ReactNode }) {
  return (
    <View style={callStyles.root}>
      <Photo uri={avatar} kind="face" seed={seed} style={StyleSheet.absoluteFill} blurRadius={30} />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }}>{children}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  center: { alignItems: 'center', marginTop: 80, gap: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  summary: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: 40 },
  round: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  roundLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
