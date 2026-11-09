// A call that rings for me, on every screen (live build, lib/live/one-on-one): who calls, voice or video, what it
// earns or costs, answer or decline. Answering opens the call screen. Also starts reading the open call.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { priceLine } from '@/components/call-stage';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { hangUp, liveCalls, MODE_NAME, otherId, useCall, watchCalls } from '@/lib/live/one-on-one';
import { colors, semantic } from '@/theme';

export function IncomingCall() {
  useEffect(() => (liveCalls() ? watchCalls() : undefined), []);
  const call = useCall();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  if (!liveCalls() || !call || !call.incoming || call.status !== 'ringing' || path.startsWith('/arama')) return null;
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
          <Text style={s.dim} numberOfLines={1}>
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
