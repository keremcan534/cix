// A call that rings for me, on every screen (live build, lib/live/one-on-one): who calls, voice or video, what it
// earns or costs, answer or decline. Answering opens the call screen. Also starts reading the open call.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { priceLine } from '@/components/call-stage';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { hangUp, liveCalls, MODE_NAME, otherId, useCall, watchCalls } from '@/lib/live/one-on-one';
import { colors, semantic } from '@/theme';

/** The buzz of a ringing call: wait, buzz, pause, buzz, then again from the start. */
const RING_BUZZ = [0, 600, 400, 600, 1200];
/** The server ends an unanswered call after 40 s (one-on-one.mjs RING_S): without a connection the phone never hears it. */
const RING_MAX_MS = 45_000;

/** Buzzes while the call rings on screen, and never past RING_MAX_MS even if the end of the call doesn't arrive. */
function useRingBuzz(ringing: boolean) {
  useEffect(() => {
    if (!ringing || Platform.OS !== 'android') return;
    const until = Date.now() + RING_MAX_MS;
    const ring = () => {
      if (AppState.currentState === 'active' && Date.now() < until) Vibration.vibrate(RING_BUZZ, true);
      else Vibration.cancel();
    };
    ring();
    const sub = AppState.addEventListener('change', ring);
    const stop = setTimeout(() => Vibration.cancel(), RING_MAX_MS);
    return () => {
      clearTimeout(stop);
      sub.remove();
      Vibration.cancel();
    };
  }, [ringing]);
}

export function IncomingCall() {
  useEffect(() => (liveCalls() ? watchCalls() : undefined), []);
  const call = useCall();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const ringing = liveCalls() && !!call && call.incoming && call.status === 'ringing' && !path.startsWith('/arama');
  useRingBuzz(ringing);
  if (!ringing) return null;
  const peer = otherId(call);
  const answer = () =>
    router.push({ pathname: '/arama/[id]', params: { id: peer, mode: call.mode === 'voice' ? 'sesli' : 'goruntulu', call: String(call.id), answer: '1' } });
  const decline = () => {
    if (busy) return;
    setBusy(true);
    void hangUp(call.id)
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <SafeAreaView edges={['top']} style={s.wrap} pointerEvents="box-none">
      <View style={s.card} accessibilityLiveRegion="assertive">
        <Photo uri={call.other.avatarUrl ?? undefined} kind="face" seed={peer} style={s.photo} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>
            {call.other.name}
          </Text>
          {/* Wraps instead of cutting: what the call earns or costs comes last and is read before answering. */}
          <Text style={s.dim} numberOfLines={4}>
            {MODE_NAME[call.mode]} arıyor · {priceLine(call)}
          </Text>
        </View>
        <Pressable onPress={decline} style={[s.btn, { backgroundColor: colors.red }]} accessibilityLabel="Aramayı reddet">
          <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
        <Pressable onPress={answer} style={[s.btn, { backgroundColor: semantic.success }]} accessibilityLabel="Aramayı cevapla">
          <Ionicons name={call.mode === 'video' ? 'videocam' : 'call'} size={20} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#101B2E', borderRadius: 22, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  photo: { width: 46, height: 46, borderRadius: 23 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dim: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
